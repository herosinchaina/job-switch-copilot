// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { JdSelector } from './JdSelector'
import { api } from '../api'

beforeEach(() => {
  vi.spyOn(api, 'listJds').mockResolvedValue([{ id:1, title:'后端工程师', company:'X', createdAt:'' }])
  vi.spyOn(api, 'createJd').mockResolvedValue({ id:2, structured:{ role:'前端', company:'', keywords:[], responsibilities:[], requirements:{must:[],nice:[]} } } as any)
})

describe('JdSelector', () => {
  it('lists existing JDs and selects one', async () => {
    const onChange = vi.fn()
    const { findByText, getByLabelText } = render(<JdSelector value={null} onChange={onChange} />)
    await findByText(/后端工程师/)
    fireEvent.change(getByLabelText(/目标岗位/), { target: { value: '1' } })
    expect(onChange).toHaveBeenCalledWith(1)
  })
  it('adds a new JD via the form', async () => {
    const onChange = vi.fn()
    const { getByText, getByLabelText } = render(<JdSelector value={null} onChange={onChange} />)
    fireEvent.click(getByText(/添加 JD/))
    fireEvent.change(getByLabelText(/岗位名称/), { target: { value: '前端工程师' } })
    fireEvent.change(getByLabelText(/JD 原文/), { target: { value: '岗位描述...' } })
    fireEvent.click(getByText(/保存/))
    await waitFor(() => expect(api.createJd).toHaveBeenCalled())
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(2))
  })
})
