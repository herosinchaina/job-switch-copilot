import { describe, it, expect } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { startGuide, continueGuide } from './guide'

const problem = { leetcodeId:1, title:'两数之和', difficulty:'easy' as const, topic:'哈希', keyIdea:'HashMap 存补数', url:'u' }
const stepOut = JSON.stringify({ guidance:'很好,那你想想暴力解的复杂度?', done:false })

describe('guide service', () => {
  it('startGuide opens a session and returns first guidance', async () => {
    const ai: AiProvider = {
      async complete(){ return '这题考点是什么?先别看答案,想想。' },
      async *stream(){ yield '' },
      startSession(){ return 'g-sess' },
      async continueSession(){ return '这题考点是什么?先别看答案,想想。' },
    }
    const r = await startGuide(ai, problem)
    expect(r.cliSessionId).toBe('g-sess')
    expect(r.firstGuidance).toContain('考点')
  })
  it('continueGuide uses the session', async () => {
    let used = false
    const ai: AiProvider = {
      async complete(){ return stepOut }, async *stream(){ yield stepOut },
      startSession(){ return 's' }, async continueSession(){ used = true; return stepOut },
    }
    const step = await continueGuide(ai, { cliSessionId:'g', problem, history:[{question:'q',answer:'a'}], question:'q', answer:'a' })
    expect(used).toBe(true); expect(step.done).toBe(false)
  })
  it('continueGuide falls back to stateless when session throws', async () => {
    let usedComplete = false
    const ai: AiProvider = {
      async complete(){ usedComplete = true; return stepOut }, async *stream(){ yield stepOut },
      startSession(){ return 's' }, async continueSession(){ throw new Error('resume failed') },
    }
    const step = await continueGuide(ai, { cliSessionId:'g', problem, history:[{question:'q',answer:'a'}], question:'q', answer:'a' })
    expect(usedComplete).toBe(true); expect(step.guidance).toBeTruthy()
  })
})
