import { DomUtils, parseDocument } from 'htmlparser2';
import {
    isPotentialEarlyCareerTitle,
    isPotentialUSLocation,
    isRecentDisplayedAge,
} from '../../jobs/early-career-policy';
import type { JobCandidate } from '../../types/job-candidate';
import { httpUrl } from '../provider-fields';

export type LinkedInJobCard = {
    id: string;
    companyName: string;
    title: string;
    location: string | null;
    sourceUrl: string;
    displayedAge: string | null;
};

/** Checks one class token rather than matching substrings in HTML class strings. */
function hasClass(value: string | undefined, className: string): boolean {
    return value?.split(/\s+/).includes(className) ?? false;
}

/** Reads the public search-card fields without pretending its date is an exact timestamp. */
export function parseLinkedInJobCards(html: string): LinkedInJobCard[] {
    const document = parseDocument(html);
    const cards = DomUtils.findAll(
        (element) => element.attribs['data-entity-urn']?.startsWith('urn:li:jobPosting:') === true,
        document,
    );
    return cards.map((card) => {
        const id = card.attribs['data-entity-urn'].split(':').at(-1);
        const child = (className: string) => DomUtils.findOne(
            (element) => hasClass(element.attribs.class, className), card,
        );
        const title = DomUtils.getText(child('base-search-card__title') ?? []).trim();
        const companyName = DomUtils.getText(child('base-search-card__subtitle') ?? []).trim();
        const location = DomUtils.getText(child('job-search-card__location') ?? []).trim();
        const link = child('base-card__full-link')?.attribs.href;
        const displayedAge = DomUtils.getText(DomUtils.findOne(
            (element) => element.name === 'time', card,
        ) ?? []).trim();
        if (!id || !/^\d+$/.test(id) || !title || !companyName) {
            throw new Error('LinkedIn search card is missing its job ID, title, or company');
        }
        const sourceUrl = new URL(httpUrl(link, 'LinkedIn job link'));
        sourceUrl.search = '';
        sourceUrl.hash = '';
        return {
            id,
            title,
            companyName,
            location: location || null,
            sourceUrl: sourceUrl.toString(),
            displayedAge: displayedAge || null,
        };
    });
}

/** Fetches one page of public LinkedIn guest search results; the caller chooses pages. */
export async function searchLinkedInJobCards(
    keywords: string,
    geoId: string,
    start = 0,
    fetcher: typeof fetch = fetch,
): Promise<LinkedInJobCard[]> {
    const url = new URL('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search');
    url.searchParams.set('keywords', keywords);
    url.searchParams.set('geoId', geoId);
    url.searchParams.set('f_TPR', 'r432000');
    url.searchParams.set('sortBy', 'DD');
    url.searchParams.set('start', String(start));
    const response = await fetcher(url.toString(), { headers: { accept: 'text/html' } });
    if (!response.ok) throw new Error(`LinkedIn search returned HTTP ${response.status}`);
    return parseLinkedInJobCards(await response.text());
}

/** Fetches one guest detail page and attaches its description to a search card. */
export async function getLinkedInJobCandidate(
    card: LinkedInJobCard,
    fetcher: typeof fetch = fetch,
): Promise<JobCandidate> {
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${card.id}`;
    const response = await fetcher(url, { headers: { accept: 'text/html' } });
    if (!response.ok) throw new Error(`LinkedIn detail returned HTTP ${response.status}`);
    const document = parseDocument(await response.text());
    const description = DomUtils.findOne(
        (element) => hasClass(element.attribs.class, 'show-more-less-html__markup'),
        document,
    );
    if (!description) throw new Error(`LinkedIn job ${card.id} has no guest description`);
    return {
        provider: 'linkedin',
        externalId: card.id,
        companyName: card.companyName,
        title: card.title,
        location: card.location,
        sourceUrl: card.sourceUrl,
        applyUrl: card.sourceUrl,
        descriptionHtml: DomUtils.getInnerHTML(description),
        salaryText: null,
        postingTime: { kind: 'recent-window', hours: 120, displayedAge: card.displayedAge },
    };
}

/** Pre-filters one search page, then loads full details for the surviving cards. */
export async function searchLinkedInJobCandidates(
    keywords: string,
    geoId: string,
    start = 0,
    fetcher: typeof fetch = fetch,
): Promise<JobCandidate[]> {
    const cards = await searchLinkedInJobCards(keywords, geoId, start, fetcher);
    const candidates: JobCandidate[] = [];
    for (const card of cards.filter((card) =>
        isPotentialEarlyCareerTitle(card.title) &&
        isPotentialUSLocation(card.location) &&
        isRecentDisplayedAge(card.displayedAge)
    )) {
        candidates.push(await getLinkedInJobCandidate(card, fetcher));
    }
    return candidates;
}
