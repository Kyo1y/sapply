import { describe, expect, it } from 'vitest';
import { parseGreenhouseJobCards } from './greenhouse-client';

describe('parseGreenhouseJobCards', () => {
    it('reads the fields used before fetching full details', () => {
        expect(parseGreenhouseJobCards({
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

    it('rejects a malformed list response', () => {
        expect(() => parseGreenhouseJobCards({ jobs: null }))
            .toThrow('Greenhouse job list does not contain a jobs array');
    });
});
