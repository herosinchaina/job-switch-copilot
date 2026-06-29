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
