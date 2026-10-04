import type { RecruiterSearchContext } from '../types/recruiter';

/** Builds Autumn's search instructions from the job context. */
export function buildAutumnRecruiterInstructions(
    context: RecruiterSearchContext,
    recruiterLimit: number,
) {
    const location = context.jobLocation ?? 'not specified';
    return {
        brief: [
            `Find up to ${recruiterLimit} current employees at ${JSON.stringify(context.companyName)}`,
            `who are relevant to recruiting for ${JSON.stringify(context.jobTitle)} in ${JSON.stringify(location)}.`,
            `The job posting is ${context.jobUrl}.`,
            'Prioritize technical recruiters, early-career or university recruiters, talent acquisition partners,',
            'recruiting managers, and recruiters responsible for the role\'s function, level, or geography.',
            'Exclude former employees, external recruiting agencies, and anyone without a work email address.',
            'Return only name, title, work email, and LinkedIn profile URL.',
        ].join(' '),
        rules: {
            current_employee: `The person currently works at ${context.companyName}.`,
            relevant_recruiter: `The person is relevant to recruiting for ${context.jobTitle}.`,
            contactable: 'The person has a work email address.',
        },
        assumptions: [
            'Prefer recruiters tied to the role function, early-career hiring, and the job geography.',
        ],
    };
}
