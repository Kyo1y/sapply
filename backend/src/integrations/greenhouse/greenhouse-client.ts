const GREENHOUSE_API_ROOT = 'https://boards-api.greenhouse.io/v1/boards';

export type GreenhouseJobSummary = {
    id: number;
    title: string;
    updatedAt: Date;
};

export type GreenhouseJob = {
    id: number;
    title: string;
    location: string | null;
    sourceUrl: string;
    postedAt: Date;
    postingHtml: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDate(value: unknown, field: string): Date {
    if (typeof value !== 'string') {
        throw new Error(`Greenhouse ${field} must be a timestamp`);
    }

    const milliseconds = Date.parse(value);

    if (Number.isNaN(milliseconds)) {
        throw new Error(`Greenhouse ${field} is not a valid timestamp`);
    }

    return new Date(milliseconds);
}

function parseJobId(value: unknown): number {
    if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value <= 0
    ) {
        throw new Error('Greenhouse job id must be a positive integer');
    }

    return value;
}

function parseTitle(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error('Greenhouse job title must be a non-empty string');
    }

    return value.trim();
}

function parseHttpUrl(value: unknown): string {
    if (typeof value !== 'string') {
        throw new Error('Greenhouse absolute_url must be a URL');
    }

    let url: URL;

    try {
        url = new URL(value);
    } catch {
        throw new Error('Greenhouse absolute_url must be a URL');
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Greenhouse absolute_url must use HTTP or HTTPS');
    }

    return url.toString();
}

function parseLocation(value: unknown): string | null {
    if (!isRecord(value) || typeof value.name !== 'string') {
        return null;
    }

    const location = value.name.trim();
    return location.length > 0 ? location : null;
}

export function parseGreenhouseJobList(value: unknown): GreenhouseJobSummary[] {
    if (!isRecord(value) || !Array.isArray(value.jobs)) {
        throw new Error('Greenhouse job list does not contain a jobs array');
    }

    return value.jobs.map((job) => {
        if (!isRecord(job)) {
            throw new Error('Greenhouse job list contains an invalid job');
        }

        return {
            id: parseJobId(job.id),
            title: parseTitle(job.title),
            updatedAt: parseDate(job.updated_at, 'updated_at'),
        };
    });
}

export function parseGreenhouseJob(value: unknown): GreenhouseJob {
    if (!isRecord(value)) {
        throw new Error('Greenhouse job response must be an object');
    }

    if (typeof value.content !== 'string') {
        throw new Error('Greenhouse job content must be a string');
    }

    return {
        id: parseJobId(value.id),
        title: parseTitle(value.title),
        location: parseLocation(value.location),
        sourceUrl: parseHttpUrl(value.absolute_url),
        postedAt: parseDate(value.first_published, 'first_published'),
        postingHtml: value.content,
    };
}

async function getJson(
    url: string,
    fetcher: typeof fetch,
): Promise<unknown> {
    const response = await fetcher(url, {
        headers: { accept: 'application/json' },
    });

    if (!response.ok) {
        throw new Error(`Greenhouse returned HTTP ${response.status}`);
    }

    return response.json();
}

export async function listGreenhouseJobs(
    boardToken: string,
    fetcher: typeof fetch = fetch,
): Promise<GreenhouseJobSummary[]> {
    const url = `${GREENHOUSE_API_ROOT}/${encodeURIComponent(boardToken)}/jobs`;
    const body = await getJson(url, fetcher);
    return parseGreenhouseJobList(body);
}

export async function getGreenhouseJob(
    boardToken: string,
    jobId: number,
    fetcher: typeof fetch = fetch,
): Promise<GreenhouseJob> {
    const url = `${GREENHOUSE_API_ROOT}/${encodeURIComponent(boardToken)}/jobs/${jobId}`;
    const body = await getJson(url, fetcher);
    return parseGreenhouseJob(body);
}
