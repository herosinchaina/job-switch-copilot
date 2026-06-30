// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { Leetcode } from './Leetcode'
import { api } from '../api'

beforeEach(() => {
  vi.spyOn(api, 'lcProblems').mockResolvedValue([
    { leetcodeId:1, title:'两数之和', difficulty:'easy', topic:'哈希', keyIdea:'k', url:'u', status:'new' },
    { leetcodeId:49, title:'字母异位词分组', difficulty:'medium', topic:'哈希', keyIdea:'k', url:'u', status:'mastered' },
  ] as any)
  vi.spyOn(api, 'lcSummary').mockResolvedValue({ total:2, mastered:1, learning:0, byTopic:[{topic:'哈希',total:2,mastered:1}] } as any)
})

describe('Leetcode', () => {
  it('renders problems grouped, progress, and opens a problem', async () => {
    const onOpen = vi.fn()
    const { getByText, findByText } = render(<Leetcode onOpen={onOpen} />)
    await findByText(/两数之和/)
    expect(getByText(/字母异位词分组/)).toBeTruthy()
    expect(getByText(/哈希/)).toBeTruthy()           // 专题分组标题
    fireEvent.click(getByText(/两数之和/))
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(1))
  })
})
