import { describe, it, expect } from 'vitest'
import { DeepdiveFeedbackSchema, DeepdiveStepSchema, ProjectMapSchema } from './deepdive'

const fb = { scores:{ techDepth:8, implementationClarity:7, architectureAwareness:6, metricsAwareness:5, expression:7 },
  total:33, strengths:['召回讲清楚了'], vague:['阈值没说清'], missingDetails:['去重策略'], followUps:['数据泄漏?'], betterAnswer:'先讲…' }

describe('deepdive schemas', () => {
  it('accepts valid feedback', () => { expect(DeepdiveFeedbackSchema.parse(fb)).toEqual(fb) })
  it('rejects out-of-range dimension', () => {
    expect(() => DeepdiveFeedbackSchema.parse({ ...fb, scores:{ ...fb.scores, techDepth:11 } })).toThrow()
  })
  it('accepts a step with null feedback (first turn)', () => {
    expect(DeepdiveStepSchema.parse({ feedback:null, nextQuestion:'你的 RAG 如何召回?' }).nextQuestion).toBe('你的 RAG 如何召回?')
  })
  it('accepts a step ending the deepdive', () => {
    expect(DeepdiveStepSchema.parse({ feedback:fb, nextQuestion:null }).nextQuestion).toBeNull()
  })
  it('accepts a valid project map', () => {
    const m = { projectName:'P', background:'b', businessGoal:'g', techApproach:'t', personalContribution:'c',
      coreChallenges:['难'], alternatives:['别的'], evaluation:'e', risks:['风险'], optimizations:['优化'],
      hotQuestions:['追问'], blindSpots:['盲区'] }
    expect(ProjectMapSchema.parse(m)).toEqual(m)
  })
})
