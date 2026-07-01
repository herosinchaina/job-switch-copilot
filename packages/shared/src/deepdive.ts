import { z } from 'zod'
const d10 = z.number().min(0).max(10)
export const DeepdiveFeedbackSchema = z.object({
  scores: z.object({
    techDepth: d10, implementationClarity: d10, architectureAwareness: d10,
    metricsAwareness: d10, expression: d10,
  }),
  total: z.number().min(0).max(50),
  strengths: z.array(z.string()),
  vague: z.array(z.string()),
  missingDetails: z.array(z.string()),
  followUps: z.array(z.string()),
  betterAnswer: z.string(),
})
export type DeepdiveFeedback = z.infer<typeof DeepdiveFeedbackSchema>

export const DeepdiveStepSchema = z.object({
  feedback: DeepdiveFeedbackSchema.nullable(),
  nextQuestion: z.string().nullable(),
})
export type DeepdiveStep = z.infer<typeof DeepdiveStepSchema>

export const ProjectMapSchema = z.object({
  projectName: z.string(), background: z.string(), businessGoal: z.string(),
  techApproach: z.string(), personalContribution: z.string(),
  coreChallenges: z.array(z.string()), alternatives: z.array(z.string()),
  evaluation: z.string(), risks: z.array(z.string()), optimizations: z.array(z.string()),
  hotQuestions: z.array(z.string()), blindSpots: z.array(z.string()),
})
export type ProjectMap = z.infer<typeof ProjectMapSchema>
