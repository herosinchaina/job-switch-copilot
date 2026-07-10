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
  conqueredAt: z.string().nullable(),
})
export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>

export const REVIEW_GRADES = ['remembered', 'forgot'] as const
export type ReviewGrade = typeof REVIEW_GRADES[number]

// ── 错题本(模块六) ──────────────────────────────────────────
export const CONQUER_THRESHOLD = 60

// AI 原始输出:只打分+点评,不自称通过与否
export const AttemptGradeRawSchema = z.object({
  score: z.number().min(0).max(100),
  comment: z.string(),
  gaps: z.array(z.string()).default([]),
})
export type AttemptGradeRaw = z.infer<typeof AttemptGradeRawSchema>

export const KnowledgeAttemptFeedbackSchema = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(['pass', 'fail']),
  comment: z.string(),
  gaps: z.array(z.string()).default([]),
})
export type KnowledgeAttemptFeedback = z.infer<typeof KnowledgeAttemptFeedbackSchema>

export const KnowledgeAttemptSchema = z.object({
  id: z.number(),
  itemId: z.number(),
  answer: z.string(),
  score: z.number(),
  feedback: KnowledgeAttemptFeedbackSchema,
  createdAt: z.string(),
})
export type KnowledgeAttempt = z.infer<typeof KnowledgeAttemptSchema>
