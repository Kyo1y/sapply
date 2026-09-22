/** Rejects non-object JSON values from a provider response. */
export function record(value: unknown, label: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
    return value as Record<string, unknown>;
}

/** Requires a non-empty text field from a provider response. */
export function requiredText(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${label} must be a non-empty string`);
    }
    return value.trim();
}

/** Returns a trimmed optional text field, or null when absent. */
export function optionalText(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : null;
}

/** Validates and normalizes an HTTP or HTTPS URL. */
export function httpUrl(value: unknown, label: string): string {
    const text = requiredText(value, label);
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        throw new Error(`${label} must be an HTTP URL`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`${label} must be an HTTP URL`);
    }
    return url.toString();
}

/** Parses either an ISO timestamp or milliseconds since the Unix epoch. */
export function timestamp(value: unknown, label: string): Date {
    const milliseconds = typeof value === 'number'
        ? value
        : typeof value === 'string' && /^\d+$/.test(value)
            ? Number(value)
            : typeof value === 'string'
                ? Date.parse(value)
                : NaN;
    if (!Number.isFinite(milliseconds) || !Number.isFinite(new Date(milliseconds).getTime())) {
        throw new Error(`${label} must be a valid timestamp`);
    }
    return new Date(milliseconds);
}

/** Fetches a JSON response and surfaces a provider-specific HTTP error. */
export async function fetchJson(url: string, provider: string, fetcher: typeof fetch): Promise<unknown> {
    const response = await fetcher(url, { headers: { accept: 'application/json' } });
    if (!response.ok) {
        throw new Error(`${provider} returned HTTP ${response.status}`);
    }
    return response.json();
}
