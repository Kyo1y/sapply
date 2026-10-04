import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { EmailDraft, OutreachDraft } from '../types/outreach';
import * as schema from './schema';
import { emailDraftsTable } from './schema';

/** Reads the original email, revisions, and research for a job and recipient. */
export async function getEmailDraft(
    d1: D1Database,
    jobId: string,
    recipientEmail: string,
): Promise<EmailDraft | null> {
    const db = drizzle(d1, { schema });
    const row = await db.select().from(emailDraftsTable).where(and(
        eq(emailDraftsTable.jobId, jobId), eq(emailDraftsTable.recipientEmail, recipientEmail),
    )).get();
    return row ?? null;
}

/** Saves the first model draft without overwriting its original text or any user edits on retries. */
export async function saveOutreachDraft(
    d1: D1Database,
    jobId: string,
    recipientEmail: string,
    draft: OutreachDraft,
    savedAt: Date = new Date(),
): Promise<EmailDraft | null> {
    const db = drizzle(d1, { schema });
    const inserted = await db.insert(emailDraftsTable).values({
        jobId,
        recipientEmail,
        originalSubject: draft.subject,
        originalDraft: draft.draftEmail,
        reason: draft.reason,
        sources: draft.sources,
        createdAt: savedAt,
        updatedAt: savedAt,
    }).onConflictDoNothing({ target: [emailDraftsTable.jobId, emailDraftsTable.recipientEmail] })
        .returning().get();
    return inserted ?? getEmailDraft(d1, jobId, recipientEmail);
}

/** Updates only user-editable text. Null clears an edit and falls back to the original. */
export async function saveOutreachRevision(
    d1: D1Database,
    jobId: string,
    recipientEmail: string,
    revision: Pick<EmailDraft, 'revisedSubject' | 'revisedDraft'>,
    revisedAt: Date = new Date(),
): Promise<EmailDraft | null> {
    const db = drizzle(d1, { schema });
    const updated = await db.update(emailDraftsTable)
        .set({ ...revision, updatedAt: revisedAt })
        .where(and(eq(emailDraftsTable.jobId, jobId), eq(emailDraftsTable.recipientEmail, recipientEmail)))
        .returning().get();
    return updated ?? null;
}
