import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb, createJd } from '../db/repo'
import { createResume, createVersion, createSession, createTurn, answerTurnRow } from '../db/repo'
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
  it('clamps maxRounds to 12 when caller passes an out-of-range value', async () => {
    const db = openDb(':memory:'); const app = createApp(db, interviewAi())
    const vid = await confirmedVersion(app)
    const start = await request(app).post('/api/interviews').send({ versionId: vid, roundType:'tech', maxRounds:1000 })
    expect(start.status).toBe(200)
    const got = await request(app).get(`/api/interviews/${start.body.sessionId}`)
    expect(got.body.session.maxRounds).toBe(12)
  })
  it('lists past interview sessions with summary fields', async () => {
    const db = openDb(':memory:'); const app = createApp(db, interviewAi())
    const vid = await confirmedVersion(app)
    const start = await request(app).post('/api/interviews').send({ versionId: vid, roundType:'tech', maxRounds:6 })
    await request(app).post(`/api/interviews/${start.body.sessionId}/answer`).send({ answer:'a1' })
    await request(app).post(`/api/interviews/${start.body.sessionId}/answer`).send({ answer:'a2' })
    const list = await request(app).get('/api/interviews')
    expect(list.status).toBe(200)
    expect(list.body.length).toBe(1)
    expect(list.body[0]).toMatchObject({ id: start.body.sessionId, roundType: 'tech', status: 'finished', overallScore: 70 })
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

// 引导用会话感知 fake(复用现有 import:request/openDb/createApp/AiProvider)
function lcAi() {
  const firstG = '这题考点是什么?先想想。'
  const step = JSON.stringify({ guidance:'不错,继续想优化', done:false })
  const stepDone = JSON.stringify({ guidance:'你已经掌握了,真棒', done:true })
  let n = 0
  const handle = (prompt: string) => {
    if (prompt.includes('开始引导我学这道题')) return firstG
    n++; return n >= 2 ? stepDone : step
  }
  return {
    async complete(o:any){ return handle(o.prompt) },
    async *stream(o:any){ yield this.complete(o) },
    startSession(){ return 'g-sess' },
    async continueSession(_s:string, o:any){ return handle(o.prompt) },
  } as any
}

describe('leetcode routes', () => {
  it('lists seeded problems and summary', async () => {
    const db = openDb(':memory:'); const app = createApp(db, lcAi())
    const list = await request(app).get('/api/lc/problems')
    expect(list.status).toBe(200); expect(list.body.length).toBe(100)
    expect(list.body[0].status).toBe('new')
    const sum = await request(app).get('/api/lc/summary')
    expect(sum.body.total).toBe(100)
  })
  it('sets progress (400 on bad status, 404 unknown id)', async () => {
    const db = openDb(':memory:'); const app = createApp(db, lcAi())
    expect((await request(app).put('/api/lc/problems/1/progress').send({ status:'mastered' })).status).toBe(200)
    expect((await request(app).put('/api/lc/problems/1/progress').send({ status:'wat' })).status).toBe(400)
    expect((await request(app).put('/api/lc/problems/99999/progress').send({ status:'mastered' })).status).toBe(404)
    expect((await request(app).get('/api/lc/summary')).body.mastered).toBe(1)
  })
  it('runs a guide session to done', async () => {
    const db = openDb(':memory:'); const app = createApp(db, lcAi())
    const start = await request(app).post('/api/lc/guides').send({ leetcodeId:1 })
    expect(start.status).toBe(200); expect(start.body.guidance).toBeTruthy()
    const sid = start.body.sessionId
    const s1 = await request(app).post(`/api/lc/guides/${sid}/step`).send({ answer:'用哈希表' })
    expect(s1.body.done).toBe(false)
    const s2 = await request(app).post(`/api/lc/guides/${sid}/step`).send({ answer:'存补数,O(n)' })
    expect(s2.body.done).toBe(true)
    const got = await request(app).get(`/api/lc/guides/${sid}`)
    expect(got.body.session.status).toBe('finished')
  })
  it('404 guide on unknown problem', async () => {
    const db = openDb(':memory:'); const app = createApp(db, lcAi())
    expect((await request(app).post('/api/lc/guides').send({ leetcodeId:99999 })).status).toBe(404)
  })
})

// 会话感知 fake:parse / 首问 / step / map 按 system|prompt 分辨
function deepdiveAi() {
  const parsed = JSON.stringify({ basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],
    projects:[{name:'体验生判',role:'负责人',period:'',stack:['RAG'],bullets:['LLM 打分'],metrics:[]}], skills:[],awards:[] })
  const firstQ = '你提到 LLM 打分,Prompt 如何设计?'
  const stepGo = JSON.stringify({ feedback:{ scores:{techDepth:6,implementationClarity:6,architectureAwareness:6,metricsAwareness:6,expression:6}, total:30, strengths:[], vague:[], missingDetails:[], followUps:[], betterAnswer:'' }, nextQuestion:'召回排序?' })
  const stepEnd = JSON.stringify({ feedback:{ scores:{techDepth:5,implementationClarity:5,architectureAwareness:5,metricsAwareness:5,expression:5}, total:25, strengths:[], vague:['浅'], missingDetails:[], followUps:[], betterAnswer:'应…' }, nextQuestion:null })
  const map = JSON.stringify({ projectName:'体验生判', background:'b', businessGoal:'g', techApproach:'t', personalContribution:'c', coreChallenges:[], alternatives:[], evaluation:'e', risks:[], optimizations:[], hotQuestions:[], blindSpots:['阈值'] })
  let answers = 0
  const handle = (system: string, prompt: string) => {
    if (system.includes('简历解析器')) return parsed
    if (prompt.includes('生成该项目的知识地图')) return map
    if (prompt.includes('提出关于该项目的第一个深挖问题')) return firstQ
    if (prompt.includes('请评分并决定下一步追问')) { answers++; return answers >= 2 ? stepEnd : stepGo }
    return firstQ
  }
  return { async complete(o:any){ return handle(o.system ?? '', o.prompt) }, async *stream(o:any){ yield this.complete(o) },
    startSession(){ return 'dd' }, async continueSession(_s:string, o:any){ return handle(o.system ?? '', o.prompt) } } as any
}

describe('deepdive routes', () => {
  async function confirmed(app:any) {
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    await request(app).post(`/api/resumes/versions/${up.body.versionId}/confirm`)
    return up.body.versionId
  }
  it('rejects start before confirm (409) and unknown project (400)', async () => {
    const db = openDb(':memory:'); const app = createApp(db, deepdiveAi())
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    expect((await request(app).post('/api/deepdives').send({ versionId: up.body.versionId, projectName:'体验生判' })).status).toBe(409)
    const vid = await confirmed(app)
    expect((await request(app).post('/api/deepdives').send({ versionId: vid, projectName:'不存在的项目' })).status).toBe(400)
  })
  it('runs a deepdive to a knowledge map', async () => {
    const db = openDb(':memory:'); const app = createApp(db, deepdiveAi())
    const vid = await confirmed(app)
    const start = await request(app).post('/api/deepdives').send({ versionId: vid, projectName:'体验生判', maxRounds:8 })
    expect(start.status).toBe(200); expect(start.body.question).toBeTruthy()
    const sid = start.body.sessionId
    const a1 = await request(app).post(`/api/deepdives/${sid}/answer`).send({ answer:'用哈希' })
    expect(a1.body.finished).toBe(false); expect(a1.body.feedback.total).toBe(30)
    const a2 = await request(app).post(`/api/deepdives/${sid}/answer`).send({ answer:'不清楚' })
    expect(a2.body.finished).toBe(true); expect(a2.body.map.blindSpots).toContain('阈值')
    const got = await request(app).get(`/api/deepdives/${sid}`)
    expect(got.body.session.status).toBe('finished')
    expect((await request(app).get('/api/deepdives')).body.length).toBe(1)
  })
})

describe('knowledge routes', () => {
  it('CRUD + review + due + tags', async () => {
    const db = openDb(':memory:'); const app = createApp(db, {} as any)
    // create
    const c = await request(app).post('/api/knowledge').send({ question:'RAG 召回?', tags:['ai'] })
    expect(c.status).toBe(200); const id = c.body.id
    expect(c.body.source).toBe('manual')
    // list + filter
    expect((await request(app).get('/api/knowledge?tag=ai')).body.length).toBe(1)
    expect((await request(app).get('/api/knowledge?q=召回')).body.length).toBe(1)
    // tags 不被 :id 吞
    expect((await request(app).get('/api/knowledge/tags')).body).toContain('ai')
    // due:新建即今天到期
    expect((await request(app).get('/api/knowledge/due')).body.map((x:any)=>x.id)).toContain(id)
    // review remembered → 移出今日到期
    const rv = await request(app).post(`/api/knowledge/${id}/review`).send({ grade:'remembered' })
    expect(rv.body.reviewCount).toBe(1)
    expect((await request(app).get('/api/knowledge/due')).body.map((x:any)=>x.id)).not.toContain(id)
    // update
    await request(app).put(`/api/knowledge/${id}`).send({ question:'RAG 召回优化?', tags:['ai','rag'] })
    expect((await request(app).get(`/api/knowledge/${id}`)).body.question).toBe('RAG 召回优化?')
    // 404s
    expect((await request(app).get('/api/knowledge/9999')).status).toBe(404)
    // delete
    expect((await request(app).delete(`/api/knowledge/${id}`)).body.ok).toBe(true)
    expect((await request(app).get(`/api/knowledge/${id}`)).status).toBe(404)
  })
  it('rejects invalid input with 400 (empty question, bad grade)', async () => {
    const db = openDb(':memory:'); const app = createApp(db, {} as any)
    expect((await request(app).post('/api/knowledge').send({ question:'' })).status).toBe(400)
    const c = await request(app).post('/api/knowledge').send({ question:'Q' })
    expect((await request(app).post(`/api/knowledge/${c.body.id}/review`).send({ grade:'wat' })).status).toBe(400)
  })
  it('ignores a non-numeric mastery filter instead of returning empty', async () => {
    const db = openDb(':memory:'); const app = createApp(db, {} as any)
    await request(app).post('/api/knowledge').send({ question:'Q1' })
    await request(app).post('/api/knowledge').send({ question:'Q2' })
    // mastery=abc → NaN;应被忽略,返回全部,而非拼进 SQL 恒空
    expect((await request(app).get('/api/knowledge?mastery=abc')).body.length).toBe(2)
    // mastery=0 → 有效过滤(新建条目 mastery 都为 0)
    expect((await request(app).get('/api/knowledge?mastery=0')).body.length).toBe(2)
  })
  it('rejects import with a bad sessionId (400, not a silent empty result)', async () => {
    const db = openDb(':memory:'); const app = createApp(db, {} as any)
    expect((await request(app).post('/api/knowledge/import').send({ from:'interview', sessionId:'abc' })).status).toBe(400)
  })
  it('imports is_weak turns from an interview session with dedupe', async () => {
    const db = openDb(':memory:'); const app = createApp(db, {} as any)
    // 直接用 repo 造一个含 is_weak turn 的 interview session
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null,
      structured:{ basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }, status:'confirmed' })
    const sid = createSession(db, { resumeVersionId:vid, jobDescriptionId:null, cliSessionId:null, role:'x', roundType:'tech', maxRounds:6 })
    const t = createTurn(db, { sessionId:sid, turnIndex:0, question:'弱题?' })
    answerTurnRow(db, t, { answer:'不会', score:20, feedback:{ score:20, highlights:[], gaps:['浅'], better:'应当…' } })
    const imp = await request(app).post('/api/knowledge/import').send({ from:'interview', sessionId:sid })
    expect(imp.body).toEqual({ imported:1, skipped:0 })
    const again = await request(app).post('/api/knowledge/import').send({ from:'interview', sessionId:sid })
    expect(again.body).toEqual({ imported:0, skipped:1 })  // 去重
  })
})
