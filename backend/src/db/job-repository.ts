import { and, eq, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import { jobsTable } from './schema';
import type { DiscoveredJob } from '../types/job';

export type SaveDiscoveredJobsResult = {
    created: number;
    updated: number;
};

/**
 * Saves jobs found automatically on career boards.
 * A retry updates the existing row instead of creating a duplicate.
 */
export async function saveDiscoveredJobs(
    d1: D1Database,
    jobs: DiscoveredJob[],
    savedAt: Date,
): Promise<SaveDiscoveredJobsResult> {
    const db = drizzle(d1, { schema });
    let created = 0;
    let updated = 0;

    for (const job of jobs) {
        const inserted = await db
            .insert(jobsTable)
            .values({
                id: crypto.randomUUID(),
                ...job,
                ingestionStatus: 'ready',
                createdAt: savedAt,
                updatedAt: savedAt,
            })
            .onConflictDoNothing()
            .returning({ id: jobsTable.id })
            .get();

        if (inserted) {
            created += 1;
            continue;
        }

        const existing = await db
            .select({ id: jobsTable.id })
            .from(jobsTable)
            .where(or(
                eq(jobsTable.sourceUrl, job.sourceUrl),
                and(
                    eq(jobsTable.companySourceId, job.companySourceId),
                    eq(jobsTable.externalId, job.externalId),
                ),
            ))
            .limit(1)
            .get();

        if (!existing) {
            continue;
        }

        await db
            .update(jobsTable)
            .set({
                ...job,
                ingestionStatus: 'ready',
                lastError: null,
                updatedAt: savedAt,
            })
            .where(eq(jobsTable.id, existing.id));

        updated += 1;
    }

    return { created, updated };
}
