import { drizzle } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/d1/migrator';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { OutreachDraft } from '../types/outreach';
import type { RecruiterCandidate, RecruiterScore, RecruiterSelection } from '../types/recruiter';
import { getEmailDraft, saveOutreachDraft, saveOutreachRevision } from './outreach-repository';
import {
    getSelectedRecruiter, listRecruiters, saveRecruiterCandidates, saveRecruiterSelection,
} from './recruiter-repository';
import * as schema from './schema';

const candidates: RecruiterCandidate[] = [
    { name: 'Ava', title: 'University Recruiter', email: 'ava@example.com', linkedinUrl: 'https://www.linkedin.com/in/ava' },
    { name: 'Sam', title: 'Technical Recruiter', email: 'sam@example.com', linkedinUrl: null },
];
const avaScore: RecruiterScore = {
    email: 'ava@example.com', role_score: 70, hiring_signal_score: 10,
    human_signal_score: 5, total_score: 85,
    explanation: 'University recruiting is the strongest role match.',
    sources: ['https://example.com/ava'],
};
const samScore: RecruiterScore = {
    email: 'sam@example.com', role_score: 35, hiring_signal_score: 15,
    human_signal_score: 15, total_score: 65,
    explanation: 'Technical recruiter with relevant hiring posts.',
    sources: ['https://example.com/sam'],
};
const selection: RecruiterSelection = { recruiters: [avaScore, samScore], selected: avaScore };
const draft: OutreachDraft = {
    subject: 'Software Engineer, New Grad',
    draftEmail: 'Hi Ava,\n\nI am interested in the integrations team.\n\nBest,\nKairat',
    reason: 'Straightforward outreach; the role provides the most relevant connection.',
    sources: ['https://example.com/jobs/1'],
};
const savedAt = new Date('2026-10-03T12:00:00Z');
const revisedAt = new Date('2026-10-03T13:00:00Z');

let miniflare: Miniflare;
let d1: D1Database;

beforeAll(async () => {
    miniflare = new Miniflare({
        telemetry: { enabled: false },
        cf: false,
        workers: [{ config: {
            name: 'preparation-storage-test',
            type: 'worker',
            compatibilityDate: '2026-09-08',
            manifest: {
                mainModule: 'index.js',
                modules: { 'index.js': {
                    type: 'esm',
                    contents: 'export default { fetch() { return new Response("test"); } };',
                } },
            },
            env: { DB: { type: 'd1', id: 'preparation-storage-test' } },
        } }],
    });
    d1 = await miniflare.getD1Database('DB');
    // Apply the real migration history, including the new tables, to an ephemeral D1 database.
    await migrate(drizzle(d1), { migrationsFolder: 'drizzle' });
}, 30_000);

beforeEach(async () => {
    await d1.prepare('DELETE FROM jobs').run();
    await drizzle(d1, { schema }).insert(schema.jobsTable).values([
        { id: 'job-1', sourceUrl: 'https://example.com/jobs/1', status: 'preparing' },
        { id: 'job-2', sourceUrl: 'https://example.com/jobs/2', status: 'preparing' },
    ]);
});

afterAll(async () => {
    await miniflare?.dispose();
});

describe('recruiter repository on D1', () => {
    it('stores contact details with null scores until selection, and deduplicates per job', async () => {
        const rows = await saveRecruiterCandidates(d1, 'job-1', [...candidates, candidates[0]], savedAt);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            jobId: 'job-1', ...candidates[0], selected: false,
            role_score: null, hiring_signal_score: null, human_signal_score: null,
            total_score: null, reason: null, sources: [], createdAt: savedAt, updatedAt: savedAt,
        });
        expect(await getSelectedRecruiter(d1, 'job-1')).toBeNull();
        await saveRecruiterCandidates(d1, 'job-2', candidates, savedAt);
        expect(await listRecruiters(d1, 'job-2')).toHaveLength(2);
    });

    it('saves every score and explanation and changes the selection without leaving two winners', async () => {
        await saveRecruiterCandidates(d1, 'job-1', candidates, savedAt);
        const rows = await saveRecruiterSelection(d1, 'job-1', selection, revisedAt);
        expect(rows.map((row) => row.email)).toEqual(['ava@example.com', 'sam@example.com']);
        expect(rows[0]).toMatchObject({
            selected: true, total_score: 85, role_score: 70, hiring_signal_score: 10,
            human_signal_score: 5, reason: avaScore.explanation, sources: avaScore.sources,
            createdAt: savedAt, updatedAt: revisedAt,
        });
        expect(rows[1]).toMatchObject({ selected: false, reason: samScore.explanation });

        const improvedSam: RecruiterScore = { ...samScore, role_score: 70, total_score: 100 };
        const changed = await saveRecruiterSelection(d1, 'job-1', {
            recruiters: [avaScore, improvedSam], selected: improvedSam,
        });
        expect(changed.filter((row) => row.selected)).toHaveLength(1);
        expect(await getSelectedRecruiter(d1, 'job-1')).toMatchObject({ email: 'sam@example.com' });
    });

    it('keeps scores and selection when Autumn contacts are saved again', async () => {
        await saveRecruiterCandidates(d1, 'job-1', candidates, savedAt);
        const scored = await saveRecruiterSelection(d1, 'job-1', selection, revisedAt);
        expect(await saveRecruiterCandidates(d1, 'job-1', candidates)).toEqual(scored);
        expect(await saveRecruiterCandidates(d1, 'job-1', [])).toEqual(scored);
    });

    it('handles a full recruiter list without exceeding the per-statement bind limit', async () => {
        const contacts = Array.from({ length: 25 }, (_, index) => ({
            name: `Recruiter ${index}`, title: 'Recruiter', email: `contact${index}@example.com`, linkedinUrl: null,
        }));
        expect(await saveRecruiterCandidates(d1, 'job-1', contacts)).toHaveLength(25);
    });

    it('rejects incomplete, duplicate, or unknown scores before changing saved selection', async () => {
        await saveRecruiterCandidates(d1, 'job-1', candidates);
        const scored = await saveRecruiterSelection(d1, 'job-1', selection);
        for (const scores of [[avaScore], [avaScore, avaScore], [avaScore, { ...samScore, email: 'other@example.com' }]]) {
            await expect(saveRecruiterSelection(d1, 'job-1', { recruiters: scores, selected: avaScore }))
                .rejects.toThrow('Scores must cover every saved recruiter');
        }
        await expect(saveRecruiterSelection(d1, 'job-1', {
            ...selection, selected: { ...avaScore, email: 'other@example.com' },
        })).rejects.toThrow('The selected recruiter must be included');
        expect(await listRecruiters(d1, 'job-1')).toEqual(scored);
    });

    it('rolls back the entire selection batch if a score violates a database constraint', async () => {
        await saveRecruiterCandidates(d1, 'job-1', candidates);
        const scored = await saveRecruiterSelection(d1, 'job-1', selection, savedAt);
        await expect(saveRecruiterSelection(d1, 'job-1', {
            recruiters: [avaScore, { ...samScore, total_score: 99 }], selected: samScore,
        }, revisedAt)).rejects.toThrow();
        expect(await listRecruiters(d1, 'job-1')).toEqual(scored);
    });

    it('enforces one selected recruiter and requires a parent job', async () => {
        await saveRecruiterCandidates(d1, 'job-1', candidates);
        await saveRecruiterSelection(d1, 'job-1', selection);
        await expect(d1.prepare('UPDATE recruiters SET selected = 1 WHERE jobId = ? AND email = ?')
            .bind('job-1', 'sam@example.com').run()).rejects.toThrow();
        await expect(saveRecruiterCandidates(d1, 'missing-job', candidates)).rejects.toThrow();
    });
});

describe('outreach repository on D1', () => {
    beforeEach(async () => {
        await saveRecruiterCandidates(d1, 'job-1', candidates, savedAt);
    });

    it('stores original subject, body, explanation, and sources with empty revisions', async () => {
        const row = await saveOutreachDraft(d1, 'job-1', 'ava@example.com', draft, savedAt);
        expect(row).toMatchObject({
            jobId: 'job-1', recipientEmail: 'ava@example.com',
            originalSubject: draft.subject, originalDraft: draft.draftEmail,
            revisedSubject: null, revisedDraft: null, reason: draft.reason, sources: draft.sources,
            createdAt: savedAt, updatedAt: savedAt,
        });
        expect(await getEmailDraft(d1, 'job-1', 'ava@example.com')).toEqual(row);
    });

    it('preserves the original and user revisions when a model draft is saved again', async () => {
        await saveOutreachDraft(d1, 'job-1', 'ava@example.com', draft, savedAt);
        const edited = await saveOutreachRevision(d1, 'job-1', 'ava@example.com', {
            revisedSubject: 'My subject', revisedDraft: 'My email body',
        }, revisedAt);
        expect(edited).toMatchObject({
            originalSubject: draft.subject, originalDraft: draft.draftEmail,
            revisedSubject: 'My subject', revisedDraft: 'My email body',
            createdAt: savedAt, updatedAt: revisedAt,
        });
        expect(await saveOutreachDraft(d1, 'job-1', 'ava@example.com', {
            ...draft, subject: 'Replacement subject', draftEmail: 'Replacement body', reason: 'Replacement explanation',
        })).toEqual(edited);
    });

    it('allows subject-only or body-only revisions and clearing edits', async () => {
        await saveOutreachDraft(d1, 'job-1', 'ava@example.com', draft);
        expect(await saveOutreachRevision(d1, 'job-1', 'ava@example.com', {
            revisedSubject: 'Edited subject', revisedDraft: null,
        })).toMatchObject({ revisedSubject: 'Edited subject', revisedDraft: null });
        expect(await saveOutreachRevision(d1, 'job-1', 'ava@example.com', {
            revisedSubject: null, revisedDraft: 'Edited body',
        })).toMatchObject({ revisedSubject: null, revisedDraft: 'Edited body' });
        expect(await saveOutreachRevision(d1, 'job-1', 'ava@example.com', {
            revisedSubject: null, revisedDraft: null,
        })).toMatchObject({ revisedSubject: null, revisedDraft: null });
    });

    it('does not create drafts by editing a missing row', async () => {
        expect(await getEmailDraft(d1, 'job-1', 'ava@example.com')).toBeNull();
        expect(await saveOutreachRevision(d1, 'job-1', 'ava@example.com', {
            revisedSubject: 'Subject', revisedDraft: 'Body',
        })).toBeNull();
    });

    it('requires the recipient to be saved for that same job', async () => {
        await expect(saveOutreachDraft(d1, 'job-1', 'unknown@example.com', draft)).rejects.toThrow();
        await expect(saveOutreachDraft(d1, 'job-2', 'ava@example.com', draft)).rejects.toThrow();
    });

    it('deletes dependent recruiters and drafts when their job is deleted', async () => {
        await saveOutreachDraft(d1, 'job-1', 'ava@example.com', draft);
        await d1.prepare('DELETE FROM jobs WHERE id = ?').bind('job-1').run();
        expect(await listRecruiters(d1, 'job-1')).toEqual([]);
        expect(await getEmailDraft(d1, 'job-1', 'ava@example.com')).toBeNull();
    });
});
