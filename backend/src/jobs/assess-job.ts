import { DomUtils, parseDocument } from 'htmlparser2';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { ASSESSMENT_INSTRUCTIONS } from '../instructions/assessment-instructions';
import type { CandidateProfile } from '../types/candidate-profile';
import {
    jobAssessmentSchema,
    type JobAssessment,
} from '../types/job-assessment';
import type { Job } from '../types/job';

const ASSESSMENT_MODEL = 'gpt-6-luna';
const assessmentResponseSchema = z.strictObject({ assessment: jobAssessmentSchema });

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
