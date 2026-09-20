import {
    findNextGreenhouseSource,
    recordFailedSourcePoll,
    recordSuccessfulSourcePoll,
} from '../db/company-source-repository';
import { saveDiscoveredJobs } from '../db/job-repository';
import {
    getGreenhouseJob,
    listGreenhouseJobs,
} from '../integrations/greenhouse/greenhouse-client';
import {
    isEarlyCareerJob,
    isPotentialEarlyCareerJob,
    wasPublishedWithinLastDay,
} from '../jobs/early-career-policy';
import type { DiscoveredJob } from '../types/job';

export type GreenhouseDiscoveryResult = {
    sourceId: string;
    companyId: string;
    boardToken: string;
    jobsSeen: number;
    candidatesInspected: number;
    detailFailures: number;
    jobsEligible: number;
    jobsCreated: number;
    jobsUpdated: number;
};

export default async function discoverNextGreenhouseSource(
    d1: D1Database,
    options: {
        fetcher?: typeof fetch;
        now?: Date;
    } = {},
): Promise<GreenhouseDiscoveryResult | undefined> {
    const source = await findNextGreenhouseSource(d1);

    if (!source) {
        return undefined;
    }

    const now = options.now ?? new Date();
    const fetcher = options.fetcher ?? fetch;

    try {
        const jobs = await listGreenhouseJobs(source.externalKey, fetcher);
        const candidates = jobs.filter((job) =>
            isPotentialEarlyCareerJob(job, now),
        );
        const discoveredJobs: DiscoveredJob[] = [];
        let detailFailures = 0;

        for (const candidate of candidates) {
            try {
                const job = await getGreenhouseJob(
                    source.externalKey,
                    candidate.id,
                    fetcher,
                );

                if (
                    !wasPublishedWithinLastDay(job.postedAt, now) ||
                    !isEarlyCareerJob(job)
                ) {
                    continue;
                }

                discoveredJobs.push({
                    companyId: source.companyId,
                    companySourceId: source.id,
                    externalId: String(job.id),
                    sourceUrl: job.sourceUrl,
                    title: job.title,
                    location: job.location,
                    postedAt: job.postedAt,
                    postingHtml: job.postingHtml,
                });
            } catch {
                detailFailures += 1;
            }
        }

        const saved = await saveDiscoveredJobs(d1, discoveredJobs, now);
        await recordSuccessfulSourcePoll(d1, source, now);

        return {
            sourceId: source.id,
            companyId: source.companyId,
            boardToken: source.externalKey,
            jobsSeen: jobs.length,
            candidatesInspected: candidates.length,
            detailFailures,
            jobsEligible: discoveredJobs.length,
            jobsCreated: saved.created,
            jobsUpdated: saved.updated,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await recordFailedSourcePoll(d1, source, now, message);
        throw error;
    }
}
