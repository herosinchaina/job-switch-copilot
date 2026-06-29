// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { ResumeReview } from './ResumeReview'
import { api } from '../api'

// recharts' ResponsiveContainer relies on ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class { observe(){} unobserve(){} disconnect(){} } as any

const mk = (p: 'hr'|'interviewer', score: number) => ({ perspective:p, overallScore:score,
  dimensionScores:[{dimension:'layout',score,comment:''}],
  suggestions:[{location:'work[0]',severity:'high',issue:'缺量化',suggestion:'补数据'}] })

beforeEach(() => { vi.spyOn(api,'review').mockResolvedValue({ hr: mk('hr',80), interviewer: mk('interviewer',70) } as any) })

describe('ResumeReview', () => {
  it('renders both perspectives and highlights a clicked suggestion', async () => {
    const { getByText } = render(<ResumeReview versionId={2} onBack={()=>{}} onOptimize={()=>{}} />)
    await waitFor(() => getByText(/80/))
    fireEvent.click(getByText(/缺量化/))
    await waitFor(() => expect(getByText(/work\[0\]/)).toBeTruthy())
  })
})
