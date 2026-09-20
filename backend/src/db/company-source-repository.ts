import { and, asc, eq, ne, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import { companiesTable, companySourcesTable } from './schema';
import type { CompanySource } from '../types/company';

export async function findNextGreenhouseSource(
    d1: D1Database,
): Promise<CompanySource | undefined> {
    const db = drizzle(d1, { schema });

    return db
        .select()
        .from(companySourcesTable)
        .where(and(
            eq(companySourcesTable.provider, 'greenhouse'),
            or(
                ne(companySourcesTable.verificationStatus, 'verified'),
                eq(companySourcesTable.pollingEnabled, true),
            ),
        ))
        .orderBy(
            sql`${companySourcesTable.lastPolledAt} IS NOT NULL`,
            asc(companySourcesTable.lastPolledAt),
            asc(companySourcesTable.createdAt),
        )
        .limit(1)
        .get();
}

export async function recordSuccessfulSourcePoll(
    d1: D1Database,
    source: CompanySource,
    polledAt: Date,
): Promise<void> {
    const db = drizzle(d1, { schema });

    await db
        .update(companySourcesTable)
        .set({
            verificationStatus: 'verified',
            pollingEnabled: true,
            lastPolledAt: polledAt,
            lastSuccessfulPollAt: polledAt,
            lastError: null,
            updatedAt: polledAt,
        })
        .where(eq(companySourcesTable.id, source.id));

    await db
        .update(companiesTable)
        .set({ resolutionStatus: 'resolved', updatedAt: polledAt })
        .where(eq(companiesTable.id, source.companyId));
}

export async function recordFailedSourcePoll(
    d1: D1Database,
    source: CompanySource,
    polledAt: Date,
    error: string,
): Promise<void> {
    const db = drizzle(d1, { schema });
    const wasVerified = source.verificationStatus === 'verified';

    await db
        .update(companySourcesTable)
        .set({
            verificationStatus: wasVerified ? 'verified' : 'failed',
            pollingEnabled: wasVerified && source.pollingEnabled,
            lastPolledAt: polledAt,
            lastError: error,
            updatedAt: polledAt,
        })
        .where(eq(companySourcesTable.id, source.id));
}
