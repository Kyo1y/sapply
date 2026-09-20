import { describe, expect, it } from 'vitest';
import {
    parseGreenhouseJob,
    parseGreenhouseJobList,
} from './greenhouse-client';

describe('parseGreenhouseJobList', () => {
    it('parses the fields needed to choose job details', () => {
        expect(parseGreenhouseJobList({
            jobs: [{
                id: 8747134002,
                title: 'Software Engineer I',
                updated_at: '2026-09-19T10:30:00Z',
            }],
        })).toEqual([{
            id: 8747134002,
            title: 'Software Engineer I',
            updatedAt: new Date('2026-09-19T10:30:00Z'),
        }]);
    });

    it('rejects a malformed response', () => {
        expect(() => parseGreenhouseJobList({ jobs: null }))
            .toThrow('Greenhouse job list does not contain a jobs array');
    });
});

describe('parseGreenhouseJob', () => {
    it('parses an employer publication timestamp and official URL', () => {
        expect(parseGreenhouseJob({
            id: 8747134002,
            title: 'Software Engineer I',
            location: { name: 'Long Beach, CA' },
            absolute_url: 'https://boards.greenhouse.io/relativity/jobs/8747134002',
            first_published: '2026-09-19T09:00:00Z',
            content: '<p>0-2 years of experience</p>',
        })).toEqual({
            id: 8747134002,
            title: 'Software Engineer I',
            location: 'Long Beach, CA',
            sourceUrl: 'https://boards.greenhouse.io/relativity/jobs/8747134002',
            postedAt: new Date('2026-09-19T09:00:00Z'),
            postingHtml: '<p>0-2 years of experience</p>',
        });
    });

    it('rejects a job without first_published', () => {
        expect(() => parseGreenhouseJob({
            id: 1,
            title: 'Software Engineer I',
            location: { name: 'New York, NY' },
            absolute_url: 'https://example.com/jobs/1',
            content: '<p>Job</p>',
        })).toThrow('Greenhouse first_published must be a timestamp');
    });
});
