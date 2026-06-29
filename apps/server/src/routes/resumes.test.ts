import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb, createJd } from '../db/repo'
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

function smartAi(): AiProvider {
  const reviewBase = JSON.stringify({ perspective:'hr', overallScore:70, dimensionScores:[{dimension:'layout',score:70,comment:''}], suggestions:[] })
  const review8 = JSON.stringify({ perspective:'hr', overallScore:72, dimensionScores:[{dimension:'jobMatch',score:66,comment:''}], suggestions:[] })
  const gap = JSON.stringify({ matchScore:80, missingKeywords:['k8s'], weakRequirements:[], coveredHighlights:['Go'] })
  return {
    async complete(o) {
      if (o.system.includes('解析器')) return parsed                  // parse.txt(上传时的简历解析)
      if (o.system.includes('JD 关键词在简历中')) return review8     // review-with-jd.txt
      if (o.system.includes('匹配分析师')) return gap                 // gap.txt
      return reviewBase                                              // review.txt
    },
    async *stream(o){ yield await this.complete(o) },
  }
}

describe('reviews with jd', () => {
  it('review with jobDescriptionId returns gap and jd dimensions', async () => {
    const db = openDb(':memory:'); const app = createApp(db, smartAi())
    // upload + confirm a resume
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    await request(app).post(`/api/resumes/versions/${up.body.versionId}/confirm`)
    const jdId = createJd(db, { title:'后端', company:'', rawText:'jd', structured:{role:'后端',company:'',keywords:['Go'],responsibilities:[],requirements:{must:[],nice:[]}} })
    const res = await request(app).post('/api/reviews').send({ versionId: up.body.versionId, jobDescriptionId: jdId })
    expect(res.status).toBe(200)
    expect(res.body.gap.matchScore).toBe(80)
    expect(res.body.hr.dimensionScores.some((d:any)=>d.dimension==='jobMatch')).toBe(true)
  })
  it('review with unknown jobDescriptionId returns 404', async () => {
    const db = openDb(':memory:'); const app = createApp(db, smartAi())
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    await request(app).post(`/api/resumes/versions/${up.body.versionId}/confirm`)
    const res = await request(app).post('/api/reviews').send({ versionId: up.body.versionId, jobDescriptionId: 999 })
    expect(res.status).toBe(404)
  })
})
