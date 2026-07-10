import { describe, it, expect } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { gradeAttempt } from './errorbook'

function fakeAi(raw: object): AiProvider {
  const s = JSON.stringify(raw)
  return { async complete(){ return s }, async *stream(){ yield s } }
}

describe('gradeAttempt', () => {
  it('marks pass when score >= 60 (verdict computed server-side)', async () => {
    const fb = await gradeAttempt(fakeAi({ score: 75, comment: '答得不错', gaps: ['缺少复杂度分析'] }),
      { question: 'q', reference: 'ref', answer: 'my answer' })
    expect(fb.verdict).toBe('pass')
    expect(fb.score).toBe(75)
    expect(fb.gaps).toEqual(['缺少复杂度分析'])
  })
  it('marks fail when score < 60 even if AI text implies success', async () => {
    const fb = await gradeAttempt(fakeAi({ score: 40, comment: '你答对了' }),
      { question: 'q', reference: null, answer: 'a' })
    expect(fb.verdict).toBe('fail')
    expect(fb.gaps).toEqual([])
  })
  it('throws after retries when AI returns invalid JSON', async () => {
    const ai: AiProvider = { async complete(){ return '不是JSON' }, async *stream(){ yield '' } }
    await expect(gradeAttempt(ai, { question:'q', reference:null, answer:'a' })).rejects.toThrow()
  })
})
