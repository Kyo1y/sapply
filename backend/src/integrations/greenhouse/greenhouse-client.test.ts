import { describe, expect, it, vi } from 'vitest';
import { getJobDetails } from './greenhouse-client';

describe('getJobDetails', () => {
    it('rejects a URL without a Greenhouse board and job ID before fetching', async () => {
        const fetcher = vi.fn() as unknown as typeof fetch;
        await expect(getJobDetails('https://boards.greenhouse.io/example', fetcher))
            .rejects.toThrow('Invalid Greenhouse job URL');
        expect(fetcher).not.toHaveBeenCalled();
    });
});
