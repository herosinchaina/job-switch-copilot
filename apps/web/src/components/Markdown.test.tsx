// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Markdown } from './Markdown'

describe('Markdown', () => {
  it('renders markdown emphasis and lists', () => {
    const { container } = render(<Markdown>{'**粗体** 与\n\n- 一\n- 二'}</Markdown>)
    expect(container.querySelector('strong')?.textContent).toBe('粗体')
    expect(container.querySelectorAll('li').length).toBe(2)
  })
  it('does not render raw HTML (no script injection)', () => {
    const { container } = render(<Markdown>{'<script>alert(1)</script>安全'}</Markdown>)
    expect(container.querySelector('script')).toBeNull()
  })
})
