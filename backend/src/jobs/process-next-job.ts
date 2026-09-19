import { drizzle } from "drizzle-orm/d1";
import { jobsTable } from '../db/schema';
import { eq } from "drizzle-orm";
import claimOldestJob from "./claim-oldest-job";
import fetchJob from "./fetch-job-posting";
import * as schema from '../db/schema';
import type { Job } from "../types/job";

export default async function processNext(d1: D1Database): Promise<{ job: Job, jobHtml: string } | undefined> {
    const claimed = await claimOldestJob(d1);
    if (!claimed) {
        return undefined;
    }
    try {
        const jobHtml: string = await fetchJob(claimed.sourceUrl);
        const db = drizzle(d1, { schema });
        await db.update(jobsTable)
            .set({ postingHtml: jobHtml, updatedAt: new Date(), lastError: null })
            .where(eq(jobsTable.id, claimed.id))

        return { job: claimed, jobHtml }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const db = drizzle(d1, { schema });
        await db.update(jobsTable)
            .set({ ingestionStatus: "failed", updatedAt: new Date(), lastError: errorMessage })
            .where(eq(jobsTable.id, claimed.id));
        throw error;
    }
}
