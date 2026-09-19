import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from 'drizzle-orm';

export const jobsTable = sqliteTable("jobs", {
    id:                 text().primaryKey(),
    sourceUrl:          text().notNull().unique(),
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
});
