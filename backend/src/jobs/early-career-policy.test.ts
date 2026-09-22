import { describe, expect, it } from 'vitest';
import {
    isPotentialEarlyCareerTitle,
    isPotentialUSLocation,
    isRecentDisplayedAge,
} from './early-career-policy';

describe('job card pre-filter', () => {
    it('keeps software-adjacent titles but rejects senior and unrelated roles', () => {
        expect(isPotentialEarlyCareerTitle('Software Engineer I')).toBe(true);
        expect(isPotentialEarlyCareerTitle('Frontend Developer')).toBe(true);
        expect(isPotentialEarlyCareerTitle('Senior Software Engineer')).toBe(false);
        expect(isPotentialEarlyCareerTitle('Mechanical Engineer I')).toBe(false);
    });

    it('keeps recent labels and rejects clearly stale labels', () => {
        expect(isRecentDisplayedAge('9 hours ago')).toBe(true);
        expect(isRecentDisplayedAge('5 days ago')).toBe(true);
        expect(isRecentDisplayedAge('1 week ago')).toBe(false);
        expect(isRecentDisplayedAge(null)).toBe(true);
    });

    it('keeps US and unknown locations but rejects explicit non-US locations', () => {
        expect(isPotentialUSLocation('New York, NY')).toBe(true);
        expect(isPotentialUSLocation('Remote')).toBe(true);
        expect(isPotentialUSLocation(null)).toBe(true);
        expect(isPotentialUSLocation('Toronto, Canada')).toBe(false);
        expect(isPotentialUSLocation('London, UK (Remote)')).toBe(false);
    });
});
