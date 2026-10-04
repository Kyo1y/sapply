import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
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

/** Contactable Autumn results and the model's scores for each job. */
export const recruitersTable = sqliteTable('recruiters', {
    jobId: text().notNull().references(() => jobsTable.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    name: text().notNull(),
    title: text().notNull(),
    linkedinUrl: text(),
    selected: integer({ mode: 'boolean' }).notNull().default(false),
    // Null until the recruiter has been scored, rather than a misleading zero.
    role_score: integer(),
    hiring_signal_score: integer(),
    human_signal_score: integer(),
    total_score: integer(),
    reason: text(),
    sources: text({ mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
    primaryKey({ columns: [table.jobId, table.email] }),
    // Only one recruiter may be selected for a job, even on concurrent writes.
    uniqueIndex('recruiters_selected_job_unique').on(table.jobId).where(sql`${table.selected} = 1`),
    check('recruiters_complete_scores', sql`
        (${table.role_score} IS NULL AND ${table.hiring_signal_score} IS NULL
            AND ${table.human_signal_score} IS NULL AND ${table.total_score} IS NULL)
        OR (${table.role_score} IS NOT NULL AND ${table.hiring_signal_score} IS NOT NULL
            AND ${table.human_signal_score} IS NOT NULL AND ${table.total_score} IS NOT NULL
            AND ${table.reason} IS NOT NULL)
    `),
    check('recruiters_valid_scores', sql`
        ${table.total_score} IS NULL OR (
            ${table.role_score} IN (0, 35, 70)
            AND ${table.hiring_signal_score} BETWEEN 0 AND 15
            AND ${table.human_signal_score} BETWEEN 0 AND 15
            AND ${table.total_score} = ${table.role_score} + ${table.hiring_signal_score} + ${table.human_signal_score}
        )
    `),
    check('recruiters_selected_has_scores', sql`${table.selected} = 0 OR ${table.total_score} IS NOT NULL`),
]);

/** Original outreach and independent user revisions, addressed to a recruiter for that job. */
export const emailDraftsTable = sqliteTable('emailDrafts', {
    jobId: text().notNull(),
    recipientEmail: text().notNull(),
    originalSubject: text().notNull(),
    revisedSubject: text(),
    originalDraft: text().notNull(),
    revisedDraft: text(),
    reason: text().notNull(),
    sources: text({ mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => [
    primaryKey({ columns: [table.jobId, table.recipientEmail] }),
    foreignKey({
        columns: [table.jobId, table.recipientEmail],
        foreignColumns: [recruitersTable.jobId, recruitersTable.email],
    }).onDelete('cascade'),
]);
