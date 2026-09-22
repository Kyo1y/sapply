const SENIOR_TITLE = /\b(?:senior|sr\.?|staff|principal|lead|manager|director|head|architect|vice president|vp)\b/i;
const HIGHER_LEVEL_TITLE = /\b(?:engineer|developer)\s+(?:ii|iii|iv|v|[2-9])\b|\blevel\s+(?:ii|iii|iv|v|[2-9])\b/i;
const TECHNICAL_ROLE_TITLE = /\b(?:software\s+(?:engineer|developer)|(?:front[ -]?end|back[ -]?end|full[ -]?stack|web|mobile|ios|android|machine learning|ml|ai|data|site reliability|devops|platform|infrastructure|cloud|security|systems|product)\s+(?:engineer|developer)|sre|qa\s+(?:engineer|analyst)|quality assurance\s+(?:engineer|analyst)|test automation\s+engineer|developer)\b/i;
const EXPLICIT_NON_US_LOCATION = /(?:^|[\s,·–-])(?:canada|united kingdom|uk|england|scotland|wales|northern ireland|india|germany|france|ireland|australia|netherlands|singapore|china|japan|poland|spain|brazil|mexico|sweden|switzerland|israel|united arab emirates|uae|pakistan|south korea|italy|portugal|belgium|denmark|norway|finland|new zealand|emea|apac)(?:\s*\(remote\))?\s*$/i;

/** Keeps technical, non-senior titles for full-posting inspection. */
export function isPotentialEarlyCareerTitle(title: string): boolean {
    return TECHNICAL_ROLE_TITLE.test(title) &&
        !SENIOR_TITLE.test(title) &&
        !HIGHER_LEVEL_TITLE.test(title);
}

/** Rejects displayed ages clearly outside LinkedIn's five-day search window. */
export function isRecentDisplayedAge(displayedAge: string | null): boolean {
    if (displayedAge === null) return true;
    const match = displayedAge.toLowerCase().match(/(\d+|a|an)\s+(minute|hour|day|week|month|year)s?\b/);
    if (!match) return true;
    const amount = match[1] === 'a' || match[1] === 'an' ? 1 : Number(match[1]);
    switch (match[2]) {
        case 'minute': return true;
        case 'hour': return amount <= 120;
        case 'day': return amount <= 5;
        default: return false;
    }
}

/** Keeps US, remote, and uncertain locations; rejects explicit non-US labels. */
export function isPotentialUSLocation(location: string | null): boolean {
    return location === null || !EXPLICIT_NON_US_LOCATION.test(location.trim());
}
