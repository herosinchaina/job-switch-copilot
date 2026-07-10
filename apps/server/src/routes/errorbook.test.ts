import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb, createKnowledgeItem } from '../db/repo'
import { createApp } from '../index'
import type { AiProvider } from '../ai/provider'

function aiScoring(score: number): AiProvider {
  const s = JSON.stringify({ score, comment: 'c', gaps: [] })
  return { async complete(){ return s }, async *stream(){ yield s } }
}
let db: DatabaseSync

describe('error-book routes', () => {
  beforeEach(() => { db = openDb(':memory:') })

  it('GET /error-book lists pending weak items, excludes manual', async () => {
    createKnowledgeItem(db, { question:'qi', answer:'a', reference:'r', tags:[], note:null, source:'interview', sourceRef:'t1' })
    createKnowledgeItem(db, { question:'qm', answer:null, reference:null, tags:[], note:null, source:'manual', sourceRef:null })
    const app = createApp(db, aiScoring(80))
    const res = await request(app).get('/api/error-book')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].question).toBe('qi')
  })

  it('GET /error-book rejects invalid status with 400', async () => {
    const app = createApp(db, aiScoring(80))
    const res = await request(app).get('/api/error-book?status=bogus')
    expect(res.status).toBe(400)
  })

  it('POST attempt with high score conquers the item', async () => {
    const id = createKnowledgeItem(db, { question:'qi', answer:'a', reference:'r', tags:[], note:null, source:'interview', sourceRef:'t1' })
    const app = createApp(db, aiScoring(85))
    const res = await request(app).post(`/api/error-book/items/${id}/attempt`).send({ answer: 'my new answer' })
    expect(res.status).toBe(200)
    expect(res.body.conquered).toBe(true)
    expect(res.body.feedback.verdict).toBe('pass')
    // 现在应出现在 conquered 列表
    const conq = await request(app).get('/api/error-book?status=conquered')
    expect(conq.body.find((x: any) => x.id === id)).toBeTruthy()
  })

  it('POST attempt with low score does not conquer', async () => {
    const id = createKnowledgeItem(db, { question:'qi', answer:'a', reference:'r', tags:[], note:null, source:'interview', sourceRef:'t1' })
    const app = createApp(db, aiScoring(40))
    const res = await request(app).post(`/api/error-book/items/${id}/attempt`).send({ answer: 'weak' })
    expect(res.body.conquered).toBe(false)
    expect(res.body.feedback.verdict).toBe('fail')
  })

  it('POST attempt rejects manual item with 400', async () => {
    const id = createKnowledgeItem(db, { question:'qm', answer:null, reference:null, tags:[], note:null, source:'manual', sourceRef:null })
    const app = createApp(db, aiScoring(80))
    const res = await request(app).post(`/api/error-book/items/${id}/attempt`).send({ answer: 'x' })
    expect(res.status).toBe(400)
  })

  it('POST attempt rejects empty answer with 400', async () => {
    const id = createKnowledgeItem(db, { question:'qi', answer:'a', reference:'r', tags:[], note:null, source:'interview', sourceRef:'t1' })
    const app = createApp(db, aiScoring(80))
    const res = await request(app).post(`/api/error-book/items/${id}/attempt`).send({ answer: '  ' })
    expect(res.status).toBe(400)
  })

  it('GET attempts returns history; 404 for missing item', async () => {
    const id = createKnowledgeItem(db, { question:'qi', answer:'a', reference:'r', tags:[], note:null, source:'interview', sourceRef:'t1' })
    const app = createApp(db, aiScoring(70))
    await request(app).post(`/api/error-book/items/${id}/attempt`).send({ answer: 'a1' })
    const list = await request(app).get(`/api/error-book/items/${id}/attempts`)
    expect(list.body).toHaveLength(1)
    const missing = await request(app).get('/api/error-book/items/9999/attempts')
    expect(missing.status).toBe(404)
  })

  it('GET stats returns totals', async () => {
    createKnowledgeItem(db, { question:'qi', answer:'a', reference:'r', tags:['t'], note:null, source:'interview', sourceRef:'t1' })
    const app = createApp(db, aiScoring(80))
    const res = await request(app).get('/api/error-book/stats')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.pending).toBe(1)
  })
})
