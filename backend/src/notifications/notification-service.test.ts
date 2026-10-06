import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/d1/migrator';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { batchNotificationTable, batchTable, emailDraftsTable, jobsTable, recruitersTable } from '../db/schema';
import type { JobBatch } from '../types/batch';
import { notifyBatch, retryBatchNotification } from './notification-service';

let miniflare: Miniflare;
let d1: D1Database;

beforeAll(async () => {
    miniflare = new Miniflare({
        telemetry: { enabled: false }, cf: false,
        workers: [{ config: {
            name: 'notification-service-test', type: 'worker', compatibilityDate: '2026-09-08',
            manifest: { mainModule: 'index.js', modules: { 'index.js': {
                type: 'esm', contents: 'export default { fetch() { return new Response("test"); } };',
            } } },
            env: { DB: { type: 'd1', id: 'notification-service-test' } },
        } }],
    });
    d1 = await miniflare.getD1Database('DB');
    await migrate(drizzle(d1), { migrationsFolder: 'drizzle' });
}, 30_000);

beforeEach(async () => {
    await d1.prepare('DELETE FROM batchNotification').run();
    await d1.prepare('DELETE FROM jobs').run();
    await d1.prepare('DELETE FROM batch').run();
});

afterAll(async () => { await miniflare?.dispose(); });

async function seedBatch(withDraft = true): Promise<JobBatch> {
    const db = drizzle(d1);
    const batch = await db.insert(batchTable).values({
        id: 'batch-1', createdAt: new Date('2026-10-06T12:00:00Z'),
    }).returning().get();
    const job = await db.insert(jobsTable).values({
        id: 'job-1', batchId: batch.id, status: 'pending',
        pendingAt: new Date('2026-10-06T11:50:00Z'),
        companyName: 'A & B <script>', title: 'Software Engineer',
        location: 'New York, NY', salaryText: '$120,000 base',
        postedAt: new Date('2026-10-06T09:00:00Z'),
        sourceUrl: 'https://example.com/jobs/1',
    }).returning().get();
    await db.insert(recruitersTable).values({
        jobId: job.id, email: 'recruiter@example.com', name: 'Jane Doe',
        title: 'University Recruiter', selected: true, role_score: 70,
        hiring_signal_score: 10, human_signal_score: 5, total_score: 85,
        reason: 'Recruits early career engineers', sources: ['https://example.com/team'],
    });
    if (withDraft) {
        await db.insert(emailDraftsTable).values({
            jobId: job.id, recipientEmail: 'recruiter@example.com',
            originalSubject: 'Hello Jane', revisedSubject: 'Hi Jane',
            originalDraft: 'Original message',
            revisedDraft: 'I built [Baton](https://batonnn.com/).\nWould love to talk.',
            reason: 'Straightforward outreach suits this role.',
            sources: ['https://example.com/team', 'https://example.com/product'],
        });
    }
    return { batch, jobs: [job] };
}

const options = { recipientEmail: 'kairat@example.com', fromEmail: 'Sapply <jobs@example.com>', resendApiKey: 'test-key' };

describe('notification service on D1', () => {
    it('sends an actionable email, saves the provider ID, and skips a second send', async () => {
        const batch = await seedBatch();
        const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
            Response.json({ id: 'resend-email-1' }));

        const sent = await notifyBatch({ d1, batch, ...options, fetcher });
        expect(sent).toMatchObject({
            batchId: batch.batch.id, notificationId: batch.batch.id,
            status: 'sent', providerEmailId: 'resend-email-1', lastError: null,
        });
        expect(sent.sentAt).toBeInstanceOf(Date);
        expect(sent.htmlBody).toContain('A &amp; B &lt;script&gt;');
        expect(sent.htmlBody).toContain('href="https://batonnn.com/"');
        expect(sent.htmlBody).toContain('Open application');
        expect(sent.textBody).toContain('Hi Jane');
        expect(sent.textBody).toContain('recruiter@example.com');
        expect(sent.textBody).toContain('https://example.com/jobs/1');

        expect(fetcher).toHaveBeenCalledTimes(1);
        const [url, request] = fetcher.mock.calls[0];
        expect(url).toBe('https://api.resend.com/emails');
        expect(request?.headers).toMatchObject({
            Authorization: 'Bearer test-key',
            'Idempotency-Key': 'sapply/batch/batch-1/batch-1',
        });
        expect(JSON.parse(String(request?.body))).toMatchObject({
            from: options.fromEmail, to: [options.recipientEmail], subject: sent.subject,
            html: sent.htmlBody, text: sent.textBody,
        });

        expect(await notifyBatch({ d1, batch, ...options, fetcher })).toEqual(sent);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(await drizzle(d1).select().from(batchNotificationTable)).toEqual([sent]);
    });

    it('keeps the rendered email after a send failure and retries that exact message', async () => {
        const batch = await seedBatch();
        const failedSend = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
            Response.json({ message: 'Rate limit reached' }, { status: 429 }));

        await expect(notifyBatch({ d1, batch, ...options, fetcher: failedSend }))
            .rejects.toThrow('Rate limit reached');
        const [saved] = await drizzle(d1).select().from(batchNotificationTable);
        expect(saved).toMatchObject({ status: 'failed', lastError: 'Resend rejected the email: Rate limit reached' });

        await drizzle(d1).update(emailDraftsTable).set({ revisedSubject: 'Changed after failure' })
            .where(eq(emailDraftsTable.jobId, 'job-1'));
        const retrySend = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
            Response.json({ id: 'resend-email-2' }));
        const sent = await retryBatchNotification({
            d1, batchId: batch.batch.id, fromEmail: options.fromEmail,
            resendApiKey: options.resendApiKey, fetcher: retrySend,
        });
        expect(sent.status).toBe('sent');
        expect(sent.subject).toBe(saved.subject);
        expect(sent.htmlBody).toBe(saved.htmlBody);
        expect(sent.textBody).toBe(saved.textBody);
        expect(JSON.parse(String(retrySend.mock.calls[0][1]?.body))).toMatchObject({ subject: saved.subject });
        expect(retrySend.mock.calls[0][1]?.headers).toMatchObject({
            'Idempotency-Key': 'sapply/batch/batch-1/batch-1',
        });
    });

    it('does not create or send an incomplete batch email', async () => {
        const batch = await seedBatch(false);
        const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
            Response.json({ id: 'should-not-send' }));

        await expect(notifyBatch({ d1, batch, ...options, fetcher }))
            .rejects.toThrow('missing notification details');
        expect(fetcher).not.toHaveBeenCalled();
        expect(await drizzle(d1).select().from(batchNotificationTable)).toEqual([]);
    });
});
