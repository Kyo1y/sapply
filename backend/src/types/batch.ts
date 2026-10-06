import type { batchTable } from '../db/schema';
import type { Job } from './job';

export type Batch = typeof batchTable.$inferSelect;

/** A newly created batch and the job rows updated to belong to it. */
export type JobBatch = {
    batch: Batch;
    jobs: Job[];
};
