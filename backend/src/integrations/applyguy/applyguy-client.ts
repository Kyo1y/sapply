const APPLYGUY_FEED_URL =
    'https://raw.githubusercontent.com/ApplyGuy/2027-New-Grad-Jobs/main/data/new-grad-jobs.json';

export type ApplyGuyCompanyObservation = {
    name: string;
    listingUrl: string | null;
};

export type ApplyGuyCompanyFeed = {
    updatedAt: string | null;
    observations: ApplyGuyCompanyObservation[];
    rejectedJobs: number;
};

/** Narrows an unknown JSON value to a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extracts valid company observations from the untrusted ApplyGuy feed. */
export function parseApplyGuyCompanyFeed(value: unknown): ApplyGuyCompanyFeed {
    if (!isRecord(value) || !Array.isArray(value.jobs)) {
        throw new Error('ApplyGuy feed does not contain a jobs array');
    }

    const observations: ApplyGuyCompanyObservation[] = [];
    let rejectedJobs = 0;

    for (const job of value.jobs) {
        if (!isRecord(job) || typeof job.company !== 'string') {
            rejectedJobs += 1;
            continue;
        }

        const name = job.company.trim();

        if (name.length === 0) {
            rejectedJobs += 1;
            continue;
        }

        observations.push({
            name,
            listingUrl: typeof job.listingUrl === 'string' ? job.listingUrl : null,
        });
    }

    return {
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
        observations,
        rejectedJobs,
    };
}

/** Downloads and parses the current ApplyGuy new-grad company feed. */
export default async function fetchApplyGuyCompanyFeed(
    fetcher: typeof fetch = fetch,
): Promise<ApplyGuyCompanyFeed> {
    const response = await fetcher(APPLYGUY_FEED_URL, {
        headers: {
            accept: 'application/json',
            'user-agent': 'sapply-company-registry',
        },
    });

    if (!response.ok) {
        throw new Error(`ApplyGuy feed returned HTTP ${response.status}`);
    }

    const body: unknown = await response.json();
    return parseApplyGuyCompanyFeed(body);
}
