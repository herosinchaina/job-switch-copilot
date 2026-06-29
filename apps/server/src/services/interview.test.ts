import { describe, it, expect, vi } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { startInterview } from './interview'

const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] } as any

function sessionAi(reply: string) {
  const calls: { sid:string; prompt:string; system?:string }[] = []
  const ai: AiProvider = {
    async complete(){ return reply },
    async *stream(){ yield reply },
    startSession(){ return 'sess-123' },
    async continueSession(sid, o){ calls.push({ sid, prompt:o.prompt, system:o.system }); return reply },
  }
  return { ai, calls }
}

describe('startInterview', () => {
  it('opens a CLI session and returns the first question', async () => {
    const { ai, calls } = sessionAi('请做一下自我介绍。')
    const r = await startInterview(ai, { resume: sample, roundType: 'tech' })
    expect(r.cliSessionId).toBe('sess-123')
    expect(r.firstQuestion).toBe('请做一下自我介绍。')
    expect(calls[0].sid).toBe('sess-123')
  })
})

import { answerTurn } from './interview'
const stepOut = JSON.stringify({ feedback:{ score:70, highlights:['清晰'], gaps:[], better:'' }, nextQuestion:'再展开讲讲' })

describe('answerTurn', () => {
  const baseCtx = { roundType:'tech' as const, resume: sample, history:[{question:'q0',answer:'a0'}], question:'q0', answer:'a0', turnIndex:0, maxRounds:6 }

  it('uses the CLI session when available', async () => {
    let usedSession = false
    const ai: AiProvider = {
      async complete(){ return stepOut },
      async *stream(){ yield stepOut },
      startSession(){ return 's' },
      async continueSession(){ usedSession = true; return stepOut },
    }
    const step = await answerTurn(ai, { ...baseCtx, cliSessionId: 'sess-1' })
    expect(usedSession).toBe(true)
    expect(step.nextQuestion).toBe('再展开讲讲')
  })

  it('falls back to stateless completeJson when the session call throws', async () => {
    let usedComplete = false
    const ai: AiProvider = {
      async complete(){ usedComplete = true; return stepOut },
      async *stream(){ yield stepOut },
      startSession(){ return 's' },
      async continueSession(){ throw new Error('resume failed') },
    }
    const step = await answerTurn(ai, { ...baseCtx, cliSessionId: 'sess-1' })
    expect(usedComplete).toBe(true)            // 降级到无状态
    expect(step.feedback!.score).toBe(70)
  })

  it('falls back when there is no cliSessionId', async () => {
    let usedComplete = false
    const ai: AiProvider = { async complete(){ usedComplete = true; return stepOut }, async *stream(){ yield stepOut } }
    const step = await answerTurn(ai, { ...baseCtx, cliSessionId: null })
    expect(usedComplete).toBe(true)
    expect(step.nextQuestion).toBe('再展开讲讲')
  })
})
