import { createBatchForPendingJobs } from '../db/batch-repository';
import type { JobBatch } from '../types/batch';

const MINIMUM_JOB_COUNT = 10;
const MAXIMUM_WAIT_MS = 60 * 60 * 1000;

/** Groups all unbatched pending jobs once there are 10, or any has waited at least 60 minutes. */
export async function batchPendingJobs(
    d1: D1Database,
    now: Date = new Date(),
): Promise<JobBatch | null> {
    return createBatchForPendingJobs(d1, {
        minimumJobCount: MINIMUM_JOB_COUNT,
        pendingBefore: new Date(now.getTime() - MAXIMUM_WAIT_MS),
        createdAt: now,
    });
}
