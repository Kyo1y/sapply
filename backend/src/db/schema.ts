import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from 'drizzle-orm';
import type { FitJobAssessmentDetails } from '../types/job-assessment';

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

export const jobsTable = sqliteTable("jobs", {
    id:                 text().primaryKey(),
    companyId:          text().references(() => companiesTable.id, { onDelete: 'set null' }),
    companySourceId:    text().references(() => companySourcesTable.id, { onDelete: 'set null' }),
    provider:           text({ enum: [
                            'manual', 'greenhouse', 'lever', 'ashby', 'linkedin', 'applyguy',
                        ] })
                            .notNull()
                            .default('manual'),
    externalId:         text(),
    companyName:        text(),
    // The official application page for this job.
    sourceUrl:          text().notNull().unique(),
    applyUrl:           text(),
    title:              text(),
    location:           text(),
    postedAt:           integer({ mode: 'timestamp' }),
    displayedAge:       text(),
    salaryText:         text(),
    // Processing begins once posting HTML is available; later states track review and outreach.
    status:             text({ enum: [
                            'queued', 'fetching', 'processing',
                            'assessing', 'preparing', 'pending', 'not_fit', 'failed',
                        ] })
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
    // Populated only when assessment rejects the job.
    assessmentReason:   text(),
    // Populated only when assessment accepts the job.
    assessmentDetails:  text({ mode: 'json' }).$type<FitJobAssessmentDetails>(),
}, (table) => [
    index("jobs_companyId_idx").on(table.companyId),
    index("jobs_postedAt_idx").on(table.postedAt),
    uniqueIndex("jobs_companySourceId_externalId_unique")
        .on(table.companySourceId, table.externalId),
    uniqueIndex("jobs_provider_externalId_unique")
        .on(table.provider, table.externalId),
]);
