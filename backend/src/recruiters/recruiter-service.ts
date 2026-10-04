import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { RECRUITER_INSTRUCTIONS } from '../instructions/recruiter-instructions';
import {
    recruiterScoresSchema,
    type RecruiterCandidate,
    type RecruiterSelection,
} from '../types/recruiter';

const RECRUITER_MODEL = 'gpt-6-luna';

/** Asks Luna to score every recruiter, then selects the highest total score. */
export async function selectRecruiter(
    recruiters: RecruiterCandidate[],
    apiKey: string,
    fetcher: typeof fetch = fetch,
): Promise<RecruiterSelection> {
    if (!apiKey.trim()) throw new Error('OPENAI_API_KEY is required');
    if (recruiters.length === 0) throw new Error('No recruiters to select from');

    const openai = new OpenAI({ apiKey, fetch: fetcher });
    const response = await openai.responses.parse({
        model: RECRUITER_MODEL,
        reasoning: { effort: 'medium' },
        instructions: RECRUITER_INSTRUCTIONS,
        input: JSON.stringify({ recruiters }),
        max_output_tokens: 8_000,
        store: false,
        text: {
            verbosity: 'low',
            format: zodTextFormat(recruiterScoresSchema, 'recruiter_scores'),
        },
    });

    const scores = response.output_parsed;
    if (scores === null) throw new Error('OpenAI did not return recruiter scores');

    // JSON Schema cannot enforce coverage of the input list or cross-field sums.
    const expectedEmails = new Set(recruiters.map((recruiter) => recruiter.email));
    const scoredEmails = new Set<string>();
    for (const score of scores.recruiters) {
        if (!expectedEmails.has(score.email) || scoredEmails.has(score.email)) {
            throw new Error('OpenAI returned an unknown or duplicate recruiter email');
        }
        if (score.total_score !== score.role_score + score.hiring_signal_score + score.human_signal_score) {
            throw new Error(`OpenAI returned an incorrect total score for ${score.email}`);
        }
        scoredEmails.add(score.email);
    }
    if (scoredEmails.size !== expectedEmails.size) {
        throw new Error('OpenAI did not score every recruiter');
    }

    const [first, ...remaining] = scores.recruiters;
    if (!first) throw new Error('OpenAI returned no recruiter scores');
    // On equal totals, keep the first recruiter in the returned list.
    const selected = remaining.reduce((best, score) => (
        score.total_score > best.total_score ? score : best
    ), first);
    return { ...scores, selected };
}
