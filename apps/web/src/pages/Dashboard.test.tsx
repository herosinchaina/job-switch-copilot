// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { Dashboard } from './Dashboard'
import { api } from '../api'

const stats = {
  resume: { hasData: true, hrScore: 85, interviewerScore: 66 },
  algorithm: { total: 100, mastered: 12, learning: 5 },
  knowledge: { total: 8, due: 3, mastered: 2 },
  interview: { count: 2, avgScore: 70 },
  deepdive: { count: 1, avgScore: 31 },
  errorbook: { total: 4, pending: 1, conquered: 3 },
}

beforeEach(() => { vi.spyOn(api, 'dashboard').mockResolvedValue(stats as any) })

describe('Dashboard', () => {
  it('renders real metrics from the API', async () => {
    const { findAllByText, getByText } = render(<Dashboard />)
    // 综合准备度环 + KPI + Bento 均渲染
    expect((await findAllByText(/综合准备度/)).length).toBeGreaterThan(0)
    expect(getByText(/简历大师/)).toBeTruthy()
    expect(getByText(/能力雷达/)).toBeTruthy()
    expect(getByText(/训练模块/)).toBeTruthy()
  })
  it('calls onNavigate when a module card is clicked', async () => {
    const onNavigate = vi.fn()
    const { findByText } = render(<Dashboard onNavigate={onNavigate} />)
    fireEvent.click(await findByText(/简历大师/))
    expect(onNavigate).toHaveBeenCalledWith('resume')
  })
  it('continue-training CTA navigates to interview', async () => {
    const onNavigate = vi.fn()
    const { findByText } = render(<Dashboard onNavigate={onNavigate} />)
    fireEvent.click(await findByText(/继续训练/))
    expect(onNavigate).toHaveBeenCalledWith('interview')
  })
  it('shows overall readiness summary', async () => {
    const { findAllByText } = render(<Dashboard />)
    expect((await findAllByText(/综合准备度/)).length).toBeGreaterThan(0)
  })
  it('shows error state with message on failure', async () => {
    vi.spyOn(api, 'dashboard').mockRejectedValue(new Error('boom'))
    const { findByText } = render(<Dashboard />)
    expect(await findByText(/加载失败:boom/)).toBeTruthy()
  })
})
