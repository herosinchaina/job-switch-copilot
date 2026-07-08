import { z } from 'zod'

export const KNOWLEDGE_SOURCES = ['interview', 'deepdive', 'manual'] as const
export type KnowledgeSource = typeof KNOWLEDGE_SOURCES[number]

export const KnowledgeItemInputSchema = z.object({
  question: z.string().min(1),
  answer: z.string().nullable().default(null),
  reference: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  note: z.string().nullable().default(null),
})
export type KnowledgeItemInput = z.infer<typeof KnowledgeItemInputSchema>

export const KnowledgeItemSchema = z.object({
  id: z.number(),
  question: z.string(),
  answer: z.string().nullable(),
  reference: z.string().nullable(),
  tags: z.array(z.string()),
  source: z.enum(KNOWLEDGE_SOURCES),
  sourceRef: z.string().nullable(),
  note: z.string().nullable(),
  mastery: z.number().min(0).max(5),
  reviewDue: z.string(),
  reviewInterval: z.number(),
  reviewCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>

export const REVIEW_GRADES = ['remembered', 'forgot'] as const
export type ReviewGrade = typeof REVIEW_GRADES[number]
