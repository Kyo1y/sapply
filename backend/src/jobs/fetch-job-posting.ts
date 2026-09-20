/** Downloads the HTML from a job's application URL. */
export default async function fetchJob(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error("Could not fetch job description");
    }
    const jobHtml = await res.text();
    return jobHtml;
}
