import type { JobCandidate } from '../../types/job-candidate';
import * as ashby from '../ashby/ashby-client';
import { getJobDetails as getGreenhouseJobDetails } from '../greenhouse/greenhouse-client';
import { fetchJobDetails as fetchLeverJobDetails } from '../lever/lever-client';
import { fetchJson, httpUrl, optionalText, record, requiredText } from '../provider-fields';

const APPLYGUY_FEED_URL =
    'https://raw.githubusercontent.com/ApplyGuy/2027-New-Grad-Jobs/main/data/new-grad-jobs.json';
const APPLYGUY_API_ROOT = 'https://api.applyguy.ai/v1/jobs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ApplyGuyFeedJob = {
    id: string;
    companyName: string;
    title: string;
    location: string | null;
    listingUrl: string;
    posted: string;
};

/** Validates one public ApplyGuy feed entry. */
function postingToJobDraft(value: unknown): ApplyGuyFeedJob {
    const job = record(value, 'ApplyGuy job');
    const posted = requiredText(job.posted, 'ApplyGuy posted');
    const midnight = /^\d{4}-\d{2}-\d{2}$/.test(posted)
        ? new Date(`${posted}T00:00:00Z`)
        : new Date(NaN);
    if (Number.isNaN(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== posted) {
        throw new Error('ApplyGuy posted must be a calendar date');
    }
    return {
        id: requiredText(job.id, 'ApplyGuy id'),
        companyName: requiredText(job.company, 'ApplyGuy company'),
        title: requiredText(job.title, 'ApplyGuy title'),
        location: optionalText(job.location),
        listingUrl: httpUrl(job.listingUrl, 'ApplyGuy listingUrl'),
        posted,
    };
}

/** Fetches an unsupported ATS posting from ApplyGuy's paid detail API. */
async function fetchJobDetails(
    job: ApplyGuyFeedJob,
    apiKey: string,
    fetcher: typeof fetch,
): Promise<JobCandidate> {
    if (!UUID.test(job.id)) {
        return {
            provider: 'applyguy',
            externalId: job.id,
            companyName: job.companyName,
            title: job.title,
            location: job.location,
            sourceUrl: job.listingUrl,
            applyUrl: job.listingUrl,
            descriptionHtml: null,
            salaryText: null,
            postingTime: { kind: 'calendar-date', date: job.posted },
        };
    }
    if (!apiKey.trim()) throw new Error('APPLYGUY_API_KEY is required');
    const response = await fetcher(`${APPLYGUY_API_ROOT}/${job.id}`, {
        headers: {
            accept: 'application/json',
            authorization: `Bearer ${apiKey}`,
        },
    });
    if (!response.ok) throw new Error(`ApplyGuy detail returned HTTP ${response.status}`);
    const body = record(await response.json(), 'ApplyGuy detail response');
    const detail = record(body.data, 'ApplyGuy detail');
    const id = requiredText(detail.id, 'ApplyGuy detail id');
    if (id !== job.id) throw new Error(`ApplyGuy detail ID does not match job ${job.id}`);

    const salaryMin = typeof detail.salaryMin === 'number' ? detail.salaryMin : null;
    const salaryMax = typeof detail.salaryMax === 'number' ? detail.salaryMax : null;
    const salaryCurrency = optionalText(detail.salaryCurrency) ?? '';
    const salaryText = salaryMin !== null || salaryMax !== null
        ? `${salaryCurrency} ${salaryMin ?? ''}${salaryMin !== null && salaryMax !== null ? '–' : ''}${salaryMax ?? ''}`.trim()
        : null;

    return {
        provider: 'applyguy',
        externalId: id,
        companyName: requiredText(detail.company, 'ApplyGuy detail company'),
        title: requiredText(detail.title, 'ApplyGuy detail title'),
        location: optionalText(detail.location) ?? job.location,
        sourceUrl: job.listingUrl,
        applyUrl: httpUrl(detail.url, 'ApplyGuy detail URL'),
        descriptionHtml: optionalText(detail.descriptionHtml),
        salaryText,
        postingTime: { kind: 'calendar-date', date: job.posted },
    };
}

/** Resolves one feed entry through its ATS client or ApplyGuy's paid detail API. */
export async function jobDraftToJobCandidate(
    value: unknown,
    apiKey: string,
    fetcher: typeof fetch = fetch,
): Promise<JobCandidate> {
    const job = postingToJobDraft(value);
    const hostname = new URL(job.listingUrl).hostname;
    if (
        hostname === 'boards.greenhouse.io' ||
        hostname === 'job-boards.greenhouse.io'
    ) {
        return getGreenhouseJobDetails(job.listingUrl, fetcher);
    }
    if (hostname === 'jobs.lever.co' || hostname === 'jobs.eu.lever.co') {
        return fetchLeverJobDetails(job.listingUrl, job.companyName, fetcher);
    }
    if (hostname === 'jobs.ashbyhq.com') {
        return ashby.fetchJobDetails(job.listingUrl, job.companyName, fetcher);
    }
    return fetchJobDetails(job, apiKey, fetcher);
}

/** Fetches the public new-grad feed and fully resolves each job posting. */
export async function getJobCandidates(
    apiKey: string,
    fetcher: typeof fetch = fetch,
): Promise<JobCandidate[]> {
    const body = record(await fetchJson(APPLYGUY_FEED_URL, 'ApplyGuy', fetcher), 'ApplyGuy feed');
    if (!Array.isArray(body.jobs)) throw new Error('ApplyGuy feed does not contain a jobs array');
    const candidates: JobCandidate[] = [];
    for (const job of body.jobs) candidates.push(await jobDraftToJobCandidate(job, apiKey, fetcher));
    return candidates;
}
