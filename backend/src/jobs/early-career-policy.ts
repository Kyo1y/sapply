import type {
    GreenhouseJob,
    GreenhouseJobSummary,
} from '../integrations/greenhouse/greenhouse-client';

const ONE_DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const SENIOR_TITLE = /\b(?:senior|sr\.?|staff|principal|lead|manager|director|head|architect|vice president|vp)\b/i;
const HIGHER_LEVEL_TITLE = /\b(?:engineer|developer)\s+(?:ii|iii|iv|v|[2-9])\b|\blevel\s+(?:ii|iii|iv|v|[2-9])\b/i;
const TECHNICAL_ROLE_TITLE = /\b(?:software\s+(?:engineer|developer)|(?:front[ -]?end|back[ -]?end|full[ -]?stack|web|mobile|ios|android|machine learning|ml|ai|data|site reliability|devops|platform|infrastructure|cloud|security|systems|product)\s+(?:engineer|developer)|sre|qa\s+(?:engineer|analyst)|quality assurance\s+(?:engineer|analyst)|test automation\s+engineer|developer)\b/i;
const EARLY_CAREER_TITLE = /\b(?:new grad(?:uate)?|new college grad(?:uate)?|recent grad(?:uate)?|university grad(?:uate)?|early career|entry[ -]?level|junior|jr\.?|associate|campus hire|intern(?:ship)?)\b/i;
const EARLY_CAREER_DESCRIPTION = /\b(?:new grad(?:uate)?|new college grad(?:uate)?|recent grad(?:uate)?|university grad(?:uate)?|early career|entry[ -]?level|campus hire)\b/i;
const LEVEL_ONE_TITLE = /\b(?:engineer|developer)\s+(?:i|1)\b|\blevel\s+(?:i|1)\b/i;
const EARLY_EXPERIENCE_RANGE = /\b(?:0|1)\s*(?:-|–|—|to)\s*(?:1|2|3)\s+years?\b/i;
const EARLY_EXPERIENCE_MAXIMUM = /\b(?:up to|less than)\s+(?:1|2|3|one|two|three)\s+years?\b/i;
const LITTLE_EXPERIENCE = /\b(?:0|1)\+?\s+years?\s+(?:of\s+)?(?:professional|industry|work|relevant)?\s*experience\b/i;
const NO_EXPERIENCE = /\b(?:no (?:prior )?experience (?:is )?required|zero years? of experience)\b/i;
const GRADUATION_YEAR_TITLE = /\b20(?:26|27)\b/;

export function wasPublishedWithinLastDay(
    timestamp: Date,
    now: Date,
): boolean {
    const age = now.getTime() - timestamp.getTime();
    return age >= 0 && age < ONE_DAY_IN_MILLISECONDS;
}

export function isPotentialEarlyCareerJob(
    job: GreenhouseJobSummary,
    now: Date,
): boolean {
    if (!wasPublishedWithinLastDay(job.updatedAt, now)) {
        return false;
    }

    return TECHNICAL_ROLE_TITLE.test(job.title) &&
        !SENIOR_TITLE.test(job.title) &&
        !HIGHER_LEVEL_TITLE.test(job.title);
}

export function isEarlyCareerJob(job: GreenhouseJob): boolean {
    return EARLY_CAREER_TITLE.test(job.title) ||
        LEVEL_ONE_TITLE.test(job.title) ||
        GRADUATION_YEAR_TITLE.test(job.title) ||
        EARLY_CAREER_DESCRIPTION.test(job.postingHtml) ||
        EARLY_EXPERIENCE_RANGE.test(job.postingHtml) ||
        EARLY_EXPERIENCE_MAXIMUM.test(job.postingHtml) ||
        LITTLE_EXPERIENCE.test(job.postingHtml) ||
        NO_EXPERIENCE.test(job.postingHtml);
}
