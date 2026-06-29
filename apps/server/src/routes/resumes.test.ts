import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../db/repo'
import { createApp } from '../index'
import type { AiProvider } from '../ai/provider'

const parsed = JSON.stringify({ basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] })
const fakeAi: AiProvider = { async complete(){return parsed}, async *stream(){yield parsed} }
let db: DatabaseSync, app: any
beforeEach(() => { db = openDb(':memory:'); app = createApp(db, fakeAi) })

describe('resume routes', () => {
  it('upload creates a draft version', async () => {
    const res = await request(app).post('/api/resumes')
      .attach('file', Buffer.from('# resume'), 'r.md')
    expect(res.status).toBe(200)
    expect(res.body.structured.basics.name).toBe('A')
  })
  it('rejects review before confirm', async () => {
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    const res = await request(app).post('/api/reviews').send({ versionId: up.body.versionId })
    expect(res.status).toBe(409) // not confirmed
  })
  it('rejects optimize before confirm', async () => {
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    const res = await request(app).post('/api/optimize').send({ versionId: up.body.versionId })
    expect(res.status).toBe(409) // not confirmed
  })
})
