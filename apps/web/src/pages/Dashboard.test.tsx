// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { Dashboard } from './Dashboard'
import { api } from '../api'

afterEach(() => cleanup())

const stats = {
  resume: { hasData: true, hrScore: 85, interviewerScore: 65 },
  algorithm: { total: 100, mastered: 12, learning: 5 },
  knowledge: { total: 8, due: 3, mastered: 2 },
  interview: { count: 2, avgScore: 70 },
  deepdive: { count: 1, avgScore: 31 },
  errorbook: { total: 4, pending: 1, conquered: 3 },
}

beforeEach(() => { vi.spyOn(api, 'dashboard').mockResolvedValue(stats as any) })

describe('Module hub (Dashboard)', () => {
  it('shows readiness percent and six equal module tiles', async () => {
    const { findByText, getByText } = render(<Dashboard />)
    expect(await findByText(/模块大厅/)).toBeTruthy()
    expect(getByText(/准备度/)).toBeTruthy()
    for (const name of ['简历大师', '模拟面试', '项目深挖', '知识库', '错题本', '算法学习']) {
      expect(getByText(name)).toBeTruthy()
    }
  })
  it('navigates when a tile is clicked', async () => {
    const onNavigate = vi.fn()
    const { findByText } = render(<Dashboard onNavigate={onNavigate} />)
    fireEvent.click(await findByText('简历大师'))
    expect(onNavigate).toHaveBeenCalledWith('resume')
  })
  it('keeps tiles clickable when stats fail', async () => {
    vi.spyOn(api, 'dashboard').mockRejectedValue(new Error('boom'))
    const onNavigate = vi.fn()
    const { findByText, getByText } = render(<Dashboard onNavigate={onNavigate} />)
    expect(await findByText(/准备度\s*—/)).toBeTruthy()
    fireEvent.click(getByText('模拟面试'))
    expect(onNavigate).toHaveBeenCalledWith('interview')
  })
  it('applies hub-tile class for hover lift CSS', async () => {
    const { findByText } = render(<Dashboard />)
    const tile = (await findByText('简历大师')).closest('.hub-tile')
    expect(tile).toBeTruthy()
  })
})
