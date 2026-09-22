import { isPotentialEarlyCareerTitle } from '../../jobs/early-career-policy';
import type { JobCandidate } from '../../types/job-candidate';
import { fetchJson, httpUrl, optionalText, record, requiredText, timestamp } from '../provider-fields';

const GREENHOUSE_API_ROOT = 'https://boards-api.greenhouse.io/v1/boards';

export type GreenhouseJobCard = {
    id: number;
    title: string;
    updatedAt: Date;
};

/** Reads the brief postings returned by a Greenhouse board. */
export function parseGreenhouseJobCards(value: unknown): GreenhouseJobCard[] {
    const body = record(value, 'Greenhouse response');
    if (!Array.isArray(body.jobs)) throw new Error('Greenhouse job list does not contain a jobs array');
    return body.jobs.map((value) => {
        const job = record(value, 'Greenhouse job card');
        if (typeof job.id !== 'number' || !Number.isSafeInteger(job.id) || job.id <= 0) {
            throw new Error('Greenhouse job id must be a positive integer');
        }
        return {
            id: job.id,
            title: requiredText(job.title, 'Greenhouse title'),
            updatedAt: timestamp(job.updated_at, 'Greenhouse updated_at'),
        };
    });
}

/** Fetches board cards for title-based pre-filtering. */
export async function listGreenhouseJobCards(
    boardToken: string,
    fetcher: typeof fetch = fetch,
): Promise<GreenhouseJobCard[]> {
    const url = `${GREENHOUSE_API_ROOT}/${encodeURIComponent(boardToken)}/jobs`;
    return parseGreenhouseJobCards(await fetchJson(url, 'Greenhouse', fetcher));
}

/** Fetches one full posting and maps it to the shared job shape. */
export async function getGreenhouseJobCandidate(
    boardToken: string,
    companyName: string,
    card: GreenhouseJobCard,
    fetcher: typeof fetch = fetch,
): Promise<JobCandidate> {
    return fetchGreenhouseJobCandidate(
        GREENHOUSE_API_ROOT,
        boardToken,
        companyName,
        card.id,
        { kind: 'timestamp', at: card.updatedAt },
        fetcher,
    );
}

/** Fetches one Greenhouse posting identified by an employer listing URL. */
export async function getGreenhouseJobCandidateFromUrl(
    sourceUrl: string,
    companyName: string,
    postingDate: string,
    fetcher: typeof fetch = fetch,
): Promise<JobCandidate> {
    const url = new URL(sourceUrl);
    const supportedHosts = new Set([
        'boards.greenhouse.io',
        'job-boards.greenhouse.io',
    ]);
    if (!supportedHosts.has(url.hostname)) throw new Error('Unsupported Greenhouse listing URL');
    const segments = url.pathname.split('/').filter(Boolean);
    const jobsIndex = segments.indexOf('jobs');
    const boardToken = segments[0];
    const idText = jobsIndex >= 0 ? segments[jobsIndex + 1] : undefined;
    const id = idText && /^\d+$/.test(idText) ? Number(idText) : NaN;
    if (!boardToken || !Number.isSafeInteger(id) || id <= 0) {
        throw new Error('Greenhouse listing URL must contain a board and job ID');
    }
    return fetchGreenhouseJobCandidate(
        GREENHOUSE_API_ROOT,
        boardToken,
        companyName,
        id,
        { kind: 'calendar-date', date: postingDate },
        fetcher,
    );
}

async function fetchGreenhouseJobCandidate(
    apiRoot: string,
    boardToken: string,
    companyName: string,
    jobId: number,
    postingTime: JobCandidate['postingTime'],
    fetcher: typeof fetch,
): Promise<JobCandidate> {
    const url = `${apiRoot}/${encodeURIComponent(boardToken)}/jobs/${jobId}?pay_transparency=true`;
    const body = record(await fetchJson(url, 'Greenhouse', fetcher), 'Greenhouse job');
    if (body.id !== jobId) throw new Error(`Greenhouse detail ID does not match job ${jobId}`);
    if (typeof body.content !== 'string') throw new Error('Greenhouse content must be a string');
    const location = body.location == null ? null : record(body.location, 'Greenhouse location');
    const ranges = Array.isArray(body.pay_input_ranges) ? body.pay_input_ranges : [];
    const salaryText = ranges.flatMap((value) => {
        const range = record(value, 'Greenhouse pay range');
        if (typeof range.min_cents !== 'number' || typeof range.max_cents !== 'number') return [];
        const title = optionalText(range.title);
        const currency = optionalText(range.currency_type) ?? '';
        return [`${title ? `${title}: ` : ''}${currency} ${range.min_cents / 100}–${range.max_cents / 100}`.trim()];
    }).join('; ');
    const sourceUrl = httpUrl(body.absolute_url, 'Greenhouse absolute_url');
    return {
        provider: 'greenhouse',
        externalId: String(jobId),
        companyName,
        title: requiredText(body.title, 'Greenhouse title'),
        location: location ? optionalText(location.name) : null,
        sourceUrl,
        applyUrl: sourceUrl,
        descriptionHtml: body.content,
        salaryText: salaryText || null,
        postingTime,
    };
}

/** Pre-filters board cards by title, then loads full details for the survivors. */
export async function listGreenhouseJobCandidates(
    boardToken: string,
    companyName: string,
    fetcher: typeof fetch = fetch,
): Promise<JobCandidate[]> {
    const cards = await listGreenhouseJobCards(boardToken, fetcher);
    const candidates: JobCandidate[] = [];
    for (const card of cards.filter((card) => isPotentialEarlyCareerTitle(card.title))) {
        candidates.push(await getGreenhouseJobCandidate(boardToken, companyName, card, fetcher));
    }
    return candidates;
}
