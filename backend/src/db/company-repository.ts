import { asc, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import {
    companiesTable,
    companyDiscoveriesTable,
    companySourcesTable,
} from './schema';
import * as schema from './schema';
import type { Company, DetectedCompanySource } from '../types/company';
import matchCompany, {
    type CompanyMatchCandidate,
} from '../companies/match-company';

export type CompanySeed = {
    name: string;
    normalizedName: string;
    domain: string | null;
    discoverySource: 'applyguy';
    detectedSources: DetectedCompanySource[];
};

export type CompanySyncResult = {
    companiesSeen: number;
    companiesCreated: number;
    sourcesDetected: number;
    sourcesCreated: number;
};

const WRITE_CHUNK_SIZE = 10;
const READ_CHUNK_SIZE = 50;

/** Splits large database operations into smaller D1 requests. */
function chunksOf<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let start = 0; start < items.length; start += size) {
        chunks.push(items.slice(start, start + size));
    }

    return chunks;
}

/** Returns every registered company in alphabetical order. */
export async function listCompanies(d1: D1Database): Promise<Company[]> {
    const db = drizzle(d1, { schema });
    return db.select().from(companiesTable).orderBy(asc(companiesTable.name));
}

/**
 * Matches company observations from a feed to the registry, then stores new
 * companies, their official career boards, and the feed that found them.
 */
export async function syncDiscoveredCompanies(
    d1: D1Database,
    seeds: CompanySeed[],
): Promise<CompanySyncResult> {
    if (seeds.length === 0) {
        return {
            companiesSeen: 0,
            companiesCreated: 0,
            sourcesDetected: 0,
            sourcesCreated: 0,
        };
    }

    const db = drizzle(d1, { schema });
    const now = new Date();
    const existingCompanies = await db.select().from(companiesTable);
    const existingSources = await db
        .select({
            companyId: companySourcesTable.companyId,
            provider: companySourcesTable.provider,
            externalKey: companySourcesTable.externalKey,
        })
        .from(companySourcesTable);
    const sourceKeysByCompany = new Map<string, Set<string>>();

    for (const source of existingSources) {
        const keys = sourceKeysByCompany.get(source.companyId) ?? new Set<string>();
        keys.add(`${source.provider}:${source.externalKey}`);
        sourceKeysByCompany.set(source.companyId, keys);
    }

    const candidates: CompanyMatchCandidate[] = existingCompanies.map((company) => ({
        id: company.id,
        normalizedName: company.normalizedName,
        domain: company.domain,
        sourceKeys: sourceKeysByCompany.get(company.id) ?? new Set<string>(),
    }));
    const companyById = new Map(existingCompanies.map((company) => [
        company.id,
        company,
    ]));
    const companyBySeedName = new Map<string, Company>();
    const newCompanies: Company[] = [];

    for (const seed of seeds) {
        const match = matchCompany(seed, candidates);

        if (match.kind === 'matched') {
            const company = companyById.get(match.companyId);

            if (company) {
                companyBySeedName.set(seed.normalizedName, company);
                continue;
            }
        }

        const company: Company = {
            id: crypto.randomUUID(),
            name: seed.name,
            normalizedName: seed.normalizedName,
            domain: seed.domain,
            resolutionStatus: 'unresolved',
            createdAt: now,
            updatedAt: now,
        };
        const sourceKeys = new Set(seed.detectedSources.map((source) =>
            `${source.provider}:${source.externalKey}`,
        ));

        newCompanies.push(company);
        companyById.set(company.id, company);
        companyBySeedName.set(seed.normalizedName, company);
        candidates.push({
            id: company.id,
            normalizedName: company.normalizedName,
            domain: company.domain,
            sourceKeys,
        });
    }

    let companiesCreated = 0;

    for (const chunk of chunksOf(newCompanies, WRITE_CHUNK_SIZE)) {
        const inserted = await db
            .insert(companiesTable)
            .values(chunk.map((company) => ({
                id: company.id,
                name: company.name,
                normalizedName: company.normalizedName,
                domain: company.domain,
            })))
            .onConflictDoNothing({ target: companiesTable.normalizedName })
            .returning({ id: companiesTable.id });

        companiesCreated += inserted.length;
    }

    for (const chunk of chunksOf(newCompanies, READ_CHUNK_SIZE)) {
        const storedCompanies = await db
            .select()
            .from(companiesTable)
            .where(inArray(
                companiesTable.normalizedName,
                chunk.map((company) => company.normalizedName),
            ));

        for (const company of storedCompanies) {
            companyBySeedName.set(company.normalizedName, company);
        }
    }

    const discoveries = seeds.flatMap((seed) => {
        const company = companyBySeedName.get(seed.normalizedName);

        if (!company) {
            return [];
        }

        return [{
            id: crypto.randomUUID(),
            companyId: company.id,
            discoverySource: seed.discoverySource,
            observedName: seed.name,
            firstSeenAt: now,
            lastSeenAt: now,
        }];
    });

    for (const chunk of chunksOf(discoveries, WRITE_CHUNK_SIZE)) {
        await db
            .insert(companyDiscoveriesTable)
            .values(chunk)
            .onConflictDoUpdate({
                target: [
                    companyDiscoveriesTable.companyId,
                    companyDiscoveriesTable.discoverySource,
                ],
                set: { lastSeenAt: now },
            });
    }

    const detectedSources = seeds.flatMap((seed) => {
        const company = companyBySeedName.get(seed.normalizedName);

        if (!company) {
            return [];
        }

        return seed.detectedSources.map((source) => ({
            id: crypto.randomUUID(),
            companyId: company.id,
            provider: source.provider,
            externalKey: source.externalKey,
            sourceUrl: source.sourceUrl,
        }));
    });

    let sourcesCreated = 0;

    for (const chunk of chunksOf(detectedSources, WRITE_CHUNK_SIZE)) {
        const inserted = await db
            .insert(companySourcesTable)
            .values(chunk)
            .onConflictDoNothing({
                target: [
                    companySourcesTable.provider,
                    companySourcesTable.externalKey,
                ],
            })
            .returning({ id: companySourcesTable.id });

        sourcesCreated += inserted.length;
    }

    return {
        companiesSeen: seeds.length,
        companiesCreated,
        sourcesDetected: detectedSources.length,
        sourcesCreated,
    };
}
