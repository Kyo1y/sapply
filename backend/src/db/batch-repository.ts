import { and, count, eq, exists, isNull, lte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { JobBatch } from '../types/batch';
import { batchTable, jobsTable } from './schema';

/** Checks eligibility, creates a batch, and assigns all unbatched pending jobs in one transaction. */
export async function createBatchForPendingJobs(
    d1: D1Database,
    criteria: {
        minimumJobCount: number;
        pendingBefore: Date;
        createdAt: Date;
    },
): Promise<JobBatch | null> {
    const db = drizzle(d1);
    const batchId = crypto.randomUUID();

    const isUnbatchedPending = and(eq(jobsTable.status, 'pending'), isNull(jobsTable.batchId));

    // Define the checks without executing them yet.
    const pendingCountQuery = db
        .select({ count: count() })
        .from(jobsTable)
        .where(isUnbatchedPending);

    const overdueJobsQuery = db
        .select({ id: jobsTable.id })
        .from(jobsTable)
        .where(and(
            isUnbatchedPending,
            lte(jobsTable.pendingAt, criteria.pendingBefore),
        ));

    const shouldCreateBatch = sql`
        (${pendingCountQuery}) >= ${criteria.minimumJobCount}
        OR ${exists(overdueJobsQuery)}
    `;

    const batchExistsQuery = db
        .select({ id: batchTable.id })
        .from(batchTable)
        .where(eq(batchTable.id, batchId));

    // Insert one batch only if a threshold is met.
    const createBatchQuery = db
        .insert(batchTable)
        .select(sql`
            SELECT
                ${batchId},
                ${Math.floor(criteria.createdAt.getTime() / 1000)}
            WHERE ${shouldCreateBatch}
        `)
        .returning();

    // Assign jobs only if the preceding INSERT created that batch.
    const updateJobsQuery = db
        .update(jobsTable)
        .set({ batchId, updatedAt: criteria.createdAt })
        .where(and(isUnbatchedPending, exists(batchExistsQuery)))
        .returning();

    const [createdBatches, jobs] = await db.batch([
        createBatchQuery,
        updateJobsQuery,
    ]);

    const [batch] = createdBatches;
    if (!batch) return null;

    return { batch, jobs };
}
