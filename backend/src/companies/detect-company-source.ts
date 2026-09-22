import type { DetectedCompanySource } from '../types/company';

/** Splits a URL path into its nonempty parts. */
function pathSegments(url: URL): string[] {
    return url.pathname.split('/').filter((segment) => segment.length > 0);
}

/** Recognizes supported ATS URLs and extracts their company-board identifier. */
export default function detectCompanySource(
    value: string,
): DetectedCompanySource | null {
    let url: URL;

    try {
        url = new URL(value);
    } catch {
        return null;
    }

    const hostname = url.hostname.toLowerCase();
    const segments = pathSegments(url);

    if (
        hostname === 'job-boards.greenhouse.io' ||
        hostname === 'job-boards.eu.greenhouse.io' ||
        hostname === 'boards.greenhouse.io'
    ) {
        const embeddedBoard = url.searchParams.get('for');
        const pathBoard = segments[0] === 'embed' ? undefined : segments[0];
        const board = embeddedBoard ?? pathBoard;

        if (!board) {
            return null;
        }

        return {
            provider: 'greenhouse',
            externalKey: board.toLowerCase(),
            sourceUrl: `${url.origin}/${board}`,
        };
    }

    if (hostname === 'jobs.ashbyhq.com') {
        const board = segments[0];

        if (!board) {
            return null;
        }

        return {
            provider: 'ashby',
            externalKey: board.toLowerCase(),
            sourceUrl: `${url.origin}/${board}`,
        };
    }

    if (hostname === 'jobs.lever.co' || hostname === 'jobs.eu.lever.co') {
        const board = segments[0];

        if (!board) {
            return null;
        }

        return {
            provider: 'lever',
            externalKey: `${hostname}/${board.toLowerCase()}`,
            sourceUrl: `${url.origin}/${board}`,
        };
    }

    if (hostname.endsWith('.myworkdayjobs.com')) {
        const site = segments[0];

        if (!site) {
            return null;
        }

        return {
            provider: 'workday',
            externalKey: `${hostname}/${site.toLowerCase()}`,
            sourceUrl: `${url.origin}/${site}`,
        };
    }

    return null;
}
