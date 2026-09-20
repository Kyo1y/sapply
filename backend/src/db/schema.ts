import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from 'drizzle-orm';

export const companiesTable = sqliteTable("companies", {
    id:                 text().primaryKey(),
    name:               text().notNull(),
    normalizedName:     text().notNull().unique(),
    domain:             text(),
    resolutionStatus:   text({ enum: ['unresolved', 'resolved', 'disabled'] })
                            .notNull()
                            .default('unresolved'),
    createdAt:          integer({ mode: 'timestamp' })
                            .notNull()
                            .default(sql`(unixepoch())`),
    updatedAt:          integer({ mode: 'timestamp' })
                            .notNull()
                            .default(sql`(unixepoch())`),
});

/** Stores official company career boards that our scheduler can poll. */
export const companySourcesTable = sqliteTable("companySources", {
    id:                 text().primaryKey(),
    companyId:          text()
                            .notNull()
                            .references(() => companiesTable.id, { onDelete: 'cascade' }),
    provider:           text({ enum: ['greenhouse', 'ashby', 'lever', 'workday', 'custom'] })
                            .notNull(),
    externalKey:        text().notNull(),
    sourceUrl:          text().notNull(),
    verificationStatus:text({ enum: ['unverified', 'verified', 'failed'] })
                            .notNull()
                            .default('unverified'),
    pollingEnabled:     integer({ mode: 'boolean' }).notNull().default(false),
    lastPolledAt:       integer({ mode: 'timestamp' }),
    lastSuccessfulPollAt: integer({ mode: 'timestamp' }),
    lastError:          text(),
    createdAt:          integer({ mode: 'timestamp' })
                            .notNull()
                            .default(sql`(unixepoch())`),
    updatedAt:          integer({ mode: 'timestamp' })
                            .notNull()
                            .default(sql`(unixepoch())`),
}, (table) => [
    index("companySources_companyId_idx").on(table.companyId),
    uniqueIndex("companySources_provider_externalKey_unique")
        .on(table.provider, table.externalKey),
]);

/** Records which external feed introduced each company to our registry. */
export const companyDiscoveriesTable = sqliteTable("companyDiscoveries", {
    id:                 text().primaryKey(),
    companyId:          text()
                            .notNull()
                            .references(() => companiesTable.id, { onDelete: 'cascade' }),
    discoverySource:    text({ enum: ['applyguy', 'simplify', 'speedyapply', 'linkedin', 'manual'] })
                            .notNull(),
    observedName:       text().notNull(),
    firstSeenAt:        integer({ mode: 'timestamp' })
                            .notNull()
                            .default(sql`(unixepoch())`),
    lastSeenAt:         integer({ mode: 'timestamp' })
                            .notNull()
                            .default(sql`(unixepoch())`),
}, (table) => [
    index("companyDiscoveries_companyId_idx").on(table.companyId),
    uniqueIndex("companyDiscoveries_companyId_source_unique")
        .on(table.companyId, table.discoverySource),
]);

export const jobsTable = sqliteTable("jobs", {
    id:                 text().primaryKey(),
    companyId:          text().references(() => companiesTable.id, { onDelete: 'set null' }),
    companySourceId:    text().references(() => companySourcesTable.id, { onDelete: 'set null' }),
    externalId:         text(),
    // The official application page for this job.
    sourceUrl:          text().notNull().unique(),
    title:              text(),
    location:           text(),
    postedAt:           integer({ mode: 'timestamp' }),
    ingestionStatus:    text({ enum: ['queued', 'processing', 'ready', 'failed'] })
                            .notNull()
                            .default('queued'),
    createdAt:          integer({ mode: 'timestamp' })
                            .notNull()
                            .default(sql`(unixepoch())`),
    updatedAt:          integer({ mode: 'timestamp' })
                            .notNull()
                            .default(sql`(unixepoch())`),
    lastError:          text(),
    postingHtml:        text(),
}, (table) => [
    index("jobs_companyId_idx").on(table.companyId),
    index("jobs_postedAt_idx").on(table.postedAt),
    uniqueIndex("jobs_companySourceId_externalId_unique")
        .on(table.companySourceId, table.externalId),
]);
