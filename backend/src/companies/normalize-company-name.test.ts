import { describe, expect, it } from 'vitest';
import normalizeCompanyName from './normalize-company-name';

describe('normalizeCompanyName', () => {
    it('normalizes case, surrounding whitespace, and repeated spaces', () => {
        expect(normalizeCompanyName('  Northrop   Grumman '))
            .toBe('northrop grumman');
    });

    it('does not remove words or punctuation that could distinguish companies', () => {
        expect(normalizeCompanyName('Study.com')).toBe('study.com');
        expect(normalizeCompanyName('Google LLC')).toBe('google llc');
    });
});
