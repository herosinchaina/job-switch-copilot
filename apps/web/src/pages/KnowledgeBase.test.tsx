// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { KnowledgeBase } from './KnowledgeBase'
import { api } from '../api'

const item = { id:1, question:'RAG 召回?', answer:'我的答', reference:'更优', tags:['ai'],
  source:'manual', sourceRef:null, note:null, mastery:1, reviewDue:'2026-07-08',
  reviewInterval:2, reviewCount:1, createdAt:'2026-07-07', updatedAt:'2026-07-07' }

beforeEach(() => {
  ;(Element.prototype as any).scrollIntoView ??= () => {}
  vi.spyOn(api, 'listKnowledge').mockResolvedValue([item] as any)
  vi.spyOn(api, 'listKnowledgeTags').mockResolvedValue(['ai'] as any)
  vi.spyOn(api, 'listDue').mockResolvedValue([item] as any)
  vi.spyOn(api, 'createKnowledge').mockResolvedValue({ ...item, id:2, question:'新题' } as any)
  vi.spyOn(api, 'reviewKnowledge').mockResolvedValue({ ...item, reviewCount:2 } as any)
})

describe('KnowledgeBase', () => {
  it('renders the library list', async () => {
    const { findByText } = render(<KnowledgeBase />)
    expect(await findByText(/RAG 召回/)).toBeTruthy()
  })
  it('creates a new item', async () => {
    const { getByText, findByText, getByLabelText } = render(<KnowledgeBase />)
    await findByText(/RAG 召回/)
    fireEvent.click(getByText(/新增条目/))
    fireEvent.change(getByLabelText(/问题/), { target:{ value:'新题' } })
    fireEvent.click(getByText(/保存/))
    await waitFor(() => expect(api.createKnowledge).toHaveBeenCalled())
  })
  it('review flow: reveal answer then self-grade advances the card', async () => {
    const { getByText, findByText } = render(<KnowledgeBase />)
    await findByText(/RAG 召回/)
    fireEvent.click(getByText(/今日复习/))
    await findByText(/RAG 召回/)                 // 题面
    fireEvent.click(getByText(/显示答案/))
    await findByText(/更优/)                      // reference 展示
    fireEvent.click(getByText(/记住了/))
    await waitFor(() => expect(api.reviewKnowledge).toHaveBeenCalledWith(1, 'remembered'))
  })
})
