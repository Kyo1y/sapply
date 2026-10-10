import { describe, expect, it, vi } from 'vitest';
import { getJobCandidates, jobDraftToJobCandidate } from './applyguy-client';

const job = {
    id: 'custom:microsoft:872b1461dd8af2bce47d',
    company: 'Microsoft',
    title: 'Software Engineering IC2',
    location: 'Redmond, WA',
    posted: '2026-09-22',
    age: 'Today',
    url: 'https://applyguy.ai/jobs?job=example',
    listingUrl: 'https://apply.careers.microsoft.com/careers/job/1970393556962504',
};

describe('ApplyGuy job candidates', () => {
    it('keeps free-feed data for custom IDs that the paid API cannot accept', async () => {
        expect(await jobDraftToJobCandidate(job, 'test-key')).toEqual({
            provider: 'applyguy',
            externalId: job.id,
            companyName: 'Microsoft',
            title: 'Software Engineering IC2',
            location: 'Redmond, WA',
            sourceUrl: job.listingUrl,
            applyUrl: job.listingUrl,
            descriptionHtml: null,
            salaryText: null,
            postingTime: { kind: 'calendar-date', date: '2026-09-22' },
        });
    });

    it('fetches and maps the public feed', async () => {
        const fetcher = vi.fn(async () => new Response(JSON.stringify({
            updatedAt: '2026-09-22T16:45:58.630Z',
            jobs: [job],
        }))) as unknown as typeof fetch;
        const candidates = await getJobCandidates('test-key', fetcher);
        expect(candidates).toHaveLength(1);
        expect(candidates[0].externalId).toBe(job.id);
        expect(vi.mocked(fetcher).mock.calls[0][0]).toContain('data/new-grad-jobs.json');
    });

    it('rejects malformed dates and feeds', async () => {
        await expect(jobDraftToJobCandidate({ ...job, posted: '2026-02-30' }, 'test-key'))
            .rejects.toThrow('ApplyGuy posted must be a calendar date');
        const fetcher = vi.fn(async () => new Response(JSON.stringify({ jobs: null }))) as unknown as typeof fetch;
        await expect(getJobCandidates('test-key', fetcher))
            .rejects.toThrow('ApplyGuy feed does not contain a jobs array');
    });

    it('uses the paid detail API for unsupported ATS URLs', async () => {
        const apiJob = {
            ...job,
            id: '85bb4a2a-df45-40ff-ada3-87d6fd7b413f',
            company: 'Boeing',
            listingUrl: 'https://careers.example.com/jobs/example',
        };
        const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            expect(new Headers(init?.headers).get('authorization')).toBe('Bearer paid-key');
            return new Response(JSON.stringify({
                data: {
                    id: apiJob.id,
                    company: 'Boeing',
                    title: apiJob.title,
                    location: 'Seattle, WA',
                    url: apiJob.listingUrl,
                    descriptionHtml: '<p>Build software.</p>',
                    salaryMin: 100000,
                    salaryMax: 120000,
                    salaryCurrency: 'USD',
                },
            }));
        }) as unknown as typeof fetch;

        const candidate = await jobDraftToJobCandidate(apiJob, 'paid-key', fetcher);

        expect(candidate.provider).toBe('applyguy');
        expect(candidate.descriptionHtml).toBe('<p>Build software.</p>');
        expect(candidate.salaryText).toBe('USD 100000–120000');
        expect(candidate.postingTime).toEqual({ kind: 'calendar-date', date: apiJob.posted });
        expect(vi.mocked(fetcher).mock.calls[0][0]).toContain(`/v1/jobs/${apiJob.id}`);
    });

    it('routes supported Greenhouse URLs through the Greenhouse client', async () => {
        const greenhouseJob = {
            ...job,
            id: 'applyguy-id',
            company: 'Example',
            listingUrl: 'https://job-boards.greenhouse.io/example/jobs/123',
        };
        const fetcher = vi.fn(async () => new Response(JSON.stringify({
            id: 123,
            company_name: 'Example',
            title: greenhouseJob.title,
            absolute_url: greenhouseJob.listingUrl,
            location: { name: greenhouseJob.location },
            content: '<p>Greenhouse description</p>',
            updated_at: '2026-09-23T10:00:00Z',
            pay_input_ranges: [],
        }))) as unknown as typeof fetch;

        const candidate = await jobDraftToJobCandidate(greenhouseJob, 'unused-key', fetcher);

        expect(candidate.provider).toBe('greenhouse');
        expect(candidate.descriptionHtml).toBe('<p>Greenhouse description</p>');
        expect(candidate.postingTime).toEqual({ kind: 'timestamp', at: new Date('2026-09-23T10:00:00Z') });
        expect(vi.mocked(fetcher).mock.calls[0][0]).toContain('/v1/boards/example/jobs/123');
    });

    it('routes Workday URLs through the public client without a paid API key', async () => {
        const workdayJob = {
            ...job,
            listingUrl: 'https://boeing.wd1.myworkdayjobs.com/en-US/External/job/Seattle/Engineer_R123',
        };
        const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
            expect(new Headers(init?.headers).has('authorization')).toBe(false);
            return new Response(JSON.stringify({ jobPostingInfo: {
                jobReqId: 'R123', title: 'Software Engineer', location: 'Seattle, WA',
                jobDescription: '<p>Workday description</p>', startDate: '2026-10-10',
            } }));
        });
        const candidate = await jobDraftToJobCandidate(workdayJob, '', fetcher);
        expect(candidate.provider).toBe('workday');
        expect(candidate.externalId).toBe('boeing:R123');
        expect(candidate.descriptionHtml).toBe('<p>Workday description</p>');
        expect(String(fetcher.mock.calls[0][0])).toContain('/wday/cxs/boeing/External/job/Seattle/Engineer_R123');
    });
});
