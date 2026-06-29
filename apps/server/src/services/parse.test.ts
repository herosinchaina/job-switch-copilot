import { describe, it, expect } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { parseResume } from './parse'

const valid = JSON.stringify({ basics:{name:'Z',title:'Dev',contact:'z@x',summary:''},
  education:[],work:[],projects:[],skills:[],awards:[] })

const fakeAi = (out: string): AiProvider => ({
  async complete() { return out },
  async *stream() { yield out },
})

describe('parseResume', () => {
  it('returns a validated StructuredResume', async () => {
    const r = await parseResume(fakeAi(valid), '原始简历文本')
    expect(r.basics.name).toBe('Z')
  })
  it('throws on non-schema AI output', async () => {
    await expect(parseResume(fakeAi('{"bad":true}'), 'x')).rejects.toThrow()
  })
})
