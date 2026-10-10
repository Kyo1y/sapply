import { describe, expect, it, vi } from 'vitest';
import { getJobDetails as getGreenhouseJobDetails, getJobCandidates as getGreenhouseJobCandidates } from './greenhouse/greenhouse-client';
import { fetchJobDetails as fetchLeverJobDetails, getJobCandidates as getLeverJobCandidates, postingToJobCandidate as leverPostingToJobCandidate } from './lever/lever-client';
import { fetchJobDetails as fetchAshbyJobDetails, getJobCandidates as getAshbyJobCandidates } from './ashby/ashby-client';
import { getJobDetails as getLinkedInJobDetails, parseLinkedInJobCards, getJobCandidates as getLinkedInJobCandidates, searchLinkedInJobCards } from './linkedin/linkedin-client';

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
});

describe('provider job candidates', () => {
    it('loads a Greenhouse detail with an exact publication time', async () => {
        const fetcher = vi.fn(async () => jsonResponse({
            id: 42,
            title: 'Software Engineer I',
            company_name: 'Example',
            updated_at: '2026-09-21T09:00:00Z',
            location: { name: 'New York, NY' },
            absolute_url: 'https://boards.greenhouse.io/example/jobs/42',
            first_published: '2026-09-21T09:00:00Z',
            content: '<p>0-2 years</p>',
            pay_input_ranges: [{ title: 'NYC', currency_type: 'USD', min_cents: 10000000, max_cents: 14000000 }],
        })) as unknown as typeof fetch;
        const candidate = await getGreenhouseJobDetails(
            'https://boards.greenhouse.io/example/jobs/42', fetcher,
        );
        expect(candidate).toMatchObject({
            provider: 'greenhouse', externalId: '42', companyName: 'Example',
            applyUrl: 'https://boards.greenhouse.io/example/jobs/42',
            salaryText: 'NYC: USD 100000–140000',
            postingTime: { kind: 'timestamp', at: new Date('2026-09-21T09:00:00Z') },
        });
        expect(vi.mocked(fetcher).mock.calls[0][0]).toContain('pay_transparency=true');
    });

    it('fetches Greenhouse details only for technical, non-senior titles', async () => {
        const fetcher = vi.fn(async (url: string) => jsonResponse(url.endsWith('/jobs')
            ? { jobs: [
                { id: 1, title: 'Senior Software Engineer' },
                { id: 2, title: 'Software Engineer I' },
                { id: 3, title: 'Product Manager' },
            ] }
            : {
                id: 2, title: 'Software Engineer I',
                company_name: 'Example',
                updated_at: '2026-09-21T10:00:00Z',
                location: { name: 'New York, NY' },
                absolute_url: 'https://boards.greenhouse.io/example/jobs/2',
                content: '<p>New graduate</p>',
            })) as unknown as typeof fetch;
        const candidates = await getGreenhouseJobCandidates('example', fetcher);
        expect(candidates).toHaveLength(1);
        expect(candidates[0].externalId).toBe('2');
        expect(candidates[0].postingTime).toEqual({
            kind: 'timestamp', at: new Date('2026-09-21T10:00:00Z'),
        });
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('loads Lever pages and preserves requirements and structured salary', async () => {
        const job = {
            id: 'abc', text: 'Software Engineer', categories: { location: 'Boston, MA' },
            description: '<p>Build software</p>',
            lists: [{ text: 'Requirements', content: '<li>New grad</li>' }],
            hostedUrl: 'https://jobs.lever.co/example/abc',
            applyUrl: 'https://jobs.lever.co/example/abc/apply',
            createdAt: 1789995600000,
            salaryRange: { currency: 'USD', min: 110000, max: 140000, interval: 'year' },
        };
        const fetcher = vi.fn(async () => jsonResponse([job])) as unknown as typeof fetch;
        const [candidate] = await getLeverJobCandidates('example', 'Example', fetcher);
        expect(candidate).toMatchObject({
            provider: 'lever', externalId: 'abc', location: 'Boston, MA',
            salaryText: 'USD 110000–140000 year',
        });
        expect(candidate.descriptionHtml).toContain('<li>New grad</li>');
        expect(fetcher).toHaveBeenCalledOnce();
        expect(() => leverPostingToJobCandidate({ ...job, createdAt: undefined }, 'Example'))
            .toThrow('Lever createdAt must be a valid timestamp');
    });

    it('loads one Lever posting from its listing URL', async () => {
        const job = {
            id: 'abc', text: 'Software Engineer', categories: { location: 'Boston, MA' },
            description: '<p>Build software</p>', lists: [],
            hostedUrl: 'https://jobs.lever.co/example/abc',
            applyUrl: 'https://jobs.lever.co/example/abc/apply',
            createdAt: 1789995600000,
        };
        const fetcher = vi.fn(async () => jsonResponse(job)) as unknown as typeof fetch;

        const candidate = await fetchLeverJobDetails(job.hostedUrl, 'Example', fetcher);

        expect(candidate.externalId).toBe('abc');
        expect(vi.mocked(fetcher).mock.calls[0][0]).toBe(
            'https://api.lever.co/v0/postings/example/abc?mode=json',
        );
    });

    it('loads only listed Ashby jobs and keeps the published time and salary', async () => {
        const job = {
            title: 'New Grad Software Engineer', location: 'New York, NY',
            descriptionHtml: '<p>2027 graduates</p>', publishedAt: '2026-09-21T10:00:00Z',
            jobUrl: 'https://jobs.ashbyhq.com/example/abc',
            applyUrl: 'https://jobs.ashbyhq.com/example/abc/application',
            compensation: { scrapeableCompensationSalarySummary: '$120K–$150K' },
            isListed: true,
        };
        const fetcher = vi.fn(async () => jsonResponse({ jobs: [job, { ...job, isListed: false }] })) as unknown as typeof fetch;
        const candidates = await getAshbyJobCandidates('example', 'Example', fetcher);
        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({
            provider: 'ashby', externalId: job.jobUrl,
            salaryText: '$120K–$150K',
            postingTime: { kind: 'timestamp', at: new Date(job.publishedAt) },
        });
    });

    it('finds one Ashby posting from its listing URL', async () => {
        const job = {
            title: 'New Grad Software Engineer', location: 'New York, NY',
            descriptionHtml: '<p>2027 graduates</p>', publishedAt: '2026-09-21T10:00:00Z',
            jobUrl: 'https://jobs.ashbyhq.com/example/abc',
            applyUrl: 'https://jobs.ashbyhq.com/example/abc/application',
            isListed: true,
        };
        const fetcher = vi.fn(async () => jsonResponse({ jobs: [job] })) as unknown as typeof fetch;

        const candidate = await fetchAshbyJobDetails(job.jobUrl, 'Example', fetcher);

        expect(candidate.externalId).toBe(job.jobUrl);
        expect(vi.mocked(fetcher).mock.calls[0][0]).toContain('/job-board/example');
    });

    it('loads LinkedIn cards and a guest description without inventing an exact timestamp', async () => {
        const searchHtml = `<li><div class="base-card" data-entity-urn="urn:li:jobPosting:123">
            <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/123/"></a>
            <h3 class="base-search-card__title">Software Engineer I</h3>
            <h4 class="base-search-card__subtitle">Example Co</h4>
            <span class="job-search-card__location">New York, NY</span>
            <time datetime="2026-09-21">1 day ago</time>
        </div></li>`;
        const cards = parseLinkedInJobCards(searchHtml);
        expect(cards[0]).toMatchObject({ id: '123', companyName: 'Example Co', displayedAge: '1 day ago' });
        const fetcher = vi.fn(async (url: string) => new Response(
            url.includes('seeMoreJobPostings')
                ? searchHtml
                : '<div class="show-more-less-html__markup"><p>Early career role</p></div>',
        )) as unknown as typeof fetch;
        const [card] = await searchLinkedInJobCards('software engineer', '102571732', 0, fetcher);
        const candidate = await getLinkedInJobDetails(card, fetcher);
        expect(candidate).toMatchObject({
            provider: 'linkedin', externalId: '123',
            applyUrl: 'https://www.linkedin.com/jobs/view/123/',
            postingTime: { kind: 'recent-window', hours: 120, displayedAge: '1 day ago' },
        });
        expect(candidate.descriptionHtml).toContain('Early career role');
        expect(vi.mocked(fetcher).mock.calls[0][0]).toContain('f_TPR=r432000');
    });

    it('fetches LinkedIn details only for matching title, location, and displayed age', async () => {
        const card = (id: number, title: string, location: string, age: string) =>
            `<li><div data-entity-urn="urn:li:jobPosting:${id}">
                <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/${id}/"></a>
                <h3 class="base-search-card__title">${title}</h3>
                <h4 class="base-search-card__subtitle">Example Co</h4>
                <span class="job-search-card__location">${location}</span>
                <time>${age}</time>
            </div></li>`;
        const html = card(1, 'Software Engineer I', 'New York, NY', '2 days ago') +
            card(2, 'Senior Software Engineer', 'New York, NY', '1 day ago') +
            card(3, 'Software Engineer I', 'Toronto, Canada', '1 day ago') +
            card(4, 'Software Engineer I', 'New York, NY', '1 week ago');
        const fetcher = vi.fn(async (url: string) => new Response(
            url.includes('seeMoreJobPostings')
                ? html
                : '<div class="show-more-less-html__markup"><p>New grad</p></div>',
        )) as unknown as typeof fetch;
        const candidates = await getLinkedInJobCandidates('software engineer', '102571732', 0, fetcher);
        expect(candidates.map((candidate) => candidate.externalId)).toEqual(['1']);
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
});
