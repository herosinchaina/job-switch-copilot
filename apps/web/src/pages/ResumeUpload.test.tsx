// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { ResumeUpload } from './ResumeUpload'
import { api } from '../api'

beforeEach(() => {
  vi.spyOn(api, 'uploadResume').mockResolvedValue({ resumeId:1, versionId:2,
    structured: { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] } as any })
  vi.spyOn(api, 'updateVersion').mockResolvedValue({ ok:true } as any)
  vi.spyOn(api, 'confirmVersion').mockResolvedValue({ ok:true } as any)
})

describe('ResumeUpload', () => {
  it('shows draft after upload and confirms via update+confirm', async () => {
    const onConfirmed = vi.fn()
    const { getByLabelText, getByText } = render(<ResumeUpload onConfirmed={onConfirmed} />)
    fireEvent.change(getByLabelText(/上传简历/), { target: { files: [new File(['# r'], 'r.md')] } })
    await waitFor(() => getByText(/确认无误/))
    fireEvent.click(getByText(/确认无误/))
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(2))
    expect(api.confirmVersion).toHaveBeenCalledWith(2)
  })
})
