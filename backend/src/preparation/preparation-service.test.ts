import { drizzle } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/d1/migrator';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeJobPreparation, getJob } from '../db/job-repository';
import { getEmailDraft, saveOutreachDraft, saveOutreachRevision } from '../db/outreach-repository';
import { getSelectedRecruiter, listRecruiters, saveRecruiterCandidates, saveRecruiterSelection } from '../db/recruiter-repository';
import * as schema from '../db/schema';
import type { CandidateProfile } from '../types/candidate-profile';
import type { OutreachDraft } from '../types/outreach';
import type { RecruiterCandidate, RecruiterSelection } from '../types/recruiter';
import { prepareJob } from './preparation-service';

const candidate: CandidateProfile = {
    resumeText: 'CS and Math student with API integration experience.',
    graduationDate: 'June 2027', currentWorkAuthorization: 'OPT', requiresFutureSponsorship: true,
    targetRoles: ['SWE'], minimumBaseSalaryUsd: 100_000, preferredLocation: 'NYC',
    alternateLocations: ['Boston'], openToOtherLocationsForStrongMatch: true,
};
const contacts: RecruiterCandidate[] = [
    { name: 'Ava', title: 'University Recruiter', email: 'ava@example.com', linkedinUrl: 'https://www.linkedin.com/in/ava' },
    { name: 'Sam', title: 'Technical Recruiter', email: 'sam@example.com', linkedinUrl: null },
];
const winner = {
    email: 'ava@example.com', role_score: 70, hiring_signal_score: 10, human_signal_score: 5,
    total_score: 85, explanation: 'University recruiter with hiring evidence.', sources: ['https://example.com/ava'],
} satisfies RecruiterSelection['selected'];
const selection: RecruiterSelection = {
    recruiters: [winner, {
        email: 'sam@example.com', role_score: 35, hiring_signal_score: 0, human_signal_score: 0,
        total_score: 35, explanation: 'General engineering hiring.', sources: [],
    }], selected: winner,
};
const draft: OutreachDraft = {
    subject: 'Software Engineer, New Grad', draftEmail: 'Hi Ava,\n\nI am interested in the integrations team.',
    reason: 'Classic outreach because no credible hook was found.', sources: ['https://example.com/product'],
};

let miniflare: Miniflare;
let d1: D1Database;
let failAt: 'selection' | 'outreach' | null;
let autumnRows: RecruiterCandidate[];

/** Supplies vendor responses while running the actual clients, SDK parser, service, and D1 repositories. */
const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith('/task/start')) return json({ task_id: 'task-1', poll_after_s: 1 });
    if (url.endsWith('/state')) return json({ active: false, status: 'done' });
    if (url.includes('/output?')) return json({ rows: autumnRows.map((contact) => ({
        ...contact, linkedin_url: contact.linkedinUrl,
    })) });
    if (url.includes('/responses')) {
        const selecting = String(init?.body).includes('recruiter_scores');
        if (failAt === (selecting ? 'selection' : 'outreach')) {
            return json({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Test refusal' }] }] });
        }
        // Check that each prior step really reached the database before the next external call.
        expect(await listRecruiters(d1, 'job-1')).toHaveLength(2);
        if (!selecting) expect(await getSelectedRecruiter(d1, 'job-1')).toMatchObject({ email: winner.email });
        return json({ output: [{ type: 'message', content: [{
            type: 'output_text', text: JSON.stringify(selecting ? { recruiters: selection.recruiters } : draft),
        }] }] });
    }
    throw new Error(`Unexpected network request: ${url}`);
});

function json(body: unknown): Response {
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

function prepare(jobId = 'job-1') {
    return prepareJob({ d1, jobId, candidate, autumnApiKey: 'test-autumn', openaiApiKey: 'test-openai', fetcher });
}

beforeAll(async () => {
    miniflare = new Miniflare({
        telemetry: { enabled: false }, cf: false,
        workers: [{ config: {
            name: 'preparation-service-test', type: 'worker', compatibilityDate: '2026-09-08',
            manifest: { mainModule: 'index.js', modules: { 'index.js': {
                type: 'esm', contents: 'export default { fetch() { return new Response("test"); } };',
            } } },
            env: { DB: { type: 'd1', id: 'preparation-service-test' } },
        } }],
    });
    d1 = await miniflare.getD1Database('DB');
    await migrate(drizzle(d1), { migrationsFolder: 'drizzle' });
}, 30_000);

beforeEach(async () => {
    await d1.prepare('DELETE FROM jobs').run();
    await drizzle(d1).insert(schema.jobsTable).values({
        id: 'job-1', sourceUrl: 'https://example.com/jobs/1', applyUrl: 'https://example.com/jobs/1/apply',
        companyName: 'Example', title: 'Software Engineer, New Grad', location: 'New York, NY',
        postingHtml: '<p>Build integrations.</p>', status: 'preparing',
    });
    failAt = null;
    autumnRows = contacts;
    fetcher.mockClear();
});

afterAll(async () => { await miniflare?.dispose(); });

describe('preparation service on D1', () => {
    it('researches contacts, saves every score, drafts to the selected recruiter, then marks pending', async () => {
        const result = await prepare();
        expect(result.job).toMatchObject({ id: 'job-1', status: 'pending', lastError: null });
        expect(result.recruiter).toMatchObject({ ...contacts[0], selected: true, total_score: 85, reason: winner.explanation });
        expect(result.emailDraft).toMatchObject({
            recipientEmail: winner.email, originalSubject: draft.subject, originalDraft: draft.draftEmail,
            reason: draft.reason, sources: draft.sources,
        });
        expect(await listRecruiters(d1, 'job-1')).toHaveLength(2);
        expect(fetcher).toHaveBeenCalledTimes(5);
        expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain('https://example.com/jobs/1/apply');
        const body = String(fetcher.mock.calls[4]?.[1]?.body);
        const request: { input: string } = JSON.parse(body);
        expect(JSON.parse(request.input)).toMatchObject({
            recruiter: { ...contacts[0], ...winner, selected: true, jobId: 'job-1' },
            candidate, job: { companyName: 'Example', descriptionHtml: '<p>Build integrations.</p>' },
        });
    });

    it('resumes after scoring fails without running Autumn again', async () => {
        failAt = 'selection';
        await expect(prepare()).rejects.toThrow('OpenAI did not return recruiter scores');
        expect(await getJob(d1, 'job-1')).toMatchObject({ status: 'preparing', lastError: 'OpenAI did not return recruiter scores' });
        expect(await listRecruiters(d1, 'job-1')).toHaveLength(2);
        expect(await getSelectedRecruiter(d1, 'job-1')).toBeNull();
        failAt = null;
        fetcher.mockClear();
        expect((await prepare()).job.status).toBe('pending');
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('resumes after drafting fails without repeating Autumn or scoring', async () => {
        await saveRecruiterCandidates(d1, 'job-1', contacts);
        failAt = 'outreach';
        await expect(prepare()).rejects.toThrow('OpenAI did not return an outreach draft');
        expect(await getSelectedRecruiter(d1, 'job-1')).toMatchObject({ email: winner.email });
        expect(await getEmailDraft(d1, 'job-1', winner.email)).toBeNull();
        expect((await getJob(d1, 'job-1'))?.status).toBe('preparing');
        failAt = null;
        fetcher.mockClear();
        expect((await prepare()).job).toMatchObject({ status: 'pending', lastError: null });
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it('finishes a job whose draft was saved before interruption, preserving user edits', async () => {
        await saveRecruiterCandidates(d1, 'job-1', contacts);
        await saveRecruiterSelection(d1, 'job-1', selection);
        await saveOutreachDraft(d1, 'job-1', winner.email, draft);
        await saveOutreachRevision(d1, 'job-1', winner.email, { revisedSubject: 'My subject', revisedDraft: 'My draft' });
        const result = await prepare();
        expect(result.emailDraft).toMatchObject({ revisedSubject: 'My subject', revisedDraft: 'My draft' });
        expect(result.job.status).toBe('pending');
        expect(await prepare()).toEqual(result);
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('does not mark a job pending when Autumn returns no contactable recruiters', async () => {
        autumnRows = [];
        await expect(prepare()).rejects.toThrow('No recruiters with email addresses');
        expect(await getJob(d1, 'job-1')).toMatchObject({ status: 'preparing', lastError: expect.stringContaining('No recruiters') });
        expect(await listRecruiters(d1, 'job-1')).toEqual([]);
        expect(fetcher).toHaveBeenCalledTimes(3);
    });

    it('rejects missing jobs and jobs outside preparation without making requests or changing them', async () => {
        await expect(prepare('missing')).rejects.toThrow('does not exist');
        for (const status of ['assessing', 'not_fit', 'failed'] satisfies Array<typeof schema.jobsTable.$inferSelect.status>) {
            await d1.prepare('UPDATE jobs SET status = ? WHERE id = ?').bind(status, 'job-1').run();
            await expect(prepare()).rejects.toThrow(`not ${status}`);
            expect(await getJob(d1, 'job-1')).toMatchObject({ status, lastError: null });
        }
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('records missing search context without calling Autumn', async () => {
        await d1.prepare('UPDATE jobs SET companyName = NULL WHERE id = ?').bind('job-1').run();
        await expect(prepare()).rejects.toThrow('needs a company name and title');
        expect((await getJob(d1, 'job-1'))?.lastError).toContain('needs a company name and title');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('rejects inconsistent pending data without silently restarting research', async () => {
        await d1.prepare('UPDATE jobs SET status = ? WHERE id = ?').bind('pending', 'job-1').run();
        await expect(prepare()).rejects.toThrow('incomplete preparation');
        expect(await getJob(d1, 'job-1')).toMatchObject({ status: 'pending', lastError: null });
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('allows completion only with a draft for the selected recruiter and a preparing job', async () => {
        expect(await completeJobPreparation(d1, 'job-1')).toBeNull();
        await saveRecruiterCandidates(d1, 'job-1', contacts);
        await saveRecruiterSelection(d1, 'job-1', selection);
        await saveOutreachDraft(d1, 'job-1', 'sam@example.com', draft);
        expect(await completeJobPreparation(d1, 'job-1')).toBeNull();
        await saveOutreachDraft(d1, 'job-1', winner.email, draft);
        expect((await completeJobPreparation(d1, 'job-1'))?.status).toBe('pending');
        expect(await completeJobPreparation(d1, 'job-1')).toBeNull();
    });
});
