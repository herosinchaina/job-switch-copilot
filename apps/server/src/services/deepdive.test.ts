import { describe, it, expect } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { startDeepdive, findProject, answerDeepdive } from './deepdive'

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

const stepOut = JSON.stringify({ feedback:{ scores:{techDepth:6,implementationClarity:6,architectureAwareness:6,metricsAwareness:6,expression:6}, total:30, strengths:[], vague:[], missingDetails:[], followUps:[], betterAnswer:'' }, nextQuestion:'那召回排序如何做?' })

describe('answerDeepdive', () => {
  const base = { resume, projectName:'体验生判', history:[{question:'q',answer:'a'}], question:'q', answer:'a', turnIndex:0, maxRounds:8 }
  it('uses the CLI session when available', async () => {
    let used = false
    const ai: AiProvider = { async complete(){return stepOut}, async *stream(){yield stepOut},
      startSession(){return 's'}, async continueSession(){ used = true; return stepOut } }
    const step = await answerDeepdive(ai, { ...base, cliSessionId:'s1' })
    expect(used).toBe(true); expect(step.nextQuestion).toBe('那召回排序如何做?')
  })
  it('falls back to stateless when session throws', async () => {
    let usedComplete = false
    const ai: AiProvider = { async complete(){ usedComplete = true; return stepOut }, async *stream(){yield stepOut},
      startSession(){return 's'}, async continueSession(){ throw new Error('resume failed') } }
    const step = await answerDeepdive(ai, { ...base, cliSessionId:'s1' })
    expect(usedComplete).toBe(true); expect(step.feedback!.total).toBe(30)
  })
})
