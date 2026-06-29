// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { InterviewKit } from './InterviewKit'
import { api } from '../api'

const kit = { selfIntro:{ short:'三十秒介绍', standard:'两分钟介绍' },
  projectPitches:[{ projectName:'我的项目', situation:'背景', task:'任务', action:'行动', result:'结果' }] }

beforeEach(() => { vi.spyOn(api,'generateKit').mockResolvedValue({ id:1, kit } as any) })

describe('InterviewKit', () => {
  it('shows skeleton then renders self-intro and project pitch', async () => {
    const { getByText, findByText } = render(<InterviewKit versionId={2} jobDescriptionId={null} onBack={()=>{}} />)
    expect(getByText(/生成中/)).toBeTruthy()
    await findByText(/三十秒介绍/)
    expect(getByText(/两分钟介绍/)).toBeTruthy()
    expect(getByText(/我的项目/)).toBeTruthy()
  })
})
