// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { Sidebar } from './Sidebar'

afterEach(() => cleanup())

describe('Sidebar', () => {
  it('shows product brand and module hub label', () => {
    const { getByText } = render(
      <Sidebar view="dashboard" onNavigate={vi.fn()} dark onToggleTheme={vi.fn()} />,
    )
    expect(getByText('AI 求职操作系统')).toBeTruthy()
    expect(getByText('模块大厅')).toBeTruthy()
  })
  it('navigates when a module is clicked', () => {
    const onNavigate = vi.fn()
    const { getByText } = render(
      <Sidebar view="dashboard" onNavigate={onNavigate} dark onToggleTheme={vi.fn()} />,
    )
    fireEvent.click(getByText('简历大师'))
    expect(onNavigate).toHaveBeenCalledWith('resume')
  })
  it('marks current view with aria-current', () => {
    const { getByText } = render(
      <Sidebar view="interview" onNavigate={vi.fn()} dark onToggleTheme={vi.fn()} />,
    )
    expect(getByText('模拟面试').closest('button')?.getAttribute('aria-current')).toBe('page')
  })
  it('toggles theme from footer control', () => {
    const onToggleTheme = vi.fn()
    const { getByLabelText } = render(
      <Sidebar view="dashboard" onNavigate={vi.fn()} dark onToggleTheme={onToggleTheme} />,
    )
    fireEvent.click(getByLabelText('切换到浅色模式'))
    expect(onToggleTheme).toHaveBeenCalled()
  })
})
