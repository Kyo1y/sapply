import { z } from 'zod';
import type { CandidateProfile } from './candidate-profile';
import type { Job } from './job';
import type { RecruiterCandidate, RecruiterScore } from './recruiter';

/** The selected recruiter's contact details and scores, plus facts for drafting. */
export type OutreachContext = {
    recruiter: RecruiterCandidate & RecruiterScore;
    job: Pick<Job, 'companyName' | 'title' | 'location' | 'sourceUrl' | 'applyUrl' | 'postingHtml'>;
    candidate: CandidateProfile;
};

/** The email and the research explanation returned by the model. */
export const outreachDraftSchema = z.strictObject({
    subject: z.string().min(1),
    draftEmail: z.string().min(1),
    reason: z.string().min(1),
    sources: z.array(z.string()),
});

export type OutreachDraft = z.infer<typeof outreachDraftSchema>;
