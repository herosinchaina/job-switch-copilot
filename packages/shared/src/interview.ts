import { z } from 'zod'

export const ROUND_TYPES = ['tech', 'hr'] as const
export type RoundType = typeof ROUND_TYPES[number]

export const TurnFeedbackSchema = z.object({
  score: z.number().min(0).max(100),
  highlights: z.array(z.string()),
  gaps: z.array(z.string()),
  better: z.string(),
})
export type TurnFeedback = z.infer<typeof TurnFeedbackSchema>

export const InterviewStepSchema = z.object({
  feedback: TurnFeedbackSchema.nullable(),
  nextQuestion: z.string().nullable(),
})
export type InterviewStep = z.infer<typeof InterviewStepSchema>

const TurnRefSchema = z.object({ question: z.string(), why: z.string() })
export const InterviewReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  dimensions: z.array(z.object({ name: z.string(), score: z.number().min(0).max(100), comment: z.string() })),
  bestTurn: TurnRefSchema.nullable(),
  worstTurn: TurnRefSchema.nullable(),
  weaknesses: z.array(z.string()),
  nextSteps: z.array(z.string()),
})
export type InterviewReport = z.infer<typeof InterviewReportSchema>
