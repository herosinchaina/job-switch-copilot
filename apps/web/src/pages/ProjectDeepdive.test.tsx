// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ProjectDeepdive } from './ProjectDeepdive'
import { api } from '../api'

const structured = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],
  projects:[{name:'体验生判',role:'负责人',period:'',stack:['RAG'],bullets:['LLM 打分'],metrics:[]}], skills:[],awards:[] } as any
const fb = { scores:{techDepth:6,implementationClarity:6,architectureAwareness:6,metricsAwareness:6,expression:6}, total:30, strengths:[], vague:[], missingDetails:[], followUps:[], betterAnswer:'' }

beforeEach(() => {
  ;(Element.prototype as any).scrollIntoView ??= () => {}
  vi.spyOn(api, 'listDeepdives').mockResolvedValue([] as any)
  vi.spyOn(api, 'startDeepdive').mockResolvedValue({ sessionId:1, turnIndex:0, question:'Prompt 如何设计?' } as any)
  vi.spyOn(api, 'answerDeepdive').mockResolvedValue({
    feedback: fb, nextQuestion:null, turnIndex:0, finished:true,
    map:{ projectName:'体验生判', background:'b', businessGoal:'g', techApproach:'t', personalContribution:'c', coreChallenges:[], alternatives:[], evaluation:'e', risks:[], optimizations:[], hotQuestions:[], blindSpots:['阈值'] },
  } as any)
})

describe('ProjectDeepdive', () => {
  it('selects a project, answers, and shows the knowledge map', async () => {
    const { getByText, getByLabelText, findByText } = render(<ProjectDeepdive versionId={2} structured={structured} onBack={()=>{}} />)
    fireEvent.click(getByText(/体验生判/))            // 选项目开始
    await findByText(/Prompt 如何设计/)
    fireEvent.change(getByLabelText(/你的回答/), { target: { value:'我的回答' } })
    fireEvent.click(getByText(/提交/))
    await findByText(/项目知识地图/)
    expect(getByText(/阈值/)).toBeTruthy()             // 盲区/薄弱问题渲染
  })
  it('imports weak turns to knowledge base from the map page', async () => {
    vi.spyOn(api, 'getDeepdive').mockResolvedValue({ session:{}, turns:[
      { id:5, question:'弱题?', answer:'不会', score:20, isWeak:true, feedback:{ betterAnswer:'应当…' } }] } as any)
    vi.spyOn(api, 'importKnowledge').mockResolvedValue({ imported:1, skipped:0 } as any)
    const { getByText, getByLabelText, findByText } = render(<ProjectDeepdive versionId={2} structured={structured} onBack={()=>{}} />)
    fireEvent.click(getByText(/体验生判/))
    await findByText(/Prompt 如何设计/)
    fireEvent.change(getByLabelText(/你的回答/), { target:{ value:'我的回答' } })
    fireEvent.click(getByText(/提交/))
    await findByText(/项目知识地图/)
    fireEvent.click(getByText(/存入知识库/))
    await findByText(/已存入 1 条/)
  })
  it('shows empty state when resume has no projects', async () => {
    const { findByText } = render(<ProjectDeepdive versionId={2} structured={{ ...structured, projects: [] }} onBack={()=>{}} />)
    await findByText(/未检测到项目/)
  })
})
