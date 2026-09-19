import { jobsTable } from '../db/schema';

export type Job = typeof jobsTable.$inferSelect;