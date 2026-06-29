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
    fireEvent.click(getByText(/开始诊断/))
    await waitFor(() => getByText(/80/))
    fireEvent.click(getByText(/缺量化/))
    await waitFor(() => expect(getByText(/work\[0\]/)).toBeTruthy())
  })

  it('shows gap card when review returns gap', async () => {
    const withGap = {
      hr: { perspective:'hr', overallScore:72,
        dimensionScores:[{dimension:'jobMatch',score:66,comment:''}], suggestions:[] },
      interviewer: { perspective:'interviewer', overallScore:70, dimensionScores:[{dimension:'jobMatch',score:60,comment:''}], suggestions:[] },
      gap: { matchScore:80, missingKeywords:['k8s'], weakRequirements:['分布式经验'], coveredHighlights:['Go'] },
    }
    vi.spyOn(api,'review').mockResolvedValue(withGap as any)
    const { getByText, findByText } = render(<ResumeReview versionId={2} onBack={()=>{}} onOptimize={()=>{}} />)
    fireEvent.click(getByText(/开始诊断/))
    await findByText(/匹配缺口|岗位匹配/)
    expect(getByText(/k8s/)).toBeTruthy()
  })
})
