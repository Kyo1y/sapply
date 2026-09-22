import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { jobsTable } from './db/schema';
import * as schema from './db/schema';
import { desc } from 'drizzle-orm';
import { listCompanies } from './db/company-repository';

type ImportJobRequest = {
  url: string;
}

const app = new Hono<{ Bindings: CloudflareBindings }>();

/** Checks the JSON shape accepted by the manual job-import endpoint. */
function isImportJobRequest(value: unknown): value is ImportJobRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    typeof value.url === 'string'
  )
}

/** Accepts only valid HTTP and HTTPS URLs and returns their canonical form. */
function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value)

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }

    return url
  } catch {
    return null
  }
}

app.post('/jobs/import', async (c) => {
  const db = drizzle(c.env.job_app_db, { schema });
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Request must be a valid JSON'}, 400);
  }
  if (!isImportJobRequest(body)) {
    return c.json({ error: 'A URL is required'}, 400);
  }

  const url = parseHttpUrl(body.url)?.toString();

  if (url == null) {
    return c.json({ error: 'URL must use HTTP or HTTPS protocol'}, 400);
  }


  const job = await db.insert(jobsTable).values(
    { 
      id: crypto.randomUUID(), 
      sourceUrl: url 
    }
  )
  .onConflictDoNothing({ target: jobsTable.sourceUrl })
  .returning()
  .get()

  if (job) {
    return c.json({ job }, 202);
  }
  else {
    const existingJob = await db.query.jobsTable.findFirst(
      { where: (jobsTable, { eq }) => eq(jobsTable.sourceUrl, url) }
    );
    return c.json({ job: existingJob }, 200);
  }
});

app.get('/all-jobs', async (c) => {
  const db = drizzle(c.env.job_app_db, { schema });
  const allJobs = await db
  .select()
  .from(jobsTable)
  .orderBy(desc(jobsTable.createdAt))
  return c.json({ jobs: allJobs }, 200);
});

app.get('/companies', async (c) => {
  const companies = await listCompanies(c.env.job_app_db);
  return c.json({ companies }, 200);
});

const worker = {
  fetch: app.fetch,
} satisfies ExportedHandler<CloudflareBindings>

export default worker
