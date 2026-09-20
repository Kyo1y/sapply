import { jobsTable } from '../db/schema';

export type Job = typeof jobsTable.$inferSelect;

export type DiscoveredJob = {
    companyId: string;
    companySourceId: string;
    externalId: string;
    sourceUrl: string;
    title: string;
    location: string | null;
    postedAt: Date;
    postingHtml: string;
};
