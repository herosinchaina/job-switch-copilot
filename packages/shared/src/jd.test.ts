import { describe, it, expect } from 'vitest'
import { JobDescriptionSchema, GapAnalysisSchema } from './jd'
import { DIMENSIONS } from './review'

describe('JD schemas', () => {
  it('accepts a valid JD', () => {
    const jd = { role:'后端工程师', company:'X', keywords:['Go','Redis'],
      responsibilities:['服务端开发'], requirements:{ must:['3年经验'], nice:['k8s'] } }
    expect(JobDescriptionSchema.parse(jd)).toEqual(jd)
  })
  it('accepts a valid gap analysis', () => {
    const g = { matchScore:72, missingKeywords:['k8s'], weakRequirements:['分布式'], coveredHighlights:['Go'] }
    expect(GapAnalysisSchema.parse(g)).toEqual(g)
  })
  it('rejects out-of-range matchScore', () => {
    expect(() => GapAnalysisSchema.parse({ matchScore:150, missingKeywords:[], weakRequirements:[], coveredHighlights:[] })).toThrow()
  })
  it('DIMENSIONS now has 8 keys including jobMatch', () => {
    expect(DIMENSIONS).toHaveLength(8)
    expect(DIMENSIONS).toContain('jobMatch')
  })
})
