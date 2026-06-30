import { describe, it, expect } from 'vitest'
import { LcProblemSchema, GuideStepSchema, DIFFICULTIES, PROGRESS_STATUSES } from './leetcode'

describe('leetcode schemas', () => {
  it('accepts a valid problem', () => {
    const p = { leetcodeId:1, title:'两数之和', difficulty:'easy', topic:'哈希', keyIdea:'HashMap 存补数', url:'https://leetcode.cn/problems/two-sum/' }
    expect(LcProblemSchema.parse(p)).toEqual(p)
  })
  it('rejects bad difficulty', () => {
    expect(() => LcProblemSchema.parse({ leetcodeId:1, title:'x', difficulty:'eazy', topic:'哈希', keyIdea:'k', url:'u' })).toThrow()
  })
  it('accepts a guide step', () => {
    expect(GuideStepSchema.parse({ guidance:'先想想考点', done:false })).toEqual({ guidance:'先想想考点', done:false })
  })
  it('exposes enums', () => {
    expect(DIFFICULTIES).toEqual(['easy','medium','hard'])
    expect(PROGRESS_STATUSES).toEqual(['new','learning','mastered'])
  })
})
