import { isPotentialEarlyCareerTitle } from '../../jobs/early-career-policy';
import type { JobCandidate } from '../../types/job-candidate';
import { optionalText, record, requiredText } from '../provider-fields';

const PAGE_SIZE = 20;
const JSON_HEADERS = { accept: 'application/json', 'accept-language': 'en-US' };

export function parseWorkdayUrl(url: URL): {
    tenant: string;
    site: string;
    boardUrl: string;
    apiRoot: string;
    postingPath: string;
} | null {
    const host = url.hostname.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/);
    if (url.protocol !== 'https:' || !host || url.port || url.username || url.password) return null;

    const segments = url.pathname.split('/').filter(Boolean);
    if (/^[a-z]{2}-[a-z]{2}$/i.test(segments[0] ?? '')) segments.shift();
    const site = segments.shift();
    if (!site || !/^[a-z0-9_-]+$/i.test(site)) return null;
    if (segments.length > 0 && (segments[0] !== 'job' || segments.length < 2)) return null;
    if (segments.at(-1) === 'apply') segments.pop();

    return {
        tenant: host[1],
        site,
        boardUrl: `${url.origin}/${site}`,
        apiRoot: `${url.origin}/wday/cxs/${host[1]}/${site}`,
        postingPath: segments.length ? `/${segments.join('/')}` : '',
    };
}


/** Fetches a public Workday posting and maps its full details to a job candidate. */
export async function getJobDetails(
    sourceUrl: string,
    companyName: string,
    fetcher: typeof fetch = fetch,
): Promise<JobCandidate> {
    const source = parseWorkdayUrl(new URL(sourceUrl));
    if (!source || !source.postingPath) throw new Error('Invalid Workday job URL');

    const response = await fetcher(`${source.apiRoot}${source.postingPath}`, { headers: JSON_HEADERS });
    if (!response.ok) throw new Error(`Workday detail returned HTTP ${response.status}`);
    const body = record(await response.json(), 'Workday detail response');
    const job = record(body.jobPostingInfo, 'Workday jobPostingInfo');
    const date = requiredText(job.startDate, 'Workday startDate');
    const midnight = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== date) {
        throw new Error('Workday startDate must be a calendar date');
    }
    const country = job.country == null ? null : optionalText(record(job.country, 'Workday country').descriptor);
    const location = optionalText(job.location);
    const canonicalUrl = `${source.boardUrl}${source.postingPath}`;

    return {
        provider: 'workday',
        // Requisition IDs are tenant-scoped, not globally unique across Workday employers.
        externalId: `${source.tenant}:${requiredText(job.jobReqId, 'Workday jobReqId')}`,
        companyName,
        title: requiredText(job.title, 'Workday title'),
        location: [location, country].filter(Boolean).join(', ') || null,
        sourceUrl: canonicalUrl,
        applyUrl: canonicalUrl,
        descriptionHtml: requiredText(job.jobDescription, 'Workday jobDescription'),
        salaryText: null,
        postingTime: { kind: 'calendar-date', date },
    };
}

/** Pages through a Workday board and loads full details for potential early-career titles. */
export async function getJobCandidates(
    boardUrl: string,
    companyName: string,
    fetcher: typeof fetch = fetch,
): Promise<JobCandidate[]> {
    const source = parseWorkdayUrl(new URL(boardUrl));
    if (!source || source.postingPath) throw new Error('Invalid Workday board URL');

    const candidates: JobCandidate[] = [];
    let total: number | undefined;
    for (let offset = 0; ; ) {
        const response = await fetcher(`${source.apiRoot}/jobs`, {
            method: 'POST',
            headers: { ...JSON_HEADERS, 'content-type': 'application/json' },
            body: JSON.stringify({ appliedFacets: {}, limit: PAGE_SIZE, offset, searchText: '' }),
        });
        if (!response.ok) throw new Error(`Workday search returned HTTP ${response.status}`);
        const page = record(await response.json(), 'Workday search response');
        if (!Array.isArray(page.jobPostings)) throw new Error('Workday response must contain a jobPostings array');
        // Later pages may report total=0, so retain the first page's count.
        if (total === undefined) {
            if (typeof page.total !== 'number' || !Number.isSafeInteger(page.total) || page.total < 0) {
                throw new Error('Workday total must be a non-negative integer');
            }
            total = page.total;
        }
        for (const value of page.jobPostings) {
            const card = record(value, 'Workday job card');
            if (!isPotentialEarlyCareerTitle(requiredText(card.title, 'Workday title'))) continue;
            const path = requiredText(card.externalPath, 'Workday externalPath');
            if (!path.startsWith('/job/')) throw new Error('Invalid Workday externalPath');
            candidates.push(await getJobDetails(`${source.boardUrl}${path}`, companyName, fetcher));
        }
        offset += page.jobPostings.length;
        if (page.jobPostings.length === 0 || offset >= total) return candidates;
    }
}
