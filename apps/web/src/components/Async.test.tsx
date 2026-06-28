// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { AsyncView } from './Async'

describe('AsyncView', () => {
  it('shows loading', () => {
    const { getByText } = render(<AsyncView state={{loading:true}}>{() => <div/>}</AsyncView>)
    expect(getByText(/加载中/)).toBeTruthy()
  })
  it('shows error', () => {
    const { getByText } = render(<AsyncView state={{error:'boom'}}>{() => <div/>}</AsyncView>)
    expect(getByText(/boom/)).toBeTruthy()
  })
  it('renders data', () => {
    const { getByText } = render(<AsyncView state={{data:'hi'}}>{(d) => <div>{d}</div>}</AsyncView>)
    expect(getByText('hi')).toBeTruthy()
  })
})
