import { drizzle } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/d1/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { batchTable, jobsTable } from '../db/schema';
import type { Job } from '../types/job';
import { batchPendingJobs } from './batching-service';

const now = new Date('2026-10-04T12:00:00Z');
const overdue = new Date('2026-10-04T10:30:00Z');
const oneHourAgo = new Date('2026-10-04T11:00:00Z');

let miniflare: Miniflare;
let d1: D1Database;

/** Seeds stored jobs directly so tests isolate batching from external research. */
async function addJobs(count: number, options: {
    prefix?: string;
    pendingAt?: Date;
    status?: Job['status'];
    batchId?: string;
    updatedAt?: Date;
} = {}) {
    const db = drizzle(d1);
    for (let index = 0; index < count; index++) {
        const id = `${options.prefix ?? 'job'}-${index}`;
        await db.insert(jobsTable).values({
            id,
            sourceUrl: `https://example.com/jobs/${id}`,
            title: 'Software Engineer, New Grad',
            companyName: 'Example',
            status: options.status ?? 'pending',
            batchId: options.batchId ?? null,
            pendingAt: options.pendingAt ?? now,
            createdAt: new Date('2026-10-01T12:00:00Z'),
            updatedAt: options.updatedAt ?? now,
        });
    }
}

beforeAll(async () => {
    miniflare = new Miniflare({
        telemetry: { enabled: false }, cf: false,
        workers: [{ config: {
            name: 'batching-service-test', type: 'worker', compatibilityDate: '2026-09-08',
            manifest: { mainModule: 'index.js', modules: { 'index.js': {
                type: 'esm', contents: 'export default { fetch() { return new Response("test"); } };',
            } } },
            env: {
                DB: { type: 'd1', id: 'batching-service-test' },
                UPGRADE_DB: { type: 'd1', id: 'batching-upgrade-test' },
            },
        } }],
    });
    d1 = await miniflare.getD1Database('DB');
    await migrate(drizzle(d1), { migrationsFolder: 'drizzle' });
}, 30_000);

beforeEach(async () => {
    await d1.prepare('DELETE FROM jobs').run();
    await d1.prepare('DELETE FROM batch').run();
});

afterAll(async () => { await miniflare?.dispose(); });

describe('batching service on D1', () => {
    it('returns null and creates no batch when there are no pending jobs', async () => {
        expect(await batchPendingJobs(d1, now)).toBeNull();
        expect(await drizzle(d1).select().from(batchTable)).toEqual([]);
    });

    it('waits with nine recent jobs even if they were imported days ago', async () => {
        await addJobs(9, { pendingAt: new Date('2026-10-04T11:40:00Z') });
        const before = await drizzle(d1).select().from(jobsTable);
        expect(await batchPendingJobs(d1, now)).toBeNull();
        expect(await drizzle(d1).select().from(jobsTable)).toEqual(before);
        expect(await drizzle(d1).select().from(batchTable)).toEqual([]);
    });

    it('creates a batch at exactly ten jobs and returns the updated stored rows', async () => {
        await addJobs(10);
        const result = await batchPendingJobs(d1, now);
        if (!result) throw new Error('Expected a batch');
        expect(result.batch).toMatchObject({ id: expect.any(String), createdAt: now });
        expect(result.jobs).toHaveLength(10);
        expect(result.jobs.every((job) => job.batchId === result.batch.id && job.status === 'pending')).toBe(true);
        expect(await drizzle(d1).select().from(batchTable)).toEqual([result.batch]);
        expect(await drizzle(d1).select().from(jobsTable)).toEqual(result.jobs);
    });

    it('waits just below sixty minutes, then batches at exactly sixty', async () => {
        await addJobs(1, { pendingAt: oneHourAgo });
        expect(await batchPendingJobs(d1, new Date('2026-10-04T11:59:59Z'))).toBeNull();
        expect((await batchPendingJobs(d1, now))?.jobs).toHaveLength(1);
    });

    it('includes newer jobs when one overdue job triggers a small batch', async () => {
        await addJobs(1, { prefix: 'old', pendingAt: overdue, updatedAt: now });
        await addJobs(2, { prefix: 'new' });
        expect((await batchPendingJobs(d1, now))?.jobs).toHaveLength(3);
        expect(await drizzle(d1).select().from(batchTable)).toHaveLength(1);
    });

    it('creates one batch containing all fifteen jobs when both thresholds are met', async () => {
        await addJobs(1, { prefix: 'old', pendingAt: overdue });
        await addJobs(14, { prefix: 'new' });
        expect((await batchPendingJobs(d1, now))?.jobs).toHaveLength(15);
        expect(await drizzle(d1).select().from(batchTable)).toHaveLength(1);
    });

    it('does not count old, already batched jobs or jobs in other states', async () => {
        await drizzle(d1).insert(batchTable).values({ id: 'previous' });
        await addJobs(10, { prefix: 'batched', batchId: 'previous', pendingAt: overdue });
        for (const status of ['queued', 'assessing', 'preparing', 'not_fit', 'failed'] satisfies Job['status'][]) {
            await addJobs(2, { prefix: status, status, pendingAt: overdue });
        }
        await addJobs(9, { prefix: 'eligible' });
        const before = await drizzle(d1).select().from(jobsTable);
        expect(await batchPendingJobs(d1, now)).toBeNull();
        expect(await drizzle(d1).select().from(jobsTable)).toEqual(before);
        await addJobs(1, { prefix: 'tenth' });
        const result = await batchPendingJobs(d1, now);
        expect(result?.jobs).toHaveLength(10);
        expect(result?.jobs.every((job) => job.id.startsWith('eligible') || job.id.startsWith('tenth'))).toBe(true);
    });

    it('never regroups assigned jobs and keeps new arrivals for a later batch', async () => {
        await addJobs(10);
        const first = await batchPendingJobs(d1, now);
        expect(first?.jobs).toHaveLength(10);
        expect(await batchPendingJobs(d1, now)).toBeNull();
        await addJobs(1, { prefix: 'arrival' });
        expect(await batchPendingJobs(d1, now)).toBeNull();
        const second = await batchPendingJobs(d1, new Date('2026-10-04T13:00:00Z'));
        expect(second?.jobs.map((job) => job.id)).toEqual(['arrival-0']);
        expect(second?.batch.id).not.toBe(first?.batch.id);
        expect(await drizzle(d1).select().from(batchTable)).toHaveLength(2);
    });

    it('creates only one batch when several callers run simultaneously', async () => {
        await addJobs(20);
        const results = await Promise.all(Array.from({ length: 5 }, () => batchPendingJobs(d1, now)));
        const created = results.filter((result) => result !== null);
        expect(created).toHaveLength(1);
        expect(created[0].jobs).toHaveLength(20);
        expect(await drizzle(d1).select().from(batchTable)).toHaveLength(1);
        expect(new Set((await drizzle(d1).select().from(jobsTable)).map((job) => job.batchId)).size).toBe(1);
    });

    it('rolls back the batch and every assignment if an update fails, then succeeds on retry', async () => {
        await addJobs(10);
        await d1.prepare(`CREATE TRIGGER fail_batch_assignment BEFORE UPDATE OF batchId ON jobs
            WHEN NEW.id = 'job-5' BEGIN SELECT RAISE(ABORT, 'test assignment failure'); END`).run();
        try {
            await expect(batchPendingJobs(d1, now)).rejects.toThrow('test assignment failure');
            expect(await drizzle(d1).select().from(batchTable)).toEqual([]);
            expect((await drizzle(d1).select().from(jobsTable)).every((job) => job.batchId === null)).toBe(true);
        } finally {
            await d1.prepare('DROP TRIGGER fail_batch_assignment').run();
        }
        expect((await batchPendingJobs(d1, now))?.jobs).toHaveLength(10);
    });

    it('backfills pendingAt for existing pending jobs when the new migration is applied', async () => {
        const upgradeDb = await miniflare.getD1Database('UPGRADE_DB');
        await upgradeDb.prepare('CREATE TABLE jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL, updatedAt INTEGER NOT NULL)').run();
        await upgradeDb.prepare('INSERT INTO jobs VALUES (?, ?, ?)').bind('pending-job', 'pending', 1000).run();
        await upgradeDb.prepare('INSERT INTO jobs VALUES (?, ?, ?)').bind('preparing-job', 'preparing', 2000).run();
        const migration = readMigrationFiles({ migrationsFolder: 'drizzle' })
            .find((entry) => entry.sql.some((statement) => statement.includes('CREATE TABLE `batch`')));
        if (!migration) throw new Error('Batching migration is missing');
        await upgradeDb.batch(migration.sql.map((statement) => upgradeDb.prepare(statement)));
        const rows = await upgradeDb.prepare('SELECT id, pendingAt, batchId FROM jobs ORDER BY id').all();
        expect(rows.results).toEqual([
            { id: 'pending-job', pendingAt: 1000, batchId: null },
            { id: 'preparing-job', pendingAt: null, batchId: null },
        ]);
    });
});
