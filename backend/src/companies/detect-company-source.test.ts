import { describe, expect, it } from 'vitest';
import detectCompanySource from './detect-company-source';

describe('detectCompanySource', () => {
    it('detects a Greenhouse board', () => {
        expect(detectCompanySource(
            'https://job-boards.greenhouse.io/togetherai/jobs/5211582007',
        )).toEqual({
            provider: 'greenhouse',
            externalKey: 'togetherai',
            sourceUrl: 'https://job-boards.greenhouse.io/togetherai',
        });
    });

    it('detects an Ashby board', () => {
        expect(detectCompanySource(
            'https://jobs.ashbyhq.com/meow/56e3b840-11a0-4e98-baca-44e8e26b5218',
        )).toEqual({
            provider: 'ashby',
            externalKey: 'meow',
            sourceUrl: 'https://jobs.ashbyhq.com/meow',
        });
    });

    it('does not treat a boardless Greenhouse embed URL as a company board', () => {
        expect(detectCompanySource(
            'https://boards.greenhouse.io/embed/job_app?token=123',
        )).toBeNull();
    });

    it('detects a Workday tenant and career site', () => {
        expect(detectCompanySource(
            'https://visa.wd5.myworkdayjobs.com/visa/job/Austin/Engineer_REF123',
        )).toEqual({
            provider: 'workday',
            externalKey: 'visa.wd5.myworkdayjobs.com/visa',
            sourceUrl: 'https://visa.wd5.myworkdayjobs.com/visa',
        });
    });

    it('ignores unsupported job hosts', () => {
        expect(detectCompanySource(
            'https://careers.example.com/jobs/software-engineer',
        )).toBeNull();
    });

    it.each(['en-US', 'en-GB', 'fr-CA'])('detects a Workday site after the %s locale', (locale) => {
        expect(detectCompanySource(
            `https://nvidia.wd5.myworkdayjobs.com/${locale}/NVIDIAExternalCareerSite/job/US/Engineer_JR123`,
        )).toEqual({
            provider: 'workday',
            externalKey: 'nvidia.wd5.myworkdayjobs.com/nvidiaexternalcareersite',
            sourceUrl: 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite',
        });
    });

    it('does not register a Workday locale without a site', () => {
        expect(detectCompanySource('https://nvidia.wd5.myworkdayjobs.com/en-US')).toBeNull();
    });
});
