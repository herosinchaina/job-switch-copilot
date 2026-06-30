import { z } from 'zod'
export const DIFFICULTIES = ['easy','medium','hard'] as const
export type Difficulty = typeof DIFFICULTIES[number]
export const PROGRESS_STATUSES = ['new','learning','mastered'] as const
export type ProgressStatus = typeof PROGRESS_STATUSES[number]

export const LcProblemSchema = z.object({
  leetcodeId: z.number(),
  title: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  topic: z.string(),
  keyIdea: z.string(),
  url: z.string(),
})
export type LcProblem = z.infer<typeof LcProblemSchema>

export const GuideStepSchema = z.object({ guidance: z.string(), done: z.boolean() })
export type GuideStep = z.infer<typeof GuideStepSchema>
