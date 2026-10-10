import type { JobCandidate } from '../../types/job-candidate';
import { fetchJson, httpUrl, optionalText, record, requiredText, timestamp } from '../provider-fields';

const PAGE_SIZE = 100;

/** Maps one public Lever posting into the shared pre-filter job shape. */
export function postingToJobCandidate(value: unknown, companyName: string): JobCandidate {
    const job = record(value, 'Lever job');
    const categories = record(job.categories, 'Lever categories');
    const lists = Array.isArray(job.lists) ? job.lists : [];
    const sections = [requiredText(job.description, 'Lever description')];
    for (const value of lists) {
        const list = record(value, 'Lever description list');
        const content = optionalText(list.content);
        if (content) sections.push(content);
    }
    const additional = optionalText(job.additional);
    if (additional) sections.push(additional);

    const salaryRange = job.salaryRange == null ? null : record(job.salaryRange, 'Lever salaryRange');
    const salaryText = optionalText(job.salaryDescriptionPlain)
        ?? (salaryRange && typeof salaryRange.min === 'number' && typeof salaryRange.max === 'number'
            ? `${salaryRange.currency ?? ''} ${salaryRange.min}–${salaryRange.max} ${salaryRange.interval ?? ''}`.trim()
            : null);

    return {
        provider: 'lever',
        externalId: requiredText(job.id, 'Lever id'),
        companyName,
        title: requiredText(job.text, 'Lever title'),
        location: optionalText(categories.location),
        sourceUrl: httpUrl(job.hostedUrl, 'Lever hostedUrl'),
        applyUrl: httpUrl(job.applyUrl, 'Lever applyUrl'),
        descriptionHtml: sections.join('\n'),
        salaryText,
        postingTime: { kind: 'timestamp', at: timestamp(job.createdAt, 'Lever createdAt') },
    };
}

/** Fetches one Lever posting identified by its employer listing URL. */
export async function fetchJobDetails(
    sourceUrl: string,
    companyName: string,
    fetcher: typeof fetch = fetch,
): Promise<JobCandidate> {
    const url = new URL(sourceUrl);
    if (url.hostname !== 'jobs.lever.co' && url.hostname !== 'jobs.eu.lever.co') {
        throw new Error('Unsupported Lever listing URL');
    }
    const [boardName, postingId] = url.pathname.split('/').filter(Boolean);
    if (!boardName || !postingId) {
        throw new Error('Lever listing URL must contain a board and posting ID');
    }
    const apiHost = url.hostname === 'jobs.eu.lever.co' ? 'api.eu.lever.co' : 'api.lever.co';
    const apiUrl = `https://${apiHost}/v0/postings/${encodeURIComponent(boardName)}/${encodeURIComponent(postingId)}?mode=json`;
    return postingToJobCandidate(await fetchJson(apiUrl, 'Lever', fetcher), companyName);
}

/** Fetches every public posting from one Lever board, including paginated boards. */
export async function getJobCandidates(
    boardName: string,
    companyName: string,
    fetcher: typeof fetch = fetch,
    region: 'global' | 'eu' = 'global',
): Promise<JobCandidate[]> {
    const host = region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co';
    const jobs: JobCandidate[] = [];
    for (let skip = 0; ; skip += PAGE_SIZE) {
        const url = `https://${host}/v0/postings/${encodeURIComponent(boardName)}?mode=json&skip=${skip}&limit=${PAGE_SIZE}`;
        const page = await fetchJson(url, 'Lever', fetcher);
        if (!Array.isArray(page)) throw new Error('Lever response must be a jobs array');
        jobs.push(...page.map((job) => postingToJobCandidate(job, companyName)));
        if (page.length < PAGE_SIZE) return jobs;
    }
}
