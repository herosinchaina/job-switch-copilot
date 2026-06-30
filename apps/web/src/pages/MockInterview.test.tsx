// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { MockInterview } from './MockInterview'
import { api } from '../api'

// jsdom 不实现 scrollIntoView;自动滚动 effect 需要它
beforeEach(() => {
  ;(Element.prototype as any).scrollIntoView ??= () => {}
})

beforeEach(() => {
  vi.spyOn(api, 'startInterview').mockResolvedValue({ sessionId:1, turnIndex:0, question:'请自我介绍' } as any)
  vi.spyOn(api, 'answerInterview').mockResolvedValue({
    feedback:{ score:70, highlights:['清晰'], gaps:[], better:'' }, nextQuestion:null, turnIndex:0, finished:true,
    report:{ overallScore:72, dimensions:[{name:'专业性',score:75,comment:'好'}], bestTurn:null, worstTurn:null, weaknesses:['系统设计'], nextSteps:['多练'] },
  } as any)
  vi.spyOn(api, 'listInterviews').mockResolvedValue([] as any)
})

describe('MockInterview', () => {
  it('starts, answers, and shows the report', async () => {
    const { getByText, getByLabelText, findByText } = render(<MockInterview versionId={2} onBack={()=>{}} />)
    fireEvent.click(getByText(/开始面试/))
    await findByText(/请自我介绍/)
    fireEvent.change(getByLabelText(/你的回答/), { target: { value: '我是...' } })
    fireEvent.click(getByText(/提交回答/))
    await findByText(/面试报告/)
    expect(getByText(/系统设计/)).toBeTruthy()   // weakness 渲染
  })

  it('submits on Enter (without Shift)', async () => {
    const { getByText, getByLabelText, findByText } = render(<MockInterview versionId={2} onBack={()=>{}} />)
    fireEvent.click(getByText(/开始面试/))
    await findByText(/请自我介绍/)
    const box = getByLabelText(/你的回答/)
    fireEvent.change(box, { target: { value: '我的回答' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(api.answerInterview).toHaveBeenCalledWith(1, '我的回答'))
  })

  it('does not submit on Shift+Enter', async () => {
    const { getByText, getByLabelText, findByText } = render(<MockInterview versionId={2} onBack={()=>{}} />)
    fireEvent.click(getByText(/开始面试/))
    await findByText(/请自我介绍/)
    const box = getByLabelText(/你的回答/)
    fireEvent.change(box, { target: { value: '换行不提交' } })
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
    expect(api.answerInterview).not.toHaveBeenCalled()
  })

  it('lists past interviews and opens a read-only review', async () => {
    vi.spyOn(api, 'listInterviews').mockResolvedValue([
      { id: 9, role: '后端工程师', roundType: 'tech', status: 'finished', overallScore: 68, createdAt: '2026-06-30' },
    ] as any)
    vi.spyOn(api, 'getInterview').mockResolvedValue({
      session: { id: 9, status: 'finished', report: { overallScore: 68, dimensions: [], bestTurn: null, worstTurn: null, weaknesses: ['并发'], nextSteps: [] } },
      turns: [{ turnIndex: 0, question: '介绍项目', answer: '我做了X', score: 60, feedback: { score: 60, highlights: [], gaps: ['浅'], better: '深入' }, isWeak: true }],
    } as any)
    const { getByText, findByText } = render(<MockInterview versionId={2} onBack={()=>{}} />)
    await findByText(/后端工程师/)               // 历史列表渲染
    fireEvent.click(getByText(/后端工程师/))
    await findByText(/面试回看/)                  // 进入回看
    expect(getByText(/介绍项目/)).toBeTruthy()    // 还原 AI 问题
    expect(getByText(/我做了X/)).toBeTruthy()     // 还原我的回答
    expect(getByText(/并发/)).toBeTruthy()        // 报告短板
  })
})
