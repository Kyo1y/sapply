import { env } from 'node:process';
import { expect, it } from 'vitest';
import { getJobDetails } from '../src/integrations/workday/workday-client.ts';

// WORKDAY_JOB_URL=<public listing URL> npx vitest run scripts/workday-client.live.test.mjs
const sourceUrl = env.WORKDAY_JOB_URL ?? '';
it.skipIf(!sourceUrl)('loads a live public Workday posting', async () => {
    const candidate = await getJobDetails(sourceUrl, 'Live Workday employer');
    expect(candidate.provider).toBe('workday');
    expect(candidate.descriptionHtml?.length).toBeGreaterThan(0);
    expect(candidate.postingTime.kind).toBe('calendar-date');
}, 30_000);
