import { isPotentialEarlyCareerTitle } from '../../jobs/early-career-policy';
import type { JobCandidate } from '../../types/job-candidate';
import type { GreenhouseJob, GreenhouseJobCard } from '../../types/greenhouse';

const GREENHOUSE_API_ROOT = 'https://boards-api.greenhouse.io/v1/boards';

function validateUrl(url: URL): number {
    const [, boardToken, jobs, idText] = url.pathname.split('/');
    const jobId = Number(idText);

    if (
        (url.hostname !== 'boards.greenhouse.io' && url.hostname !== 'job-boards.greenhouse.io') ||
        !boardToken || jobs !== 'jobs' || !/^\d+$/.test(idText ?? '') ||
        !Number.isSafeInteger(jobId) || jobId <= 0
    ) {
        throw new Error('Invalid Greenhouse job URL');
    }

    return jobId;
}

/** Fetches one Greenhouse posting and maps it to a job candidate. */
export async function getJobDetails(
    sourceUrl: string,
    fetcher: typeof fetch = fetch,
): Promise<JobCandidate> {
    const url = new URL(sourceUrl);
    const jobId = validateUrl(url);
    const boardToken = decodeURIComponent(url.pathname.split('/')[1]);
    const apiUrl = `${GREENHOUSE_API_ROOT}/${encodeURIComponent(boardToken)}/jobs/${jobId}?pay_transparency=true`;

    const response = await fetcher(apiUrl);
    if (!response.ok) throw new Error(`Greenhouse returned HTTP ${response.status}`);
    const job: GreenhouseJob = await response.json();

    const salaryText = job.pay_input_ranges
        ?.map((range) => `${range.title}: ${range.currency_type} ${range.min_cents / 100}–${range.max_cents / 100}`)
        .join('; ') || null;

    return {
        provider: 'greenhouse',
        externalId: String(job.id),
        companyName: job.company_name,
        title: job.title,
        location: job.location.name,
        sourceUrl: job.absolute_url,
        applyUrl: job.absolute_url,
        descriptionHtml: job.content,
        salaryText,
        postingTime: { kind: 'timestamp', at: new Date(job.updated_at) },
    };
}

/** Pre-filters a board's job cards by title, then loads their full postings. */
export async function getJobCandidates(
    boardToken: string,
    fetcher: typeof fetch = fetch,
): Promise<JobCandidate[]> {
    const response = await fetcher(`${GREENHOUSE_API_ROOT}/${encodeURIComponent(boardToken)}/jobs`);
    if (!response.ok) throw new Error(`Greenhouse returned HTTP ${response.status}`);
    const board: { jobs: GreenhouseJobCard[] } = await response.json();

    const candidates: JobCandidate[] = [];
    for (const card of board.jobs.filter((card) => isPotentialEarlyCareerTitle(card.title))) {
        const sourceUrl = `https://boards.greenhouse.io/${encodeURIComponent(boardToken)}/jobs/${card.id}`;
        candidates.push(await getJobDetails(sourceUrl, fetcher));
    }
    return candidates;
}
