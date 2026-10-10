import { describe, expect, it, vi } from 'vitest';
import { filterJobCandidate } from '../../jobs/filter-job-candidates';
import { getJobCandidates, getJobDetails } from './workday-client';

const boardUrl = 'https://example.wd5.myworkdayjobs.com/External';
const postingPath = '/job/New-York/Software-Engineer_R123';
const detail = {
    jobPostingInfo: {
        id: 'workday-internal-id',
        title: 'Software Engineer I',
        jobReqId: 'R123',
        location: 'New York, NY',
        country: { descriptor: 'United States of America', id: 'country-id' },
        jobDescription: '<p>Build software. New graduates welcome.</p>',
        startDate: '2026-10-10',
        postedOn: 'Posted Today',
        externalUrl: `${boardUrl}${postingPath}`,
        canApply: true,
    },
};
const json = (value: unknown) => new Response(JSON.stringify(value));

describe('Workday job candidates', () => {
    it('loads a localized listing through CXS and preserves its calendar date', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => json(detail));
        const candidate = await getJobDetails(
            `https://example.wd5.myworkdayjobs.com/en-US/External${postingPath}?source=feed`,
            'Example', fetcher,
        );
        expect(fetcher).toHaveBeenCalledWith(
            `https://example.wd5.myworkdayjobs.com/wday/cxs/example/External${postingPath}`,
            { headers: { accept: 'application/json', 'accept-language': 'en-US' } },
        );
        expect(candidate).toEqual({
            provider: 'workday', externalId: 'example:R123', companyName: 'Example',
            title: 'Software Engineer I', location: 'New York, NY, United States of America',
            sourceUrl: `${boardUrl}${postingPath}`, applyUrl: `${boardUrl}${postingPath}`,
            descriptionHtml: detail.jobPostingInfo.jobDescription, salaryText: null,
            postingTime: { kind: 'calendar-date', date: '2026-10-10' },
        });
        expect(filterJobCandidate(candidate, new Date('2026-10-11T12:00:00Z'))).toEqual({ accepted: true });
        expect(filterJobCandidate(candidate, new Date('2026-10-16T12:00:00Z')).accepted).toBe(false);
    });

    it('keeps requisition IDs distinct across tenants and canonicalizes application links', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => json(detail));
        const first = await getJobDetails(`${boardUrl}${postingPath}/apply`, 'Example', fetcher);
        const second = await getJobDetails(
            `https://other.wd1.myworkdayjobs.com/en-GB/Careers${postingPath}`, 'Other', fetcher,
        );
        expect(first.externalId).not.toBe(second.externalId);
        expect(first.sourceUrl).toBe(`${boardUrl}${postingPath}`);
        expect(second.sourceUrl).toBe(`https://other.wd1.myworkdayjobs.com/Careers${postingPath}`);
    });

    it('pages using the original total and fetches details only for matching titles', async () => {
        const offsets: number[] = [];
        const fetcher = vi.fn<typeof fetch>(async (input, init) => {
            if (init?.method !== 'POST') return json(detail);
            expect(String(input)).toBe('https://example.wd5.myworkdayjobs.com/wday/cxs/example/External/jobs');
            expect(new Headers(init.headers).get('content-type')).toBe('application/json');
            const request = JSON.parse(String(init.body));
            expect(request).toMatchObject({ limit: 20, appliedFacets: {}, searchText: '' });
            offsets.push(request.offset);
            return json(request.offset === 0 ? {
                total: 21,
                jobPostings: Array.from({ length: 20 }, (_, index) => ({
                    title: index === 19 ? 'Software Engineer I' : 'Senior Software Engineer',
                    externalPath: postingPath,
                })),
            } : {
                total: 0,
                jobPostings: [{ title: 'Software Engineer', externalPath: '/job/Boston/Engineer_R124' }],
            });
        });
        const candidates = await getJobCandidates(
            'https://example.wd5.myworkdayjobs.com/en-US/External', 'Example', fetcher,
        );
        expect(offsets).toEqual([0, 20]);
        expect(candidates).toHaveLength(2);
        expect(fetcher).toHaveBeenCalledTimes(4);
    });

    it('returns an empty array for a board without jobs', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => json({ total: 0, jobPostings: [] }));
        expect(await getJobCandidates(boardUrl, 'Example', fetcher)).toEqual([]);
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it.each([
        'https://careers.example.com/External/job/example',
        'https://example.wd5.myworkdayjobs.com.evil.com/External/job/example',
        'https://example.wd5.myworkdayjobs.com/External',
        'https://example.wd5.myworkdayjobs.com/en-US',
        'http://example.wd5.myworkdayjobs.com/External/job/example',
    ])('rejects invalid listing URLs before fetching: %s', async (url) => {
        const fetcher = vi.fn<typeof fetch>();
        await expect(getJobDetails(url, 'Example', fetcher)).rejects.toThrow('Invalid Workday job URL');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('rejects a posting URL passed as a board URL', async () => {
        const fetcher = vi.fn<typeof fetch>();
        await expect(getJobCandidates(`${boardUrl}${postingPath}`, 'Example', fetcher))
            .rejects.toThrow('Invalid Workday board URL');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('surfaces search and detail HTTP errors', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => new Response('', { status: 429 }));
        await expect(getJobCandidates(boardUrl, 'Example', fetcher)).rejects.toThrow('Workday search returned HTTP 429');
        await expect(getJobDetails(`${boardUrl}${postingPath}`, 'Example', fetcher)).rejects.toThrow('Workday detail returned HTTP 429');
    });

    it.each([
        [{ total: 0, jobPostings: null }, 'jobPostings array'],
        [{ total: -1, jobPostings: [] }, 'non-negative integer'],
        [{ total: 1, jobPostings: [{ title: 'Software Engineer', externalPath: 'https://evil.com/job/1' }] }, 'Invalid Workday externalPath'],
    ])('rejects malformed board responses', async (body, message) => {
        const fetcher = vi.fn<typeof fetch>(async () => json(body));
        await expect(getJobCandidates(boardUrl, 'Example', fetcher)).rejects.toThrow(message);
    });

    it.each(['2026-02-30', 'Posted Today', '2026-10-10T00:00:00Z'])('rejects invalid calendar dates: %s', async (startDate) => {
        const fetcher = vi.fn<typeof fetch>(async () => json({
            jobPostingInfo: { ...detail.jobPostingInfo, startDate },
        }));
        await expect(getJobDetails(`${boardUrl}${postingPath}`, 'Example', fetcher))
            .rejects.toThrow('Workday startDate must be a calendar date');
    });

    it('rejects a detail response without posting information', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => json({}));
        await expect(getJobDetails(`${boardUrl}${postingPath}`, 'Example', fetcher))
            .rejects.toThrow('Workday jobPostingInfo must be an object');
    });

    it('includes the country so the shared filter can reject non-US postings', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => json({ jobPostingInfo: {
            ...detail.jobPostingInfo, location: 'Toronto', country: { descriptor: 'Canada' },
        } }));
        const candidate = await getJobDetails(`${boardUrl}${postingPath}`, 'Example', fetcher);
        expect(candidate.location).toBe('Toronto, Canada');
        expect(filterJobCandidate(candidate, new Date('2026-10-10T12:00:00Z'))).toEqual({
            accepted: false, reasons: ['explicit_non_us_location'],
        });
    });
});
