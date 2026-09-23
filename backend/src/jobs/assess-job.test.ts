import { describe, expect, it, vi } from 'vitest';
import type { CandidateProfile } from '../types/candidate-profile';
import { jobAssessmentSchema } from '../types/job-assessment';
import type { Job } from '../types/job';
import { assessJob } from './assess-job';

const job: Job = {
    id: 'job-1',
    companyId: null,
    companySourceId: null,
    provider: 'greenhouse',
    externalId: '123',
    companyName: 'Example',
    sourceUrl: 'https://example.com/jobs/123',
    applyUrl: 'https://example.com/jobs/123/apply',
    title: 'Software Engineer I',
    location: 'New York, NY',
    postedAt: new Date('2026-09-21T12:00:00Z'),
    displayedAge: null,
    salaryText: '$120,000-$140,000',
    status: 'assessing',
    createdAt: new Date('2026-09-22T12:00:00Z'),
    updatedAt: new Date('2026-09-22T12:00:00Z'),
    lastError: null,
    postingHtml: '<div><p>Build reliable software.</p><p>New graduates welcome.</p></div>',
    assessmentReason: null,
    assessmentDetails: null,
};

const candidate: CandidateProfile = {
    resumeText: 'Computer science student with software engineering experience.',
    graduationDate: 'June 2027',
    currentWorkAuthorization: 'F-1 OPT after graduation',
    requiresFutureSponsorship: true,
    targetRoles: ['early-career software engineering'],
    minimumBaseSalaryUsd: 100_000,
    preferredLocation: 'New York City',
    alternateLocations: ['Boston'],
    openToOtherLocationsForStrongMatch: true,
};

function responseWithAssessment(assessment: unknown): Response {
    return new Response(JSON.stringify({
        output: [{
            type: 'message',
            content: [{
                type: 'output_text',
                text: JSON.stringify({ assessment }),
            }],
        }],
    }), { headers: { 'content-type': 'application/json' } });
}

describe('job assessment', () => {
    it('models accepted and rejected results without contradictory reasons', () => {
        const accepted = {
            fit: true,
            matchStrength: 'strong',
            roleMatch: 'strong',
            experienceFit: 'qualified',
            graduationEligibility: 'eligible',
            workAuthorization: 'compatible',
            locationFit: 'preferred',
            compensation: 'above_floor',
            matchedSkills: ['TypeScript', 'APIs'],
            missingRequirements: [],
        };
        expect(jobAssessmentSchema.parse(accepted)).toEqual({
            fit: true,
            matchStrength: 'strong',
            roleMatch: 'strong',
            experienceFit: 'qualified',
            graduationEligibility: 'eligible',
            workAuthorization: 'compatible',
            locationFit: 'preferred',
            compensation: 'above_floor',
            matchedSkills: ['TypeScript', 'APIs'],
            missingRequirements: [],
        });
        expect(jobAssessmentSchema.parse({ fit: false, reason: 'Requires US citizenship.' }))
            .toEqual({ fit: false, reason: 'Requires US citizenship.' });
        expect(() => jobAssessmentSchema.parse({ ...accepted, reason: 'Wrong location' }))
            .toThrow();
        expect(() => jobAssessmentSchema.parse({ fit: false, reason: null }))
            .toThrow();
    });

    it('uses Luna, requires web search, and sends compact job and candidate data', async () => {
        const fetcher = vi.fn(async () => responseWithAssessment({
            fit: false,
            reason: 'The posting explicitly requires permanent US work authorization.',
        })) as unknown as typeof fetch;

        const assessment = await assessJob(job, candidate, 'test-key', fetcher);

        expect(assessment).toEqual({
            fit: false,
            reason: 'The posting explicitly requires permanent US work authorization.',
        });
        expect(fetcher).toHaveBeenCalledOnce();
        const requestBody: unknown = JSON.parse(String(vi.mocked(fetcher).mock.calls[0][1]?.body));
        expect(requestBody).toMatchObject({
            model: 'gpt-6-luna',
            reasoning: { effort: 'medium' },
            tools: [{ type: 'web_search' }],
            tool_choice: 'required',
            store: false,
        });
        expect(JSON.stringify(requestBody)).toContain('Build reliable software. New graduates welcome.');
        expect(JSON.stringify(requestBody)).toContain(candidate.resumeText);
    });
});
