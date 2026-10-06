import {
    createOrGetBatchNotification, getBatchNotification, listNotificationJobs,
    markBatchNotificationFailed, markBatchNotificationSent,
} from '../db/notification-repository';
import { sendEmailResend } from '../integrations/resend/resend-client';
import type { JobBatch } from '../types/batch';
import type { BatchNotification } from '../types/notification';
import { renderBatchEmail } from './render-batch-email';

type SendOptions = {
    d1: D1Database;
    fromEmail: string;
    resendApiKey: string;
    fetcher?: typeof fetch;
};

/** Sends saved content so a retry does not pick up later changes to a job or draft. */
async function sendSavedNotification(
    notification: BatchNotification,
    { d1, fromEmail, resendApiKey, fetcher }: SendOptions,
): Promise<BatchNotification> {
    if (notification.status === 'sent') return notification;

    let providerEmailId: string;
    try {
        providerEmailId = await sendEmailResend({ notification, fromEmail, apiKey: resendApiKey, fetcher });
    } catch (error) {
        await markBatchNotificationFailed(d1, notification, error instanceof Error ? error.message : String(error));
        throw error;
    }
    return markBatchNotificationSent(d1, notification, providerEmailId);
}

/** Renders and stores one email for a new batch, then submits it to Resend. */
export async function notifyBatch({
    batch, d1, recipientEmail, fromEmail, resendApiKey, fetcher,
}: SendOptions & { batch: JobBatch; recipientEmail: string }): Promise<BatchNotification> {
    const batchId = batch.batch.id;
    // This app sends one notification per batch. Reusing the ID makes concurrent calls meet at one row.
    const notificationId = batchId;
    let notification = await getBatchNotification(d1, batchId, notificationId);

    if (!notification) {
        const jobs = await listNotificationJobs(d1, batchId);
        if (jobs.length !== batch.jobs.length) {
            throw new Error(`Batch ${batchId} changed while preparing its notification`);
        }
        notification = await createOrGetBatchNotification(
            d1, batchId, notificationId, recipientEmail, renderBatchEmail(jobs),
        );
    }
    if (notification.recipientEmail !== recipientEmail) {
        throw new Error(`Batch ${batchId} already has a notification for another recipient`);
    }
    return sendSavedNotification(notification, { d1, fromEmail, resendApiKey, fetcher });
}

/** Retries an already saved notification without needing the original batching result. */
export async function retryBatchNotification({
    batchId, d1, fromEmail, resendApiKey, fetcher,
}: SendOptions & { batchId: string }): Promise<BatchNotification> {
    const notification = await getBatchNotification(d1, batchId, batchId);
    if (!notification) throw new Error(`Batch ${batchId} has no saved notification`);
    return sendSavedNotification(notification, { d1, fromEmail, resendApiKey, fetcher });
}
