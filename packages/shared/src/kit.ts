import { z } from 'zod'
export const InterviewKitSchema = z.object({
  selfIntro: z.object({ short: z.string(), standard: z.string() }),
  projectPitches: z.array(z.object({
    projectName: z.string(),
    situation: z.string(),
    task: z.string(),
    action: z.string(),
    result: z.string(),
  })),
})
export type InterviewKit = z.infer<typeof InterviewKitSchema>
