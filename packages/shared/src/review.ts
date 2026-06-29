import { z } from 'zod'
export const DIMENSIONS = ['layout','professionalism','star','quantification','techDepth'] as const
export type DimensionKey = typeof DIMENSIONS[number]
export const ReviewSchema = z.object({
  perspective: z.enum(['hr','interviewer']),
  overallScore: z.number().min(0).max(100),
  dimensionScores: z.array(z.object({ dimension: z.enum(DIMENSIONS), score: z.number().min(0).max(100), comment: z.string() })),
  suggestions: z.array(z.object({ location: z.string(), severity: z.enum(['high','medium','low']), issue: z.string(), suggestion: z.string() })),
})
export type Review = z.infer<typeof ReviewSchema>
