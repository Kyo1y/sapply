import { drizzle } from "drizzle-orm/d1";
import { jobsTable } from '../db/schema';
import { eq, asc, and } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Job } from "../types/job";


export default async function claimOldestJob(d1: D1Database): Promise<Job | undefined> {
    const db = drizzle(d1, { schema });
    const oldestQueuedJob = await db
        .select()
        .from(jobsTable)
        .where(eq(jobsTable.ingestionStatus, 'queued'))
        .orderBy(asc(jobsTable.createdAt))
        .limit(1)
        .get();
    if (!oldestQueuedJob) {
        return undefined;
    }
    const claimed = await db.update(jobsTable)
        .set({ ingestionStatus: "processing", updatedAt: new Date() })
        .where(and(
        eq(jobsTable.id, oldestQueuedJob.id),
        eq(jobsTable.ingestionStatus, 'queued')
        ))
        .returning()
        .get();
    return claimed ?? undefined;
}
