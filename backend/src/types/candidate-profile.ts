/** Candidate facts and preferences the model must use when assessing a job. */
export type CandidateProfile = {
    resumeText: string;
    graduationDate: string;
    currentWorkAuthorization: string;
    requiresFutureSponsorship: boolean;
    targetRoles: string[];
    minimumBaseSalaryUsd: number;
    preferredLocation: string;
    alternateLocations: string[];
    openToOtherLocationsForStrongMatch: boolean;
};
