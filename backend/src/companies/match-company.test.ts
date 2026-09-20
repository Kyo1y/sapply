import { describe, expect, it } from 'vitest';
import matchCompany, {
    legalNameFingerprint,
    type CompanyMatchCandidate,
    type CompanyMatchInput,
} from './match-company';

function candidate(
    id: string,
    normalizedName: string,
    options: {
        domain?: string;
        sourceKeys?: string[];
    } = {},
): CompanyMatchCandidate {
    return {
        id,
        normalizedName,
        domain: options.domain ?? null,
        sourceKeys: new Set(options.sourceKeys ?? []),
    };
}

function input(
    normalizedName: string,
    options: {
        domain?: string;
        source?: {
            provider: 'greenhouse' | 'ashby' | 'lever' | 'workday' | 'custom';
            externalKey: string;
            sourceUrl: string;
        };
    } = {},
): CompanyMatchInput {
    return {
        name: normalizedName,
        normalizedName,
        domain: options.domain ?? null,
        detectedSources: options.source ? [options.source] : [],
    };
}

describe('matchCompany', () => {
    const companies = [
        candidate('google-id', 'google', { domain: 'google.com' }),
        candidate('valon-id', 'valon tech', {
            sourceKeys: ['ashby:valon'],
        }),
        candidate('northrop-id', 'northrop grumman'),
    ];

    it('matches the same ATS source before comparing names', () => {
        expect(matchCompany(input('valon', {
            source: {
                provider: 'ashby',
                externalKey: 'valon',
                sourceUrl: 'https://jobs.ashbyhq.com/valon',
            },
        }), companies)).toEqual({
            kind: 'matched',
            companyId: 'valon-id',
            evidence: 'source',
        });
    });

    it('matches the same official domain', () => {
        expect(matchCompany(input('alphabet careers', {
            domain: 'www.google.com',
        }), companies)).toEqual({
            kind: 'matched',
            companyId: 'google-id',
            evidence: 'domain',
        });
    });

    it('matches names after removing a legal suffix', () => {
        expect(matchCompany(input('google llc'), companies)).toEqual({
            kind: 'matched',
            companyId: 'google-id',
            evidence: 'legal-name',
        });
    });

    it('uses fuzzy matching for a small spelling difference', () => {
        expect(matchCompany(input('northrop gruman'), companies)).toEqual({
            kind: 'matched',
            companyId: 'northrop-id',
            evidence: 'fuzzy-name',
        });
    });

    it('does not force an uncertain fuzzy match', () => {
        expect(matchCompany(input('unrelated company'), companies)).toEqual({
            kind: 'unmatched',
        });
    });
});

describe('legalNameFingerprint', () => {
    it('removes trailing legal suffixes and punctuation', () => {
        expect(legalNameFingerprint('google, llc')).toBe('google');
        expect(legalNameFingerprint('example company incorporated'))
            .toBe('example');
    });
});
