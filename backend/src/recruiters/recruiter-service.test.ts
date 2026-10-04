import { describe, expect, it, vi } from 'vitest';
import {
    recruiterScoreSchema,
    type RecruiterCandidate,
    type RecruiterScore,
} from '../types/recruiter';
import { selectRecruiter } from './recruiter-service';

const recruiters: RecruiterCandidate[] = [
    {
        name: 'Ava',
        title: 'University Recruiter',
        email: 'ava@example.com',
        linkedinUrl: 'https://www.linkedin.com/in/ava',
    },
    {
        name: 'Sam',
        title: 'Technical Recruiter',
        email: 'sam@example.com',
        linkedinUrl: null,
    },
];

const avaScore: RecruiterScore = {
    email: 'ava@example.com',
    role_score: 70,
    hiring_signal_score: 10,
    human_signal_score: 5,
    total_score: 85,
    explanation: 'University recruiting is the strongest role match.',
    sources: ['https://example.com/ava'],
};

const samScore: RecruiterScore = {
    email: 'sam@example.com',
    role_score: 35,
    hiring_signal_score: 15,
    human_signal_score: 15,
    total_score: 65,
    explanation: 'Technical recruiter with relevant hiring posts and distinctive wording.',
    sources: ['https://example.com/sam'],
};

function scoresResponse(scores: unknown[]): Response {
    return new Response(JSON.stringify({
        output: [{
            type: 'message',
            content: [{
                type: 'output_text',
                text: JSON.stringify({ recruiters: scores }),
            }],
        }],
    }), { headers: { 'content-type': 'application/json' } });
}

describe('recruiter service', () => {
    it('requests every score field and selects the highest total while preserving all rows', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => scoresResponse([samScore, avaScore]));

        const selection = await selectRecruiter(recruiters, 'test-key', fetcher);

        expect(selection).toEqual({ recruiters: [samScore, avaScore], selected: avaScore });
        expect(fetcher).toHaveBeenCalledOnce();
        const requestBody: unknown = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
        expect(requestBody).toMatchObject({
            model: 'gpt-6-luna',
            instructions: expect.stringContaining('Evaluate every supplied recruiter'),
            input: JSON.stringify({ recruiters }),
            store: false,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'recruiter_scores',
                    strict: true,
                    schema: {
                        required: ['recruiters'],
                        additionalProperties: false,
                        properties: {
                            recruiters: {
                                type: 'array',
                                items: {
                                    required: [
                                        'email', 'role_score', 'hiring_signal_score',
                                        'human_signal_score', 'total_score', 'explanation', 'sources',
                                    ],
                                    additionalProperties: false,
                                    properties: {
                                        hiring_signal_score: { type: 'integer', minimum: 0, maximum: 15 },
                                        human_signal_score: { type: 'integer', minimum: 0, maximum: 15 },
                                        total_score: { type: 'integer', minimum: 0, maximum: 100 },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        expect(requestBody).toMatchObject({
            instructions: expect.stringContaining('role_score + hiring_signal_score + human_signal_score'),
        });
        expect(requestBody).toMatchObject({
            instructions: expect.not.stringContaining('Do not assume an unrelated university recruiter'),
        });
    });

    it('enforces score ranges and literal role scores', () => {
        expect(recruiterScoreSchema.safeParse({ ...avaScore, role_score: 50 }).success).toBe(false);
        expect(recruiterScoreSchema.safeParse({ ...avaScore, human_signal_score: 16 }).success).toBe(false);
        expect(recruiterScoreSchema.safeParse({ ...avaScore, hiring_signal_score: 1.5 }).success).toBe(false);
        expect(recruiterScoreSchema.safeParse({ ...avaScore, total_score: 101 }).success).toBe(false);
    });

    it('keeps the first returned recruiter when total scores are tied', async () => {
        const tiedAva = { ...avaScore, hiring_signal_score: 0, human_signal_score: 0, total_score: 70 };
        const tiedSam = { ...samScore, role_score: 70, hiring_signal_score: 0, human_signal_score: 0, total_score: 70 };
        const fetcher = vi.fn<typeof fetch>(async () => scoresResponse([tiedSam, tiedAva]));
        const selection = await selectRecruiter(recruiters, 'test-key', fetcher);
        expect(selection.selected.email).toBe('sam@example.com');
    });

    it('rejects an empty recruiter list without calling OpenAI', async () => {
        const fetcher = vi.fn<typeof fetch>();
        await expect(selectRecruiter([], 'test-key', fetcher)).rejects.toThrow('No recruiters to select from');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('rejects a missing API key without calling OpenAI', async () => {
        const fetcher = vi.fn<typeof fetch>();
        await expect(selectRecruiter(recruiters, ' ', fetcher)).rejects.toThrow('OPENAI_API_KEY is required');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('rejects unknown recruiter emails', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => scoresResponse([
            { ...avaScore, email: 'invented@example.com' }, samScore,
        ]));
        await expect(selectRecruiter(recruiters, 'test-key', fetcher))
            .rejects.toThrow('OpenAI returned an unknown or duplicate recruiter email');
    });

    it('rejects duplicate recruiter emails', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => scoresResponse([avaScore, avaScore]));
        await expect(selectRecruiter(recruiters, 'test-key', fetcher))
            .rejects.toThrow('OpenAI returned an unknown or duplicate recruiter email');
    });

    it('rejects missing recruiter scores', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => scoresResponse([avaScore]));
        await expect(selectRecruiter(recruiters, 'test-key', fetcher))
            .rejects.toThrow('OpenAI did not score every recruiter');
    });

    it('rejects totals that do not equal the component scores', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => scoresResponse([
            { ...avaScore, total_score: 99 }, samScore,
        ]));
        await expect(selectRecruiter(recruiters, 'test-key', fetcher))
            .rejects.toThrow('OpenAI returned an incorrect total score for ava@example.com');
    });

    it('rejects a response without structured scores', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
            output: [],
        }), { headers: { 'content-type': 'application/json' } }));
        await expect(selectRecruiter(recruiters, 'test-key', fetcher))
            .rejects.toThrow('OpenAI did not return recruiter scores');
    });
});
