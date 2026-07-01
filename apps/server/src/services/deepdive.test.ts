import { describe, it, expect } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { startDeepdive, findProject } from './deepdive'

const resume = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],
  projects:[{name:'体验生判',role:'负责人',period:'',stack:['Zeus','RAG'],bullets:['用 LLM 对 query/类别打分'],metrics:['acc+1.5pp']}],
  skills:[],awards:[] } as any

describe('deepdive service', () => {
  it('findProject locates by name', () => {
    expect(findProject(resume, '体验生判')!.stack).toContain('RAG')
    expect(findProject(resume, '不存在')).toBeUndefined()
  })
  it('startDeepdive opens a session and returns first question', async () => {
    let captured = ''
    const ai: AiProvider = {
      async complete(){ return 'q' }, async *stream(){ yield 'q' },
      startSession(){ return 'dd-sess' },
      async continueSession(_s, o){ captured = o.prompt; return '你提到用 LLM 打分,Prompt 如何设计?' },
    }
    const r = await startDeepdive(ai, { resume, projectName:'体验生判' })
    expect(r.cliSessionId).toBe('dd-sess')
    expect(r.firstQuestion).toContain('Prompt')
    expect(captured).toContain('体验生判')   // 项目结构注入了 prompt
    expect(captured).toContain('用 LLM 对 query/类别打分')  // bullets 原句注入
  })
})
