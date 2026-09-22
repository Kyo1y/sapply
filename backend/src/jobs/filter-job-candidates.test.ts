import { describe, expect, it } from 'vitest';
import type { JobCandidate } from '../types/job-candidate';
import { filterJobCandidate, filterJobCandidates } from './filter-job-candidates';

const now = new Date('2026-09-22T18:00:00Z');

function candidate(overrides: Partial<JobCandidate> = {}): JobCandidate {
    return {
        provider: 'greenhouse',
        externalId: 'job-1',
        companyName: 'Example',
        title: 'Software Engineer I',
        location: 'New York, NY',
        sourceUrl: 'https://example.com/jobs/1',
        applyUrl: 'https://example.com/jobs/1/apply',
        descriptionHtml: '<p>Early-career role</p>',
        salaryText: null,
        postingTime: { kind: 'timestamp', at: new Date('2026-09-20T12:00:00Z') },
        ...overrides,
    };
}

describe('job candidate filter', () => {
    it('accepts a recent early-career US job', () => {
        expect(filterJobCandidate(candidate(), now)).toEqual({ accepted: true });
    });

    it('returns every reason a candidate fails', () => {
        expect(filterJobCandidate(candidate({
            title: 'Senior Mechanical Engineer',
            location: 'Toronto, Canada',
            postingTime: { kind: 'timestamp', at: new Date('2026-09-10T12:00:00Z') },
        }), now)).toEqual({
            accepted: false,
            reasons: [
                'not_early_career',
                'explicit_non_us_location',
                'older_than_120_hours',
            ],
        });
    });

    it('uses calendar days for date-only postings', () => {
        expect(filterJobCandidate(candidate({
            postingTime: { kind: 'calendar-date', date: '2026-09-17' },
        }), now)).toEqual({ accepted: true });
        expect(filterJobCandidate(candidate({
            postingTime: { kind: 'calendar-date', date: '2026-09-16' },
        }), now)).toEqual({
            accepted: false,
            reasons: ['older_than_120_hours'],
        });
    });

    it('uses LinkedIn displayed age within its declared search window', () => {
        expect(filterJobCandidate(candidate({
            postingTime: { kind: 'recent-window', hours: 120, displayedAge: '5 days ago' },
        }), now)).toEqual({ accepted: true });
        expect(filterJobCandidate(candidate({
            postingTime: { kind: 'recent-window', hours: 120, displayedAge: '1 week ago' },
        }), now)).toEqual({
            accepted: false,
            reasons: ['older_than_120_hours'],
        });
    });

    it('splits a batch without losing rejected candidates or reasons', () => {
        const acceptedCandidate = candidate();
        const rejectedCandidate = candidate({ title: 'Senior Software Engineer' });

        expect(filterJobCandidates([acceptedCandidate, rejectedCandidate], now)).toEqual({
            accepted: [acceptedCandidate],
            rejected: [{
                candidate: rejectedCandidate,
                reasons: ['not_early_career'],
            }],
        });
    });
});
