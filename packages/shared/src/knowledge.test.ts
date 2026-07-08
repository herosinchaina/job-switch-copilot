import { describe, it, expect } from 'vitest'
import { KnowledgeItemInputSchema, KnowledgeItemSchema } from './knowledge'

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
      createdAt:'2026-07-07', updatedAt:'2026-07-07' }
    expect(KnowledgeItemSchema.parse(item)).toEqual(item)
  })
  it('rejects out-of-range mastery and unknown source', () => {
    const base = { id:1, question:'Q', answer:null, reference:null, tags:[], sourceRef:null, note:null,
      mastery:2, reviewDue:'d', reviewInterval:0, reviewCount:0, createdAt:'c', updatedAt:'u' }
    expect(() => KnowledgeItemSchema.parse({ ...base, source:'manual', mastery:6 })).toThrow()
    expect(() => KnowledgeItemSchema.parse({ ...base, source:'weird' })).toThrow()
  })
})
