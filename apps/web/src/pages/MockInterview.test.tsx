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
})
