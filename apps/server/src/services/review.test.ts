import { describe, it, expect } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { reviewResume } from './review'

const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }
const reviewOut = JSON.stringify({ perspective:'hr', overallScore:75,
  dimensionScores:[{dimension:'layout',score:70,comment:'ok'}],
  suggestions:[{location:'work[0]',severity:'high',issue:'缺量化',suggestion:'补数据'}] })
const fakeAi = (out: string): AiProvider => ({ async complete(){return out}, async *stream(){yield out} })

describe('reviewResume', () => {
  it('returns a validated Review and forces the requested perspective', async () => {
    const r = await reviewResume(fakeAi(reviewOut), sample as any, 'interviewer')
    expect(r.overallScore).toBe(75)
    expect(r.perspective).toBe('interviewer') // 服务以入参视角为准,覆盖 AI 输出
  })
})
