/** A posting fetched from a provider, before filtering or saving it. */
export type JobCandidate = {
    provider: 'greenhouse' | 'lever' | 'ashby' | 'linkedin' | 'applyguy';
    externalId: string;
    companyName: string;
    title: string;
    location: string | null;
    sourceUrl: string;
    applyUrl: string;
    descriptionHtml: string | null;
    salaryText: string | null;
    postingTime:
        | { kind: 'timestamp'; at: Date }
        | { kind: 'recent-window'; hours: number; displayedAge: string | null }
        | { kind: 'calendar-date'; date: string };
};
