import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../db/repo'
import { createApp } from '../index'
import type { AiProvider } from '../ai/provider'

const jdOut = JSON.stringify({ role:'后端', company:'X', keywords:['Go'], responsibilities:[], requirements:{must:[],nice:[]} })
const fakeAi: AiProvider = { async complete(){return jdOut}, async *stream(){yield jdOut} }
let db: DatabaseSync, app: any
beforeEach(() => { db = openDb(':memory:'); app = createApp(db, fakeAi) })

describe('jd routes', () => {
  it('creates and lists a JD', async () => {
    const c = await request(app).post('/api/jds').send({ title:'后端工程师', rawText:'JD 原文' })
    expect(c.status).toBe(200)
    expect(c.body.structured.role).toBe('后端')
    const l = await request(app).get('/api/jds')
    expect(l.body.length).toBe(1)
  })
  it('rejects missing rawText with 400', async () => {
    const r = await request(app).post('/api/jds').send({ title:'x' })
    expect(r.status).toBe(400)
  })
})
