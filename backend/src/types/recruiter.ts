import { z } from 'zod';
import type { recruitersTable } from '../db/schema';

/** A saved recruiter row; scores and reason are null before selection. */
export type Recruiter = typeof recruitersTable.$inferSelect;

/** A contactable recruiter returned by Autumn for one job. */
export type RecruiterCandidate = {
    name: string;
    title: string;
    email: string;
    linkedinUrl: string | null;
};

/** The job facts Autumn uses to find relevant recruiters. */
export type RecruiterSearchContext = {
    jobId: string;
    companyName: string;
    jobTitle: string;
    jobLocation: string | null;
    jobUrl: string;
};

/** The model's scores and supporting evidence for one recruiter. */
export const recruiterScoreSchema = z.strictObject({
    email: z.string(),
    role_score: z.union([z.literal(0), z.literal(35), z.literal(70)]),
    hiring_signal_score: z.int().min(0).max(15),
    human_signal_score: z.int().min(0).max(15),
    total_score: z.int().min(0).max(100),
    explanation: z.string(),
    sources: z.array(z.string()),
});

/** The complete structured response requested from the model. */
export const recruiterScoresSchema = z.strictObject({
    recruiters: z.array(recruiterScoreSchema),
});

export type RecruiterScore = z.infer<typeof recruiterScoreSchema>;
export type RecruiterScores = z.infer<typeof recruiterScoresSchema>;

/** All scores, plus the highest-scoring recruiter selected by our code. */
export type RecruiterSelection = RecruiterScores & { selected: RecruiterScore };
