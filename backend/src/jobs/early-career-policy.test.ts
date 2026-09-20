import { describe, expect, it } from 'vitest';
import type {
    GreenhouseJob,
    GreenhouseJobSummary,
} from '../integrations/greenhouse/greenhouse-client';
import {
    isEarlyCareerJob,
    isPotentialEarlyCareerJob,
    wasPublishedWithinLastDay,
} from './early-career-policy';

const now = new Date('2026-09-19T20:00:00Z');

function summary(
    title: string,
    updatedAt = new Date('2026-09-19T10:00:00Z'),
): GreenhouseJobSummary {
    return { id: 1, title, updatedAt };
}

function job(title: string, postingHtml: string): GreenhouseJob {
    return {
        id: 1,
        title,
        location: 'New York, NY',
        sourceUrl: 'https://example.com/jobs/1',
        postedAt: new Date('2026-09-19T10:00:00Z'),
        postingHtml,
    };
}

describe('wasPublishedWithinLastDay', () => {
    it('accepts a past timestamp younger than 24 hours', () => {
        expect(wasPublishedWithinLastDay(
            new Date('2026-09-18T20:00:01Z'),
            now,
        )).toBe(true);
    });

    it('rejects timestamps exactly 24 hours old and future timestamps', () => {
        expect(wasPublishedWithinLastDay(
            new Date('2026-09-18T20:00:00Z'),
            now,
        )).toBe(false);
        expect(wasPublishedWithinLastDay(
            new Date('2026-09-19T20:00:01Z'),
            now,
        )).toBe(false);
    });
});

describe('isPotentialEarlyCareerJob', () => {
    it('keeps a recently updated technical job for detail inspection', () => {
        expect(isPotentialEarlyCareerJob(
            summary('Software Engineer'),
            now,
        )).toBe(true);
    });

    it('rejects senior and stale jobs before fetching details', () => {
        expect(isPotentialEarlyCareerJob(
            summary('Senior Software Engineer'),
            now,
        )).toBe(false);
        expect(isPotentialEarlyCareerJob(
            summary(
                'Software Engineer I',
                new Date('2026-09-18T19:59:59Z'),
            ),
            now,
        )).toBe(false);
    });

    it('does not treat every AI or engineering title as software-adjacent', () => {
        expect(isPotentialEarlyCareerJob(
            summary('AI Product Manager'),
            now,
        )).toBe(false);
        expect(isPotentialEarlyCareerJob(
            summary('Mechanical Engineer I'),
            now,
        )).toBe(false);
    });
});

describe('isEarlyCareerJob', () => {
    it('accepts explicit early-career titles', () => {
        expect(isEarlyCareerJob(job(
            'Software Engineer, New Grad (2027)',
            '<p>Build production systems.</p>',
        ))).toBe(true);
        expect(isEarlyCareerJob(job(
            'Software Engineer I',
            '<p>Build production systems.</p>',
        ))).toBe(true);
    });

    it('accepts a generic title with an early experience requirement', () => {
        expect(isEarlyCareerJob(job(
            'Software Engineer',
            '<p>Bring 0-2 years of professional experience.</p>',
        ))).toBe(true);
    });

    it('rejects a generic title without early-career evidence', () => {
        expect(isEarlyCareerJob(job(
            'Software Engineer',
            '<p>Bring 5+ years of professional experience.</p>',
        ))).toBe(false);
    });

    it('does not mistake mentoring junior engineers for an entry-level role', () => {
        expect(isEarlyCareerJob(job(
            'Software Engineer',
            '<p>Mentor junior engineers. Bring 5+ years of experience.</p>',
        ))).toBe(false);
    });
});
