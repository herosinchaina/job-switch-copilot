// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, findByText as _f } from '@testing-library/react'
import { LcGuide } from './LcGuide'
import { api } from '../api'

beforeEach(() => {
  ;(Element.prototype as any).scrollIntoView ??= () => {}
  vi.spyOn(api, 'lcProblems').mockResolvedValue([{ leetcodeId:1, title:'两数之和', difficulty:'easy', topic:'哈希', keyIdea:'k', url:'https://lc/two-sum', status:'new' }] as any)
  vi.spyOn(api, 'startGuide').mockResolvedValue({ sessionId:7, guidance:'这题考点是什么?' } as any)
  vi.spyOn(api, 'stepGuide').mockResolvedValue({ guidance:'你已掌握,真棒', done:true } as any)
  vi.spyOn(api, 'setLcProgress').mockResolvedValue({ ok:true } as any)
})

describe('LcGuide', () => {
  it('starts guide, answers, reaches done', async () => {
    const { getByText, getByLabelText, findByText } = render(<LcGuide leetcodeId={1} onBack={()=>{}} />)
    await findByText(/这题考点是什么/)
    fireEvent.change(getByLabelText(/你的思考/), { target: { value: '哈希表' } })
    fireEvent.click(getByText(/提交/))
    await findByText(/本题引导完成/)
  })
})
