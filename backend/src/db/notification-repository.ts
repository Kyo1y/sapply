import { and, asc, eq, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { BatchNotification, NotificationJob, RenderedNotification } from '../types/notification';
import { batchNotificationTable, emailDraftsTable, jobsTable, recruitersTable } from './schema';

/** Loads a saved notification by its composite key. */
export async function getBatchNotification(
    d1: D1Database,
    batchId: string,
    notificationId: string,
): Promise<BatchNotification | null> {
    const db = drizzle(d1);
    const row = await db.select().from(batchNotificationTable).where(and(
        eq(batchNotificationTable.batchId, batchId),
        eq(batchNotificationTable.notificationId, notificationId),
    )).get();
    return row ?? null;
}

/** Loads every job in a batch with its selected recruiter and saved outreach draft. */
export async function listNotificationJobs(d1: D1Database, batchId: string): Promise<NotificationJob[]> {
    const db = drizzle(d1);
    const rows = await db.select({ job: jobsTable, recruiter: recruitersTable, draft: emailDraftsTable })
        .from(jobsTable)
        .leftJoin(recruitersTable, and(
            eq(recruitersTable.jobId, jobsTable.id),
            eq(recruitersTable.selected, true),
        ))
        .leftJoin(emailDraftsTable, and(
            eq(emailDraftsTable.jobId, jobsTable.id),
            eq(emailDraftsTable.recipientEmail, recruitersTable.email),
        ))
        .where(eq(jobsTable.batchId, batchId))
        .orderBy(asc(jobsTable.pendingAt), asc(jobsTable.id));

    if (rows.length === 0) throw new Error(`Batch ${batchId} has no jobs`);
    return rows.map(({ job, recruiter, draft }) => {
        if (!recruiter || !draft) throw new Error(`Job ${job.id} is missing notification details`);
        return { job, recruiter, draft };
    });
}

/** Inserts one rendered email per batch; a retry gets the original content. */
export async function createOrGetBatchNotification(
    d1: D1Database,
    batchId: string,
    notificationId: string,
    recipientEmail: string,
    rendered: RenderedNotification,
    createdAt: Date = new Date(),
): Promise<BatchNotification> {
    const db = drizzle(d1);
    const inserted = await db.insert(batchNotificationTable).values({
        batchId, notificationId, recipientEmail, ...rendered, createdAt, updatedAt: createdAt,
    }).onConflictDoNothing({ target: [batchNotificationTable.batchId, batchNotificationTable.notificationId] })
        .returning().get();
    if (inserted) return inserted;

    const existing = await getBatchNotification(d1, batchId, notificationId);
    if (!existing) throw new Error(`Could not load notification for batch ${batchId}`);
    return existing;
}

/** Records that Resend accepted the email. */
export async function markBatchNotificationSent(
    d1: D1Database,
    notification: BatchNotification,
    providerEmailId: string,
    sentAt: Date = new Date(),
): Promise<BatchNotification> {
    const db = drizzle(d1);
    const row = await db.update(batchNotificationTable).set({
        status: 'sent', providerEmailId, sentAt, lastError: null, updatedAt: sentAt,
    }).where(and(
        eq(batchNotificationTable.batchId, notification.batchId),
        eq(batchNotificationTable.notificationId, notification.notificationId),
    )).returning().get();
    if (!row) throw new Error(`Notification ${notification.notificationId} no longer exists`);
    return row;
}

/** Records a send failure without overwriting a successful concurrent send. */
export async function markBatchNotificationFailed(
    d1: D1Database,
    notification: BatchNotification,
    error: string,
    failedAt: Date = new Date(),
): Promise<void> {
    const db = drizzle(d1);
    await db.update(batchNotificationTable).set({
        status: 'failed', lastError: error, updatedAt: failedAt,
    }).where(and(
        eq(batchNotificationTable.batchId, notification.batchId),
        eq(batchNotificationTable.notificationId, notification.notificationId),
        ne(batchNotificationTable.status, 'sent'),
    ));
}
