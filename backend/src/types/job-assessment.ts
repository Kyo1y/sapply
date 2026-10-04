import { z } from 'zod';

const fitJobAssessmentSchema = z.strictObject({
    fit: z.literal(true),
    matchStrength: z.enum(['strong', 'moderate', 'weak']),
    roleMatch: z.enum(['strong', 'moderate', 'weak']),
    experienceFit: z.enum(['qualified', 'stretch']),
    graduationEligibility: z.enum(['eligible', 'unknown']),
    workAuthorization: z.enum(['compatible', 'unknown']),
    locationFit: z.enum(['preferred', 'acceptable', 'weak']),
    compensation: z.enum(['above_floor', 'below_floor', 'unknown']),
    matchedSkills: z.array(z.string()),
    missingRequirements: z.array(z.string()),
});

/** The exact structured result returned by the assessment model. */
export const jobAssessmentSchema = z.discriminatedUnion('fit', [
    fitJobAssessmentSchema,
    z.strictObject({
        fit: z.literal(false),
        reason: z.string().min(1),
    }),
]);

export type JobAssessment = z.infer<typeof jobAssessmentSchema>;
export type FitJobAssessment = z.infer<typeof fitJobAssessmentSchema>;
export type FitJobAssessmentDetails = Omit<FitJobAssessment, 'fit'>;
