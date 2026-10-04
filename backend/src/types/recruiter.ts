/** A contactable recruiter returned by Autumn for one job. */
export type RecruiterCandidate = {
    name: string;
    title: string;
    email: string;
    linkedinUrl: string | null;
};

/** The job facts Autumn uses to find relevant recruiters. */
export type RecruiterSearchContext = {
    jobId: string;
    companyName: string;
    jobTitle: string;
    jobLocation: string | null;
    jobUrl: string;
};
