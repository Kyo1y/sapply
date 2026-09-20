import type { DetectedCompanySource } from '../types/company';

export type CompanyMatchInput = {
    name: string;
    normalizedName: string;
    domain: string | null;
    detectedSources: DetectedCompanySource[];
};

export type CompanyMatchCandidate = {
    id: string;
    normalizedName: string;
    domain: string | null;
    sourceKeys: Set<string>;
};

export type CompanyMatch =
    | {
        kind: 'matched';
        companyId: string;
        evidence: 'source' | 'domain' | 'name' | 'legal-name' | 'fuzzy-name';
      }
    | { kind: 'unmatched' };

const LEGAL_SUFFIXES = new Set([
    'co',
    'company',
    'corp',
    'corporation',
    'inc',
    'incorporated',
    'ltd',
    'limited',
    'llc',
    'plc',
]);

const MIN_FUZZY_SCORE = 0.88;
const MIN_FUZZY_LEAD = 0.08;

function sourceKey(source: DetectedCompanySource): string {
    return `${source.provider}:${source.externalKey}`;
}

function normalizedDomain(domain: string): string {
    return domain.trim().toLocaleLowerCase('en-US').replace(/^www\./, '');
}

export function legalNameFingerprint(normalizedName: string): string {
    const words = normalizedName
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0);

    while (words.length > 1 && LEGAL_SUFFIXES.has(words.at(-1) ?? '')) {
        words.pop();
    }

    return words.join(' ');
}

function editDistance(left: string, right: string): number {
    if (left.length === 0) {
        return right.length;
    }

    if (right.length === 0) {
        return left.length;
    }

    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        const current = [leftIndex];

        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
            const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1]
                ? 0
                : 1;

            current[rightIndex] = Math.min(
                current[rightIndex - 1] + 1,
                previous[rightIndex] + 1,
                previous[rightIndex - 1] + substitutionCost,
            );
        }

        previous = current;
    }

    return previous[right.length];
}

export function nameSimilarity(left: string, right: string): number {
    const longestLength = Math.max(left.length, right.length);

    if (longestLength === 0) {
        return 1;
    }

    return 1 - editDistance(left, right) / longestLength;
}

function oneCandidate(
    candidates: CompanyMatchCandidate[],
): CompanyMatchCandidate | null {
    return candidates.length === 1 ? candidates[0] : null;
}

export default function matchCompany(
    input: CompanyMatchInput,
    candidates: CompanyMatchCandidate[],
): CompanyMatch {
    const inputSourceKeys = new Set(input.detectedSources.map(sourceKey));
    const sourceMatch = oneCandidate(candidates.filter((candidate) =>
        Array.from(inputSourceKeys).some((key) => candidate.sourceKeys.has(key)),
    ));

    if (sourceMatch) {
        return {
            kind: 'matched',
            companyId: sourceMatch.id,
            evidence: 'source',
        };
    }

    if (input.domain) {
        const inputDomain = normalizedDomain(input.domain);
        const domainMatch = oneCandidate(candidates.filter((candidate) =>
            candidate.domain !== null &&
            normalizedDomain(candidate.domain) === inputDomain,
        ));

        if (domainMatch) {
            return {
                kind: 'matched',
                companyId: domainMatch.id,
                evidence: 'domain',
            };
        }
    }

    const nameMatch = oneCandidate(candidates.filter((candidate) =>
        candidate.normalizedName === input.normalizedName,
    ));

    if (nameMatch) {
        return {
            kind: 'matched',
            companyId: nameMatch.id,
            evidence: 'name',
        };
    }

    const inputFingerprint = legalNameFingerprint(input.normalizedName);
    const legalNameMatch = oneCandidate(candidates.filter((candidate) =>
        legalNameFingerprint(candidate.normalizedName) === inputFingerprint,
    ));

    if (legalNameMatch) {
        return {
            kind: 'matched',
            companyId: legalNameMatch.id,
            evidence: 'legal-name',
        };
    }

    const fuzzyMatches = candidates
        .map((candidate) => ({
            candidate,
            score: nameSimilarity(
                inputFingerprint,
                legalNameFingerprint(candidate.normalizedName),
            ),
        }))
        .sort((left, right) => right.score - left.score);

    const best = fuzzyMatches[0];
    const secondBest = fuzzyMatches[1];

    if (
        best &&
        best.score >= MIN_FUZZY_SCORE &&
        (!secondBest || best.score - secondBest.score >= MIN_FUZZY_LEAD)
    ) {
        return {
            kind: 'matched',
            companyId: best.candidate.id,
            evidence: 'fuzzy-name',
        };
    }

    return { kind: 'unmatched' };
}
