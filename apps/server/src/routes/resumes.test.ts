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

function kitAi(): AiProvider {
  const parsed = JSON.stringify({ basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] })
  const kit = JSON.stringify({ selfIntro:{ short:'30秒', standard:'1-2分钟' }, projectPitches:[] })
  return {
    async complete(o) {
      if (o.system.includes('简历解析器')) return parsed   // parse.txt
      return kit                                          // kit.txt / kit-with-jd.txt
    },
    async *stream(o){ yield await this.complete(o) },
  }
}

describe('kit routes', () => {
  it('rejects kit before confirm with 409', async () => {
    const db = openDb(':memory:'); const app = createApp(db, kitAi())
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    const res = await request(app).post('/api/kits').send({ versionId: up.body.versionId })
    expect(res.status).toBe(409)
  })
  it('generates a kit after confirm', async () => {
    const db = openDb(':memory:'); const app = createApp(db, kitAi())
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    await request(app).post(`/api/resumes/versions/${up.body.versionId}/confirm`)
    const res = await request(app).post('/api/kits').send({ versionId: up.body.versionId })
    expect(res.status).toBe(200)
    expect(res.body.kit.selfIntro.short).toBe('30秒')
  })
  it('404 on unknown jobDescriptionId', async () => {
    const db = openDb(':memory:'); const app = createApp(db, kitAi())
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    await request(app).post(`/api/resumes/versions/${up.body.versionId}/confirm`)
    const res = await request(app).post('/api/kits').send({ versionId: up.body.versionId, jobDescriptionId: 999 })
    expect(res.status).toBe(404)
  })
})

// 会话感知 fake:首问 / step / report 按 prompt 内容分辨
function interviewAi() {
  const parsed = JSON.stringify({ basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] })
  const firstQ = '请做一下自我介绍。'
  const stepGo = JSON.stringify({ feedback:{ score:70, highlights:['清晰'], gaps:[], better:'' }, nextQuestion:'展开讲讲项目' })
  const stepEnd = JSON.stringify({ feedback:{ score:65, highlights:[], gaps:['浅'], better:'深入' }, nextQuestion:null })
  const report = JSON.stringify({ overallScore:70, dimensions:[{name:'专业性',score:70,comment:'ok'}], bestTurn:null, worstTurn:null, weaknesses:[], nextSteps:[] })
  let answers = 0
  const handle = (system: string, prompt: string) => {
    if (system.includes('简历解析器')) return parsed
    if (prompt.includes('生成面试报告')) return report
    if (prompt.includes('请作为面试官提出第一个问题')) return firstQ
    if (prompt.includes('请评价本次回答')) { answers++; return answers >= 2 ? stepEnd : stepGo }  // 第2次作答结束
    return firstQ
  }
  return {
    async complete(o:any){ return handle(o.system ?? '', o.prompt) },
    async *stream(o:any){ yield this.complete(o) },
    startSession(){ return 'cli-sess' },
    async continueSession(_sid:string, o:any){ return handle(o.system ?? '', o.prompt) },
  } as any
}

describe('interview routes', () => {
  async function confirmedVersion(app:any) {
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    await request(app).post(`/api/resumes/versions/${up.body.versionId}/confirm`)
    return up.body.versionId
  }
  it('rejects start before confirm with 409', async () => {
    const db = openDb(':memory:'); const app = createApp(db, interviewAi())
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    const res = await request(app).post('/api/interviews').send({ versionId: up.body.versionId, roundType:'tech' })
    expect(res.status).toBe(409)
  })
  it('runs a full interview to a report', async () => {
    const db = openDb(':memory:'); const app = createApp(db, interviewAi())
    const vid = await confirmedVersion(app)
    const start = await request(app).post('/api/interviews').send({ versionId: vid, roundType:'tech', maxRounds:6 })
    expect(start.status).toBe(200); expect(start.body.question).toBeTruthy()
    const sid = start.body.sessionId
    const a1 = await request(app).post(`/api/interviews/${sid}/answer`).send({ answer:'我的回答1' })
    expect(a1.body.finished).toBe(false); expect(a1.body.nextQuestion).toBeTruthy()
    const a2 = await request(app).post(`/api/interviews/${sid}/answer`).send({ answer:'我的回答2' })
    expect(a2.body.finished).toBe(true); expect(a2.body.report.overallScore).toBe(70)
    const got = await request(app).get(`/api/interviews/${sid}`)
    expect(got.body.session.status).toBe('finished'); expect(got.body.turns.length).toBeGreaterThanOrEqual(2)
  })
  it('404 on unknown jobDescriptionId', async () => {
    const db = openDb(':memory:'); const app = createApp(db, interviewAi())
    const vid = await confirmedVersion(app)
    const res = await request(app).post('/api/interviews').send({ versionId: vid, roundType:'tech', jobDescriptionId: 999 })
    expect(res.status).toBe(404)
  })
  it('hard-stops at maxRounds even when AI keeps returning nextQuestion', async () => {
    // AI 永远返回非空 nextQuestion(从不主动收口),验证路由的轮次上限硬停止
    const neverEndingAi = (() => {
      const parsed = JSON.stringify({ basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] })
      const firstQ = '请做一下自我介绍。'
      const stepGo = JSON.stringify({ feedback:{ score:70, highlights:[], gaps:[], better:'' }, nextQuestion:'继续追问' })
      const report = JSON.stringify({ overallScore:70, dimensions:[{name:'专业性',score:70,comment:'ok'}], bestTurn:null, worstTurn:null, weaknesses:[], nextSteps:[] })
      const handle = (system: string, prompt: string) => {
        if (system.includes('简历解析器')) return parsed
        if (prompt.includes('生成面试报告')) return report
        if (prompt.includes('请作为面试官提出第一个问题')) return firstQ
        if (prompt.includes('请评价本次回答')) return stepGo  // 永不返回 null
        return firstQ
      }
      return {
        async complete(o:any){ return handle(o.system ?? '', o.prompt) },
        async *stream(o:any){ yield this.complete(o) },
        startSession(){ return 'cli-sess' },
        async continueSession(_sid:string, o:any){ return handle(o.system ?? '', o.prompt) },
      } as any
    })()
    const db = openDb(':memory:'); const app = createApp(db, neverEndingAi)
    const vid = await confirmedVersion(app)
    const start = await request(app).post('/api/interviews').send({ versionId: vid, roundType:'tech', maxRounds:2 })
    expect(start.status).toBe(200)
    const sid = start.body.sessionId
    // turnIndex 0 → 0+1 < 2,继续
    const a1 = await request(app).post(`/api/interviews/${sid}/answer`).send({ answer:'回答1' })
    expect(a1.body.finished).toBe(false); expect(a1.body.nextQuestion).toBeTruthy()
    // turnIndex 1 → 1+1 >= 2,即便 AI 仍返回 nextQuestion,路由也必须强制结束并出报告
    const a2 = await request(app).post(`/api/interviews/${sid}/answer`).send({ answer:'回答2' })
    expect(a2.body.finished).toBe(true)
    expect(a2.body.report).toBeTruthy()
    expect(a2.body.report.overallScore).toBe(70)
  })
})
