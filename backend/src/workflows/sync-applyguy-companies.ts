import detectCompanySource from '../companies/detect-company-source';
import normalizeCompanyName from '../companies/normalize-company-name';
import {
    syncDiscoveredCompanies,
    type CompanySeed,
    type CompanySyncResult,
} from '../db/company-repository';
import fetchApplyGuyCompanyFeed from '../integrations/applyguy/applyguy-client';
import type { DetectedCompanySource } from '../types/company';

export type ApplyGuyCompanySyncResult = CompanySyncResult & {
    feedUpdatedAt: string | null;
    jobsRead: number;
    jobsRejected: number;
};

type CompanySeedBuilder = {
    name: string;
    normalizedName: string;
    detectedSources: Map<string, DetectedCompanySource>;
};

/**
 * Reads the ApplyGuy feed and syncs its companies and detected career boards
 * into our company registry.
 */
export default async function syncApplyGuyCompanies(
    d1: D1Database,
): Promise<ApplyGuyCompanySyncResult> {
    const feed = await fetchApplyGuyCompanyFeed();
    const seedByNormalizedName = new Map<string, CompanySeedBuilder>();

    for (const observation of feed.observations) {
        const normalizedName = normalizeCompanyName(observation.name);

        if (normalizedName.length === 0) {
            continue;
        }

        const existing = seedByNormalizedName.get(normalizedName);
        const seed = existing ?? {
            name: observation.name,
            normalizedName,
            detectedSources: new Map<string, DetectedCompanySource>(),
        };

        if (observation.listingUrl) {
            const detectedSource = detectCompanySource(observation.listingUrl);

            if (detectedSource) {
                seed.detectedSources.set(
                    `${detectedSource.provider}:${detectedSource.externalKey}`,
                    detectedSource,
                );
            }
        }

        seedByNormalizedName.set(normalizedName, seed);
    }

    const seeds: CompanySeed[] = Array.from(seedByNormalizedName.values()).map(
        (seed) => ({
            name: seed.name,
            normalizedName: seed.normalizedName,
            domain: null,
            discoverySource: 'applyguy',
            detectedSources: Array.from(seed.detectedSources.values()),
        }),
    );

    const result = await syncDiscoveredCompanies(d1, seeds);

    return {
        ...result,
        feedUpdatedAt: feed.updatedAt,
        jobsRead: feed.observations.length,
        jobsRejected: feed.rejectedJobs,
    };
}
