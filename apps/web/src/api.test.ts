import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from './api'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })))
})

describe('api', () => {
  it('confirmVersion posts to the confirm endpoint', async () => {
    await api.confirmVersion(7)
    expect(fetch).toHaveBeenCalledWith('/api/resumes/versions/7/confirm', expect.objectContaining({ method: 'POST' }))
  })
  it('review posts versionId', async () => {
    await api.review(3)
    const [, opts] = (fetch as any).mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({ versionId: 3 })
  })
})
