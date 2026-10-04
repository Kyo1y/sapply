import { completeJobPreparation, getJob, saveJobPreparationError } from '../db/job-repository';
import { getEmailDraft, saveOutreachDraft } from '../db/outreach-repository';
import {
    getSelectedRecruiter, listRecruiters, saveRecruiterCandidates, saveRecruiterSelection,
} from '../db/recruiter-repository';
import { getRecruitersAutumn } from '../integrations/autumn/autumn-client';
import { draftOutreach } from '../outreach/outreach-service';
import { selectRecruiter } from '../recruiters/recruiter-service';
import type { CandidateProfile } from '../types/candidate-profile';
import type { Job } from '../types/job';
import type { EmailDraft } from '../types/outreach';
import { recruiterScoreSchema, type Recruiter } from '../types/recruiter';

export type PreparationResult = {
    job: Job;
    recruiter: Recruiter;
    emailDraft: EmailDraft;
};

/** Prepares one accepted job, saves each completed step, and resumes saved work on retries.
 * Callers must run only one preparation at a time per job. This function does not schedule work or send email.
 */
export async function prepareJob({
    d1, jobId, candidate, autumnApiKey, openaiApiKey, fetcher = fetch,
}: {
    d1: D1Database;
    jobId: string;
    candidate: CandidateProfile;
    autumnApiKey: string;
    openaiApiKey: string;
    fetcher?: typeof fetch;
}): Promise<PreparationResult> {
    const job = await getJob(d1, jobId);
    if (!job) throw new Error(`Job ${jobId} does not exist`);
    if (job.status !== 'preparing' && job.status !== 'pending') {
        throw new Error(`Job ${jobId} must be preparing or pending, not ${job.status}`);
    }

    try {
        let recruiter = await getSelectedRecruiter(d1, jobId);
        if (job.status === 'pending') {
            const emailDraft = recruiter ? await getEmailDraft(d1, jobId, recruiter.email) : null;
            if (!recruiter || !emailDraft) throw new Error(`Pending job ${jobId} has incomplete preparation`);
            return { job, recruiter, emailDraft };
        }

        if (!recruiter) {
            let contacts = await listRecruiters(d1, jobId);
            if (contacts.length === 0) {
                if (!job.companyName || !job.title) {
                    throw new Error(`Job ${jobId} needs a company name and title for recruiter research`);
                }
                const candidates = await getRecruitersAutumn({
                    jobId,
                    companyName: job.companyName,
                    jobTitle: job.title,
                    jobLocation: job.location,
                    jobUrl: job.applyUrl ?? job.sourceUrl,
                }, autumnApiKey, fetcher);
                contacts = await saveRecruiterCandidates(d1, jobId, candidates);
            }
            if (contacts.length === 0) throw new Error(`No recruiters with email addresses found for job ${jobId}`);

            const selection = await selectRecruiter(contacts, openaiApiKey, fetcher);
            const updatedContacts = await saveRecruiterSelection(d1, jobId, selection);
            recruiter = updatedContacts.find((c) => c.selected) ?? null;
            if (!recruiter) throw new Error(`No selected recruiter saved for job ${jobId}`);
        }

        let emailDraft = await getEmailDraft(d1, jobId, recruiter.email);
        if (!emailDraft) {
            // Narrow nullable database scores and translate the stored reason into the model's explanation field.
            const score = recruiterScoreSchema.parse({
                email: recruiter.email,
                role_score: recruiter.role_score,
                hiring_signal_score: recruiter.hiring_signal_score,
                human_signal_score: recruiter.human_signal_score,
                total_score: recruiter.total_score,
                explanation: recruiter.reason,
                sources: recruiter.sources,
            });
            const draft = await draftOutreach({
                recruiter: { ...recruiter, ...score }, job, candidate,
            }, openaiApiKey, fetcher);
            emailDraft = await saveOutreachDraft(d1, jobId, recruiter.email, draft);
            if (!emailDraft) throw new Error(`No outreach draft saved for job ${jobId}`);
        }

        const preparedJob = await completeJobPreparation(d1, jobId);
        if (!preparedJob) throw new Error(`Could not complete preparation for job ${jobId}`);
        return { job: preparedJob, recruiter, emailDraft };
    } catch (error) {
        await saveJobPreparationError(d1, jobId, error instanceof Error ? error.message : String(error));
        throw error;
    }
}
