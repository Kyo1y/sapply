import { describe, expect, it, vi } from 'vitest';
import { OUTREACH_INSTRUCTIONS } from '../instructions/outreach-instructions';
import {
    outreachDraftSchema,
    type OutreachContext,
    type OutreachDraft,
} from '../types/outreach';
import { draftOutreach } from './outreach-service';

const context: OutreachContext = {
    recruiter: {
        name: 'Ava',
        title: 'University Recruiter',
        email: 'ava@example.com',
        linkedinUrl: 'https://www.linkedin.com/in/ava',
        role_score: 70,
        hiring_signal_score: 10,
        human_signal_score: 5,
        total_score: 85,
        explanation: 'Handles early-career engineering hiring.',
        sources: ['https://example.com/ava'],
    },
    job: {
        companyName: 'Example',
        title: 'Software Engineer, New Grad',
        location: 'New York, NY',
        sourceUrl: 'https://example.com/jobs/123',
        applyUrl: 'https://example.com/jobs/123/apply',
        postingHtml: '<p>Build reliable integrations. New graduates welcome.</p>',
    },
    candidate: {
        resumeText: 'Kairat studies CS and Math and built API integrations and Baton.',
        graduationDate: 'June 2027',
        currentWorkAuthorization: 'F-1 OPT after graduation',
        requiresFutureSponsorship: true,
        targetRoles: ['early-career software engineering'],
        minimumBaseSalaryUsd: 100_000,
        preferredLocation: 'New York City',
        alternateLocations: ['Boston'],
        openToOtherLocationsForStrongMatch: true,
    },
};

const hookedDraft: OutreachDraft = {
    subject: 'Fewer clicks, better integrations',
    draftEmail: 'Hi Ava,\n\nYour team\'s work on repetitive workflows caught my attention.\n\nBest,\nKairat Sadyrbekov',
    reason: 'The company describes repetitive workflows at [its product page](https://example.com/product). This connects to the supplied automation experience.',
    sources: ['https://example.com/product'],
};

/** Wraps a model result in a Responses payload so tests exercise the real SDK parser. */
function draftResponse(draft: unknown): Response {
    return new Response(JSON.stringify({
        output: [{
            type: 'message',
            content: [{ type: 'output_text', text: JSON.stringify(draft) }],
        }],
    }), { headers: { 'content-type': 'application/json' } });
}

describe('outreach service', () => {
    it('sends recruiter evidence, job, and candidate facts and requests research plus strict output', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => draftResponse(hookedDraft));

        const result = await draftOutreach(context, 'test-key', fetcher);

        expect(result).toEqual(hookedDraft);
        expect(fetcher).toHaveBeenCalledOnce();
        const requestBody: unknown = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
        expect(requestBody).toMatchObject({
            model: 'gpt-6-luna',
            reasoning: { effort: 'medium' },
            instructions: OUTREACH_INSTRUCTIONS,
            input: JSON.stringify({
                recruiter: context.recruiter,
                candidate: context.candidate,
                job: {
                    companyName: context.job.companyName,
                    title: context.job.title,
                    location: context.job.location,
                    sourceUrl: context.job.sourceUrl,
                    applyUrl: context.job.applyUrl,
                    descriptionHtml: context.job.postingHtml,
                },
            }),
            tools: [{ type: 'web_search' }],
            tool_choice: 'required',
            max_tool_calls: 8,
            store: false,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'outreach_draft',
                    strict: true,
                    schema: {
                        required: ['subject', 'draftEmail', 'reason', 'sources'],
                        additionalProperties: false,
                    },
                },
            },
        });
        expect(requestBody).not.toHaveProperty('temperature');
    });

    it('returns a classic draft and research limitations without requiring a hook or sources', async () => {
        const classicDraft: OutreachDraft = {
            subject: 'Software Engineer, New Grad at Example',
            draftEmail: 'Hi Ava,\n\nI am reaching out because you handle university recruiting at Example.',
            reason: 'No supported hook was found. The supplied sources were inaccessible, so the draft uses the job and candidate context.',
            sources: [],
        };
        const fetcher = vi.fn<typeof fetch>(async () => draftResponse(classicDraft));

        await expect(draftOutreach(context, 'test-key', fetcher)).resolves.toEqual(classicDraft);
    });

    it('rejects a missing API key without making a request', async () => {
        const fetcher = vi.fn<typeof fetch>();

        await expect(draftOutreach(context, ' ', fetcher)).rejects.toThrow('OPENAI_API_KEY is required');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('rejects a refusal or response without a structured draft', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
            output: [{
                type: 'message',
                content: [{ type: 'refusal', refusal: 'Unable to draft.' }],
            }],
        }), { headers: { 'content-type': 'application/json' } }));

        await expect(draftOutreach(context, 'test-key', fetcher))
            .rejects.toThrow('OpenAI did not return an outreach draft');
    });

    it('rejects malformed model output through the SDK schema parser', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => draftResponse({
            ...hookedDraft, sources: 'https://example.com/product',
        }));

        await expect(draftOutreach(context, 'test-key', fetcher)).rejects.toThrow();
        expect(outreachDraftSchema.safeParse({ ...hookedDraft, subject: '' }).success).toBe(false);
        expect(outreachDraftSchema.safeParse({ ...hookedDraft, reason: '' }).success).toBe(false);
        expect(outreachDraftSchema.safeParse({ ...hookedDraft, extra: true }).success).toBe(false);
    });

    it('includes the approved hook decisions, attention goal, and factual guardrails in the prompt', () => {
        expect(OUTREACH_INSTRUCTIONS).toContain('maximize the chance that the recruiter notices the email');
        expect(OUTREACH_INSTRUCTIONS).toContain('Straightforward outreach is a successful outcome');
        expect(OUTREACH_INSTRUCTIONS).toContain('Reject a forced analogy');
        expect(OUTREACH_INSTRUCTIONS).toContain('Do not reuse their facts or phrasing');
        expect(OUTREACH_INSTRUCTIONS).toContain('Do not claim that an application has been submitted');
        expect(OUTREACH_INSTRUCTIONS).toContain('[linkedin.com/in/kyoly](https://www.linkedin.com/in/kyoly)');
    });
});
