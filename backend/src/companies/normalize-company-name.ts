/** Produces the consistent company name used for exact matching. */
export default function normalizeCompanyName(name: string): string {
    return name
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('en-US');
}
