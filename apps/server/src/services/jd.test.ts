import { describe, it, expect } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { parseJd, analyzeGap } from './jd'

const fakeAi = (out: string): AiProvider => ({ async complete(){return out}, async *stream(){yield out} })
const jdOut = JSON.stringify({ role:'后端', company:'X', keywords:['Go'], responsibilities:['开发'], requirements:{must:['3年'],nice:[]} })
const gapOut = JSON.stringify({ matchScore:75, missingKeywords:['k8s'], weakRequirements:[], coveredHighlights:['Go'] })
const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] } as any

describe('jd services', () => {
  it('parseJd returns a validated JobDescription', async () => {
    const jd = await parseJd(fakeAi(jdOut), 'JD 原文')
    expect(jd.role).toBe('后端')
  })
  it('analyzeGap returns a validated GapAnalysis', async () => {
    const g = await analyzeGap(fakeAi(gapOut), sample, JSON.parse(jdOut))
    expect(g.matchScore).toBe(75)
  })
  it('parseJd throws on non-schema output', async () => {
    await expect(parseJd(fakeAi('{"bad":1}'), 'x')).rejects.toThrow()
  })
})
