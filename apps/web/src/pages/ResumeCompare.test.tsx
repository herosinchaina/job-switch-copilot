// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { ResumeCompare } from './ResumeCompare'
import { api } from '../api'

const opt = { basics:{name:'A+',title:'T',contact:'c',summary:'更专业'}, education:[],work:[],projects:[],skills:[],awards:[] }
beforeEach(() => { vi.spyOn(api,'optimize').mockResolvedValue({ versionId:9, structured: opt } as any) })

describe('ResumeCompare', () => {
  it('shows skeleton then renders optimized result', async () => {
    const base = { basics:{name:'A',title:'T',contact:'c',summary:'普通'}, education:[],work:[],projects:[],skills:[],awards:[] }
    const { getByText } = render(<ResumeCompare baseVersionId={2} base={base as any} suggestions={[]} onSaved={()=>{}} />)
    expect(getByText(/生成中/)).toBeTruthy()
    await waitFor(() => expect(getByText(/更专业/)).toBeTruthy())
  })
})
