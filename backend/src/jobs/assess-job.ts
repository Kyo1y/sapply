import { DomUtils, parseDocument } from 'htmlparser2';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import type { CandidateProfile } from '../types/candidate-profile';
import {
    jobAssessmentSchema,
    type JobAssessment,
} from '../types/job-assessment';
import type { Job } from '../types/job';

const ASSESSMENT_MODEL = 'gpt-6-luna';
const assessmentResponseSchema = z.strictObject({ assessment: jobAssessmentSchema });

const ASSESSMENT_INSTRUCTIONS = `You assess whether a job is worth applying to for one candidate.

Use the supplied job and candidate profile as the source of truth. Use web search to investigate the company's current work-authorization policy and its history of H-1B sponsorship. Prefer the company's own careers pages and official government data. Historical sponsorship is positive evidence, but it does not guarantee sponsorship for this opening. A lack of public evidence means unknown, not that the company does not sponsor.

Assess the role, required skills and experience, graduation eligibility, work authorization, location, and base salary together. Missing salary or sponsorship information is unknown and is not enough to reject a job. Reject for sponsorship only when the posting or reliable current company policy explicitly says this candidate is ineligible or sponsorship is unavailable. The preferred location is a preference, not an automatic requirement, when the overall match is strong.

Set fit to true when the job is worth applying to and return its detailed assessment. Set fit to false only for a concrete mismatch and return one concise reason containing the decisive mismatch or mismatches.`;

/** Converts stored posting HTML to compact text before sending it to the model. */
function postingText(html: string | null): string | null {
    if (html === null) return null;
    const separatedBlocks = html.replace(
        /<br\s*\/?>|<\/(?:article|div|h[1-6]|li|p|section)>/gi,
        ' ',
    );
    return DomUtils.textContent(parseDocument(separatedBlocks)).replace(/\s+/g, ' ').trim();
}

/** Assesses one stored job with the candidate profile and current web evidence. */
export async function assessJob(
    job: Job,
    candidate: CandidateProfile,
    apiKey: string,
    fetcher: typeof fetch = fetch,
): Promise<JobAssessment> {
    if (!apiKey.trim()) throw new Error('OPENAI_API_KEY is required');

    const openai = new OpenAI({ apiKey, fetch: fetcher });
    const response = await openai.responses.parse({
        model: ASSESSMENT_MODEL,
        reasoning: { effort: 'medium' },
        instructions: ASSESSMENT_INSTRUCTIONS,
        input: JSON.stringify({
            candidate,
            job: {
                companyName: job.companyName,
                title: job.title,
                location: job.location,
                applyUrl: job.applyUrl,
                sourceUrl: job.sourceUrl,
                postedAt: job.postedAt?.toISOString() ?? null,
                displayedAge: job.displayedAge,
                salaryText: job.salaryText,
                description: postingText(job.postingHtml),
            },
        }),
        tools: [{ type: 'web_search' }],
        tool_choice: 'required',
        max_tool_calls: 3,
        max_output_tokens: 4_000,
        store: false,
        text: {
            verbosity: 'low',
            format: zodTextFormat(assessmentResponseSchema, 'job_assessment'),
        },
    });

    if (response.output_parsed === null) {
        throw new Error('OpenAI did not return a job assessment');
    }
    return response.output_parsed.assessment;
}
