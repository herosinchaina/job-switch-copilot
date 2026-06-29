import { describe, it, expect } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { reviewResume } from './review'

const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }
const reviewOut = JSON.stringify({ perspective:'hr', overallScore:75,
  dimensionScores:[{dimension:'layout',score:70,comment:'ok'}],
  suggestions:[{location:'work[0]',severity:'high',issue:'缺量化',suggestion:'补数据'}] })
const fakeAi = (out: string): AiProvider => ({ async complete(){return out}, async *stream(){yield out} })

const reviewJdOut = JSON.stringify({ perspective:'hr', overallScore:70,
  dimensionScores:[
    {dimension:'layout',score:70,comment:''},{dimension:'jobMatch',score:65,comment:''},
    {dimension:'ats',score:60,comment:''},{dimension:'keywordCoverage',score:55,comment:''}],
  suggestions:[] })
const sampleJd = { role:'后端', company:'', keywords:['Go'], responsibilities:[], requirements:{must:[],nice:[]} }

describe('reviewResume', () => {
  it('returns a validated Review and forces the requested perspective', async () => {
    const r = await reviewResume(fakeAi(reviewOut), sample as any, 'interviewer')
    expect(r.overallScore).toBe(75)
    expect(r.perspective).toBe('interviewer') // 服务以入参视角为准,覆盖 AI 输出
  })

  it('reviewResume with jd returns dimensions including jobMatch', async () => {
    const r = await reviewResume(fakeAi(reviewJdOut), sample as any, 'hr', sampleJd as any)
    expect(r.dimensionScores.some(d => d.dimension === 'jobMatch')).toBe(true)
  })

  it('jd 分支选择 JD-aware system prompt 并注入 JD', async () => {
    let captured: { system: string; prompt: string } | null = null
    const captureAi: AiProvider = {
      async complete(o) { captured = { system: o.system, prompt: o.prompt }; return reviewJdOut },
      async *stream() { yield reviewJdOut },
    }
    await reviewResume(captureAi, sample as any, 'hr', sampleJd as any)
    expect(captured).not.toBeNull()
    expect(captured!.system).toContain('JD 关键词在简历中') // 证明选中 review-with-jd.txt
    expect(captured!.prompt).toContain('JD JSON') // 证明 JD 被注入 prompt
  })

  it('无 jd 分支选择普通 review.txt（system 不含 JD 提示语）', async () => {
    let captured: { system: string; prompt: string } | null = null
    const captureAi: AiProvider = {
      async complete(o) { captured = { system: o.system, prompt: o.prompt }; return reviewOut },
      async *stream() { yield reviewOut },
    }
    await reviewResume(captureAi, sample as any, 'hr')
    expect(captured).not.toBeNull()
    expect(captured!.system).not.toContain('JD 关键词在简历中') // 证明走的是 review.txt 路径
  })
})
