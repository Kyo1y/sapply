import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { FilteredJobCandidates } from '../jobs/filter-job-candidates';
import type { JobAssessment } from '../types/job-assessment';
import type { JobCandidate } from '../types/job-candidate';
import type { Job } from '../types/job';
import * as schema from './schema';
import { jobsTable } from './schema';

export type SaveFilteredJobCandidatesResult = {
    accepted: number;
    created: number;
    duplicates: number;
    rejected: number;
};

function postingFields(postingTime: JobCandidate['postingTime']): {
    postedAt: Date | null;
    displayedAge: string | null;
} {
    switch (postingTime.kind) {
        case 'timestamp':
            return { postedAt: postingTime.at, displayedAge: null };
        case 'calendar-date':
            return {
                postedAt: new Date(`${postingTime.date}T00:00:00Z`),
                displayedAge: null,
            };
        case 'recent-window':
            return { postedAt: null, displayedAge: postingTime.displayedAge };
        default: {
            const unhandled: never = postingTime;
            return unhandled;
        }
    }
}

/** Inserts accepted candidates once and never changes existing jobs or rejected candidates. */
export async function saveFilteredJobCandidates(
    d1: D1Database,
    filtered: FilteredJobCandidates,
    savedAt: Date = new Date(),
): Promise<SaveFilteredJobCandidatesResult> {
    const db = drizzle(d1, { schema });
    let created = 0;

    for (const candidate of filtered.accepted) {
        const inserted = await db
            .insert(jobsTable)
            .values({
                id: crypto.randomUUID(),
                provider: candidate.provider,
                externalId: candidate.externalId,
                companyName: candidate.companyName,
                sourceUrl: candidate.sourceUrl,
                applyUrl: candidate.applyUrl,
                title: candidate.title,
                location: candidate.location,
                ...postingFields(candidate.postingTime),
                salaryText: candidate.salaryText,
                postingHtml: candidate.descriptionHtml,
                status: 'assessing',
                createdAt: savedAt,
                updatedAt: savedAt,
            })
            .onConflictDoNothing()
            .returning({ id: jobsTable.id })
            .get();

        if (inserted) created += 1;
    }

    return {
        accepted: filtered.accepted.length,
        created,
        duplicates: filtered.accepted.length - created,
        rejected: filtered.rejected.length,
    };
}

/** Stores one assessment and advances an assessing job to its next state. */
export async function saveJobAssessment(
    d1: D1Database,
    jobId: string,
    assessment: JobAssessment,
    assessedAt: Date = new Date(),
): Promise<Job | null> {
    const db = drizzle(d1, { schema });
    const assessmentDetails = assessment.fit
        ? {
            matchStrength: assessment.matchStrength,
            roleMatch: assessment.roleMatch,
            experienceFit: assessment.experienceFit,
            graduationEligibility: assessment.graduationEligibility,
            workAuthorization: assessment.workAuthorization,
            locationFit: assessment.locationFit,
            compensation: assessment.compensation,
            matchedSkills: assessment.matchedSkills,
            missingRequirements: assessment.missingRequirements,
        }
        : null;
    const updated = await db
        .update(jobsTable)
        .set({
            status: assessment.fit ? 'preparing' : 'not_fit',
            assessmentReason: assessment.fit ? null : assessment.reason,
            assessmentDetails,
            updatedAt: assessedAt,
        })
        .where(and(
            eq(jobsTable.id, jobId),
            eq(jobsTable.status, 'assessing'),
        ))
        .returning()
        .get();

    return updated ?? null;
}
