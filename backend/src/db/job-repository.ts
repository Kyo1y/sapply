import { drizzle } from 'drizzle-orm/d1';
import type { FilteredJobCandidates } from '../jobs/filter-job-candidates';
import type { JobCandidate } from '../types/job-candidate';
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
