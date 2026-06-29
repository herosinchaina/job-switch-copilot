import { describe, it, expect, vi } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { generateKit } from './kit'

const kitOut = JSON.stringify({ selfIntro:{ short:'30秒', standard:'1-2分钟' },
  projectPitches:[{ projectName:'P', situation:'S', task:'T', action:'A', result:'R' }] })
const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] } as any
const sampleJd = { role:'后端', company:'', keywords:['Go'], responsibilities:[], requirements:{must:[],nice:[]} } as any

describe('generateKit', () => {
  it('returns a validated kit without jd', async () => {
    const ai: AiProvider = { async complete(){return kitOut}, async *stream(){yield kitOut} }
    const k = await generateKit(ai, sample)
    expect(k.selfIntro.short).toBe('30秒')
  })
  it('selects the jd prompt and injects JD when jd given', async () => {
    let captured = ''
    const ai: AiProvider = { async complete(o){ captured = o.system + '\n' + o.prompt; return kitOut }, async *stream(o){ yield await this.complete(o) } }
    await generateKit(ai, sample, sampleJd)
    expect(captured).toContain('目标岗位')        // kit-with-jd.txt 含此短语
    expect(captured).toContain('JD JSON')          // JD 注入 prompt body
  })
  it('throws on non-schema output', async () => {
    const ai: AiProvider = { async complete(){return '{"bad":1}'}, async *stream(){yield '{"bad":1}'} }
    await expect(generateKit(ai, sample)).rejects.toThrow()
  })
})
