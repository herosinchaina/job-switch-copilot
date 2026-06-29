import { z } from 'zod'
export const StructuredResumeSchema = z.object({
  basics: z.object({ name:z.string(), title:z.string(), contact:z.string(), summary:z.string() }),
  education: z.array(z.object({ school:z.string(), degree:z.string(), major:z.string(), period:z.string(), highlights:z.array(z.string()) })),
  work: z.array(z.object({ company:z.string(), role:z.string(), period:z.string(), bullets:z.array(z.string()) })),
  projects: z.array(z.object({ name:z.string(), role:z.string(), period:z.string(), stack:z.array(z.string()), bullets:z.array(z.string()), metrics:z.array(z.string()) })),
  skills: z.array(z.object({ category:z.string(), items:z.array(z.string()) })),
  awards: z.array(z.object({ name:z.string(), date:z.string(), desc:z.string() })),
})
export type StructuredResume = z.infer<typeof StructuredResumeSchema>
