import type { BatchNotification } from '../../types/notification';

/** Submits a saved notification to Resend and returns its email ID. */
export async function sendEmailResend({
    notification, fromEmail, apiKey, fetcher = fetch,
}: {
    notification: BatchNotification;
    fromEmail: string;
    apiKey: string;
    fetcher?: typeof fetch;
}): Promise<string> {
    const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `sapply/batch/${notification.batchId}/${notification.notificationId}`,
        },
        body: JSON.stringify({
            from: fromEmail,
            to: [notification.recipientEmail],
            subject: notification.subject,
            html: notification.htmlBody,
            text: notification.textBody,
        }),
    });

    let data: unknown;
    try {
        data = await response.json();
    } catch {
        throw new Error(`Resend returned an invalid response (HTTP ${response.status})`);
    }
    if (!response.ok) {
        const message = typeof data === 'object' && data !== null && 'message' in data
            && typeof data.message === 'string' ? data.message : `HTTP ${response.status}`;
        throw new Error(`Resend rejected the email: ${message}`);
    }
    if (typeof data !== 'object' || data === null || !('id' in data) || typeof data.id !== 'string') {
        throw new Error('Resend accepted the request but returned no email ID');
    }
    return data.id;
}
