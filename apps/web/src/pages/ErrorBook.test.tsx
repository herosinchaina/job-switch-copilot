// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { ErrorBook } from './ErrorBook'
import { api } from '../api'

const weak = { id:1, question:'RAG 如何召回?', answer:'旧答', reference:'参考答案文本', tags:['rag'],
  source:'interview', sourceRef:'t1', note:null, mastery:0, reviewDue:'2026-07-10',
  reviewInterval:0, reviewCount:0, createdAt:'2026-07-10', updatedAt:'2026-07-10', conqueredAt:null, attemptCount:0 }

beforeEach(() => {
  vi.spyOn(api, 'listErrorBook').mockResolvedValue([weak] as any)
  vi.spyOn(api, 'errorBookStats').mockResolvedValue({ total:1, pending:1, conquered:0, bySource:[{source:'interview',count:1}], byTag:[{tag:'rag',count:1}], conqueredLast7Days:0 } as any)
  vi.spyOn(api, 'listAttempts').mockResolvedValue([] as any)
  vi.spyOn(api, 'submitAttempt').mockResolvedValue({ feedback:{ score:85, verdict:'pass', comment:'答得好', gaps:[] }, conquered:true, attempt:{ id:1, itemId:1, answer:'新答', score:85, feedback:{ score:85, verdict:'pass', comment:'答得好', gaps:[] }, createdAt:'2026-07-10' } } as any)
})

describe('ErrorBook', () => {
  it('lists pending weak items', async () => {
    const { findByText } = render(<ErrorBook />)
    expect(await findByText(/RAG 如何召回/)).toBeTruthy()
  })
  it('redo flow: expand, write answer, submit, see pass verdict', async () => {
    const { findByText, getByText, getByLabelText } = render(<ErrorBook />)
    fireEvent.click(await findByText(/RAG 如何召回/))
    fireEvent.change(getByLabelText(/重做答案/), { target:{ value:'我的新答案' } })
    fireEvent.click(getByText(/让 AI 评分/))
    await waitFor(() => expect(api.submitAttempt).toHaveBeenCalledWith(1, '我的新答案'))
    expect(await findByText(/答得好/)).toBeTruthy()
    expect(await findByText(/通过/)).toBeTruthy()
  })
  it('insight tab renders stats', async () => {
    const { findByText, getByText } = render(<ErrorBook />)
    await findByText(/RAG 如何召回/)
    fireEvent.click(getByText(/洞察/))
    expect(await findByText(/待攻克/)).toBeTruthy()
  })
})
