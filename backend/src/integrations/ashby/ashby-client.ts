import type { JobCandidate } from '../../types/job-candidate';
import { fetchJson, httpUrl, optionalText, record, requiredText, timestamp } from '../provider-fields';

/** Maps one public Ashby posting into the shared pre-filter job shape. */
export function parseAshbyJob(value: unknown, companyName: string): JobCandidate {
    const job = record(value, 'Ashby job');
    const sourceUrl = httpUrl(job.jobUrl, 'Ashby jobUrl');
    const compensation = job.compensation == null
        ? null
        : record(job.compensation, 'Ashby compensation');

    return {
        provider: 'ashby',
        externalId: sourceUrl,
        companyName,
        title: requiredText(job.title, 'Ashby title'),
        location: optionalText(job.location),
        sourceUrl,
        applyUrl: httpUrl(job.applyUrl, 'Ashby applyUrl'),
        descriptionHtml: requiredText(job.descriptionHtml, 'Ashby descriptionHtml'),
        salaryText: compensation
            ? optionalText(compensation.scrapeableCompensationSalarySummary)
                ?? optionalText(compensation.compensationTierSummary)
            : null,
        postingTime: { kind: 'timestamp', at: timestamp(job.publishedAt, 'Ashby publishedAt') },
    };
}

/** Fetches the public, listed postings from one Ashby board. */
export async function listAshbyJobCandidates(
    boardName: string,
    companyName: string,
    fetcher: typeof fetch = fetch,
): Promise<JobCandidate[]> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardName)}?includeCompensation=true`;
    const body = record(await fetchJson(url, 'Ashby', fetcher), 'Ashby response');
    if (!Array.isArray(body.jobs)) throw new Error('Ashby response must contain a jobs array');
    return body.jobs
        .filter((job) => record(job, 'Ashby job').isListed !== false)
        .map((job) => parseAshbyJob(job, companyName));
}

/** Fetches the matching posting from the Ashby board named in a listing URL. */
export async function getAshbyJobCandidateFromUrl(
    sourceUrl: string,
    companyName: string,
    fetcher: typeof fetch = fetch,
): Promise<JobCandidate> {
    const url = new URL(sourceUrl);
    if (url.hostname !== 'jobs.ashbyhq.com') throw new Error('Unsupported Ashby listing URL');
    const [boardName, postingId] = url.pathname.split('/').filter(Boolean);
    if (!boardName || !postingId) {
        throw new Error('Ashby listing URL must contain a board and posting ID');
    }
    const candidates = await listAshbyJobCandidates(boardName, companyName, fetcher);
    const candidate = candidates.find((candidate) => {
        const candidateId = new URL(candidate.sourceUrl).pathname.split('/').filter(Boolean)[1];
        return candidateId === postingId;
    });
    if (!candidate) throw new Error(`Ashby posting ${postingId} was not found on board ${boardName}`);
    return candidate;
}
