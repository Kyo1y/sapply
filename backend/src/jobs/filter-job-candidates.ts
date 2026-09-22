import type { JobCandidate } from '../types/job-candidate';
import {
    isPotentialEarlyCareerTitle,
    isPotentialUSLocation,
    isRecentDisplayedAge,
} from './early-career-policy';

const MAX_AGE_HOURS = 120;
const MAX_AGE_MILLISECONDS = MAX_AGE_HOURS * 60 * 60 * 1000;
const MAX_AGE_CALENDAR_DAYS = 5;

export type JobCandidateRejectionReason =
    | 'not_early_career'
    | 'explicit_non_us_location'
    | 'older_than_120_hours';

export type JobCandidateFilterDecision =
    | { accepted: true }
    | {
        accepted: false;
        reasons: [JobCandidateRejectionReason, ...JobCandidateRejectionReason[]];
    };

export type RejectedJobCandidate = {
    candidate: JobCandidate;
    reasons: [JobCandidateRejectionReason, ...JobCandidateRejectionReason[]];
};

export type FilteredJobCandidates = {
    accepted: JobCandidate[];
    rejected: RejectedJobCandidate[];
};

/** Determines recency without pretending a calendar date has exact-time precision. */
function isRecentPosting(
    postingTime: JobCandidate['postingTime'],
    now: Date,
): boolean {
    switch (postingTime.kind) {
        case 'timestamp':
            return now.getTime() - postingTime.at.getTime() <= MAX_AGE_MILLISECONDS;
        case 'calendar-date': {
            const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
            const posted = Date.parse(`${postingTime.date}T00:00:00Z`);
            const ageInCalendarDays = Math.floor((today - posted) / (24 * 60 * 60 * 1000));
            return ageInCalendarDays <= MAX_AGE_CALENDAR_DAYS;
        }
        case 'recent-window':
            return postingTime.hours <= MAX_AGE_HOURS &&
                isRecentDisplayedAge(postingTime.displayedAge);
        default: {
            const unhandled: never = postingTime;
            return unhandled;
        }
    }
}

/** Applies every bare-minimum rule to one normalized job candidate. */
export function filterJobCandidate(
    candidate: JobCandidate,
    now: Date = new Date(),
): JobCandidateFilterDecision {
    const reasons: JobCandidateRejectionReason[] = [];
    if (!isPotentialEarlyCareerTitle(candidate.title)) reasons.push('not_early_career');
    if (!isPotentialUSLocation(candidate.location)) reasons.push('explicit_non_us_location');
    if (!isRecentPosting(candidate.postingTime, now)) reasons.push('older_than_120_hours');

    const [firstReason, ...remainingReasons] = reasons;
    return firstReason === undefined
        ? { accepted: true }
        : { accepted: false, reasons: [firstReason, ...remainingReasons] };
}

/** Splits normalized candidates into accepted jobs and explainable rejections. */
export function filterJobCandidates(
    candidates: JobCandidate[],
    now: Date = new Date(),
): FilteredJobCandidates {
    const accepted: JobCandidate[] = [];
    const rejected: RejectedJobCandidate[] = [];

    for (const candidate of candidates) {
        const decision = filterJobCandidate(candidate, now);
        if (decision.accepted) accepted.push(candidate);
        else rejected.push({ candidate, reasons: decision.reasons });
    }
    return { accepted, rejected };
}
