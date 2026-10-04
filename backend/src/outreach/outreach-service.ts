import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { OUTREACH_INSTRUCTIONS } from '../instructions/outreach-instructions';
import {
    outreachDraftSchema,
    type OutreachContext,
    type OutreachDraft,
} from '../types/outreach';

const OUTREACH_MODEL = 'gpt-6-luna';

/** Researches a hook or uses classic outreach, returning a draft email. */
export async function draftOutreach(
    context: OutreachContext,
    apiKey: string,
    fetcher: typeof fetch = fetch,
): Promise<OutreachDraft> {
    if (!apiKey.trim()) throw new Error('OPENAI_API_KEY is required');

    const openai = new OpenAI({ apiKey, fetch: fetcher });
    const { job } = context;
    const response = await openai.responses.parse({
        model: OUTREACH_MODEL,
        reasoning: { effort: 'medium' },
        instructions: OUTREACH_INSTRUCTIONS,
        input: JSON.stringify({
            recruiter: context.recruiter,
            candidate: context.candidate,
            job: {
                companyName: job.companyName,
                title: job.title,
                location: job.location,
                sourceUrl: job.sourceUrl,
                applyUrl: job.applyUrl,
                descriptionHtml: job.postingHtml,
            },
        }),
        tools: [{ type: 'web_search' }],
        tool_choice: 'required',
        max_tool_calls: 8,
        max_output_tokens: 8_000,
        store: false,
        text: {
            verbosity: 'low',
            format: zodTextFormat(outreachDraftSchema, 'outreach_draft'),
        },
    });

    if (response.output_parsed === null) {
        throw new Error('OpenAI did not return an outreach draft');
    }
    return response.output_parsed;
}
