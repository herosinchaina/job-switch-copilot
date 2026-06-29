import { z } from 'zod'
export const JobDescriptionSchema = z.object({
  role: z.string(),
  company: z.string(),
  keywords: z.array(z.string()),
  responsibilities: z.array(z.string()),
  requirements: z.object({ must: z.array(z.string()), nice: z.array(z.string()) }),
})
export type JobDescription = z.infer<typeof JobDescriptionSchema>

export const GapAnalysisSchema = z.object({
  matchScore: z.number().min(0).max(100),
  missingKeywords: z.array(z.string()),
  weakRequirements: z.array(z.string()),
  coveredHighlights: z.array(z.string()),
})
export type GapAnalysis = z.infer<typeof GapAnalysisSchema>
