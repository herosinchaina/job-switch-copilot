import { describe, it, expect } from 'vitest'
import { KnowledgeItemInputSchema, KnowledgeItemSchema, AttemptGradeRawSchema, KnowledgeAttemptFeedbackSchema, KnowledgeAttemptSchema, CONQUER_THRESHOLD } from './knowledge'

describe('knowledge schemas', () => {
  it('defaults optional input fields', () => {
    const v = KnowledgeItemInputSchema.parse({ question: 'Q' })
    expect(v).toEqual({ question:'Q', answer:null, reference:null, tags:[], note:null })
  })
  it('rejects empty question', () => {
    expect(() => KnowledgeItemInputSchema.parse({ question:'' })).toThrow()
  })
  it('accepts a full item', () => {
    const item = { id:1, question:'Q', answer:'a', reference:'r', tags:['ai'], source:'manual',
      sourceRef:null, note:null, mastery:2, reviewDue:'2026-07-08', reviewInterval:2, reviewCount:1,
      createdAt:'2026-07-07', updatedAt:'2026-07-07', conqueredAt:null }
    expect(KnowledgeItemSchema.parse(item)).toEqual(item)
  })
  it('rejects out-of-range mastery and unknown source', () => {
    const base = { id:1, question:'Q', answer:null, reference:null, tags:[], sourceRef:null, note:null,
      mastery:2, reviewDue:'d', reviewInterval:0, reviewCount:0, createdAt:'c', updatedAt:'u' }
    expect(() => KnowledgeItemSchema.parse({ ...base, source:'manual', mastery:6 })).toThrow()
    expect(() => KnowledgeItemSchema.parse({ ...base, source:'weird' })).toThrow()
  })
})

describe('error-book schemas', () => {
  it('CONQUER_THRESHOLD is 60', () => {
    expect(CONQUER_THRESHOLD).toBe(60)
  })
  it('AttemptGradeRawSchema accepts score+comment+gaps, defaults gaps', () => {
    const r = AttemptGradeRawSchema.parse({ score: 72, comment: '不错' })
    expect(r.gaps).toEqual([])
    expect(r.score).toBe(72)
  })
  it('AttemptGradeRawSchema rejects out-of-range score', () => {
    expect(() => AttemptGradeRawSchema.parse({ score: 120, comment: 'x' })).toThrow()
  })
  it('KnowledgeAttemptFeedbackSchema requires verdict enum', () => {
    expect(() => KnowledgeAttemptFeedbackSchema.parse({ score: 60, verdict: 'maybe', comment: '', gaps: [] })).toThrow()
  })
  it('KnowledgeAttemptSchema parses a full row', () => {
    const a = KnowledgeAttemptSchema.parse({
      id: 1, itemId: 2, answer: 'ans', score: 80,
      feedback: { score: 80, verdict: 'pass', comment: 'ok', gaps: [] }, createdAt: '2026-07-10',
    })
    expect(a.feedback.verdict).toBe('pass')
  })
  it('KnowledgeItemSchema accepts conqueredAt null and string', () => {
    const base = { id:1, question:'q', answer:null, reference:null, tags:[], source:'interview',
      sourceRef:null, note:null, mastery:0, reviewDue:'2026-07-10', reviewInterval:0, reviewCount:0,
      createdAt:'2026-07-10', updatedAt:'2026-07-10' }
    expect(KnowledgeItemSchema.parse({ ...base, conqueredAt: null }).conqueredAt).toBeNull()
    expect(KnowledgeItemSchema.parse({ ...base, conqueredAt: '2026-07-10' }).conqueredAt).toBe('2026-07-10')
  })
})
