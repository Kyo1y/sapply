import { and, asc, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { Recruiter, RecruiterCandidate, RecruiterSelection } from '../types/recruiter';
import * as schema from './schema';
import { recruitersTable } from './schema';

/** Lists a job's recruiters, highest-scoring first, including unscored candidates. */
export async function listRecruiters(d1: D1Database, jobId: string): Promise<Recruiter[]> {
    const db = drizzle(d1, { schema });
    return db.select().from(recruitersTable)
        .where(eq(recruitersTable.jobId, jobId))
        .orderBy(desc(recruitersTable.total_score), asc(recruitersTable.email));
}

/** Saves Autumn contacts once without resetting existing scores or selection. */
export async function saveRecruiterCandidates(
    d1: D1Database,
    jobId: string,
    candidates: RecruiterCandidate[],
    savedAt: Date = new Date(),
): Promise<Recruiter[]> {
    const db = drizzle(d1, { schema });
    // One statement per contact keeps each statement below D1's bind-parameter limit.
    const [first, ...remaining] = candidates.map((candidate) => db.insert(recruitersTable)
        .values({ ...candidate, jobId, createdAt: savedAt, updatedAt: savedAt })
        .onConflictDoNothing({ target: [recruitersTable.jobId, recruitersTable.email] }));

    if (first) await db.batch([first, ...remaining]);
    return listRecruiters(d1, jobId);
}

/** Atomically saves all model scores and changes the selected recruiter for one job. */
export async function saveRecruiterSelection(
    d1: D1Database,
    jobId: string,
    selection: RecruiterSelection,
    savedAt: Date = new Date(),
): Promise<Recruiter[]> {
    const db = drizzle(d1, { schema });
    const stored = await db.select({ email: recruitersTable.email }).from(recruitersTable)
        .where(eq(recruitersTable.jobId, jobId));
    const scoreEmails = new Set(selection.recruiters.map((score) => score.email));
    if (stored.length === 0 || scoreEmails.size !== selection.recruiters.length
        || stored.length !== scoreEmails.size || stored.some((row) => !scoreEmails.has(row.email))) {
        throw new Error('Scores must cover every saved recruiter for this job exactly once');
    }
    if (!scoreEmails.has(selection.selected.email)) {
        throw new Error('The selected recruiter must be included in the scores');
    }

    await db.batch([
        db.update(recruitersTable).set({ selected: false })
            .where(eq(recruitersTable.jobId, jobId)),
        ...selection.recruiters.map((score) => db.update(recruitersTable).set({
            role_score: score.role_score,
            hiring_signal_score: score.hiring_signal_score,
            human_signal_score: score.human_signal_score,
            total_score: score.total_score,
            reason: score.explanation,
            sources: score.sources,
            selected: score.email === selection.selected.email,
            updatedAt: savedAt,
        }).where(and(eq(recruitersTable.jobId, jobId), eq(recruitersTable.email, score.email)))),
    ]);
    return listRecruiters(d1, jobId);
}

/** Returns the selected contact and saved research, or null before selection. */
export async function getSelectedRecruiter(d1: D1Database, jobId: string): Promise<Recruiter | null> {
    const db = drizzle(d1, { schema });
    const row = await db.select().from(recruitersTable)
        .where(and(eq(recruitersTable.jobId, jobId), eq(recruitersTable.selected, true))).get();
    return row ?? null;
}
