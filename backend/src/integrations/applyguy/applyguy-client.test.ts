import { describe, expect, it } from 'vitest';
import { parseApplyGuyCompanyFeed } from './applyguy-client';

describe('parseApplyGuyCompanyFeed', () => {
    it('parses valid company observations and counts rejected jobs', () => {
        const result = parseApplyGuyCompanyFeed({
            updatedAt: '2026-09-19T19:15:37.556Z',
            jobs: [
                {
                    company: 'Together AI',
                    listingUrl: 'https://job-boards.greenhouse.io/togetherai/jobs/1',
                },
                { company: 'Microsoft' },
                { title: 'Missing company' },
            ],
        });

        expect(result).toEqual({
            updatedAt: '2026-09-19T19:15:37.556Z',
            observations: [
                {
                    name: 'Together AI',
                    listingUrl: 'https://job-boards.greenhouse.io/togetherai/jobs/1',
                },
                { name: 'Microsoft', listingUrl: null },
            ],
            rejectedJobs: 1,
        });
    });

    it('rejects a payload without a jobs array', () => {
        expect(() => parseApplyGuyCompanyFeed({ jobs: null }))
            .toThrow('ApplyGuy feed does not contain a jobs array');
    });
});
