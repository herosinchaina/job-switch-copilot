import { describe, it, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb, createResume, createVersion, confirmVersion, getVersion, createReview, listResumes, transaction, createJd, getJd, listJds, getReviewRow } from './repo'
import { createKit, getKit } from './repo'
import { createSession, getSession, finishSession, createTurn, answerTurnRow, listTurns } from './repo'
import { seedProblems, listProblems, getProblem, setProgress, progressSummary,
  createGuideSession, getGuideSession, finishGuideSession, createGuideTurn, answerGuideTurn, listGuideTurns } from './repo'
import { createKnowledgeItem, importWeakItem, getKnowledgeItem, updateKnowledgeItem,
  deleteKnowledgeItem, listKnowledgeItems, listDueItems, reviewKnowledgeItem, listAllTags } from './repo'

let db: DatabaseSync
beforeEach(() => { db = openDb(':memory:') })
const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }

describe('repo', () => {
  it('round-trips a resume version and confirms it', () => {
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null, structured:sample, status:'draft' })
    expect(getVersion(db, vid)!.structured.basics.name).toBe('A')
    confirmVersion(db, vid)
    expect(getVersion(db, vid)!.status).toBe('confirmed')
  })
  it('stores a review and lists resumes', () => {
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null, structured:sample, status:'confirmed' })
    createReview(db, vid, { perspective:'hr', overallScore:80, dimensionScores:[], suggestions:[] })
    expect(listResumes(db).length).toBe(1)
  })
  it('transaction rolls back on throw', () => {
    expect(() => transaction(db, () => {
      createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
      throw new Error('boom')
    })).toThrow('boom')
    expect(listResumes(db).length).toBe(0)
  })
})

describe('jd repo', () => {
  it('round-trips a job description', () => {
    const db = openDb(':memory:')
    const jd = { role:'后端', company:'X', keywords:['Go'], responsibilities:[], requirements:{must:[],nice:[]} }
    const id = createJd(db, { title:'后端工程师', company:'X', rawText:'原文', structured: jd })
    expect(getJd(db, id)!.structured.role).toBe('后端')
    expect(listJds(db).length).toBe(1)
  })
  it('stores a review with jobDescriptionId and gap', () => {
    const db = openDb(':memory:')
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null, structured:sample, status:'confirmed' })
    const jdId = createJd(db, { title:'后端', company:'', rawText:'jd', structured:{role:'后端',company:'',keywords:[],responsibilities:[],requirements:{must:[],nice:[]}} })
    const gap = { matchScore:80, missingKeywords:['k8s'], weakRequirements:[], coveredHighlights:['Go'] }
    const reviewId = createReview(db, vid, { perspective:'hr', overallScore:80, dimensionScores:[], suggestions:[] }, { jobDescriptionId: jdId, gap })
    const row = getReviewRow(db, reviewId)
    expect(row.jobDescriptionId).toBe(jdId)
    expect(row.gap!.matchScore).toBe(80)
  })
  it('createReview without opts leaves jd/gap null (backward compat)', () => {
    const db = openDb(':memory:')
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null, structured:sample, status:'confirmed' })
    const reviewId = createReview(db, vid, { perspective:'hr', overallScore:70, dimensionScores:[], suggestions:[] })
    const row = getReviewRow(db, reviewId)
    expect(row.jobDescriptionId).toBeNull()
    expect(row.gap).toBeNull()
  })
})

describe('interview_kits repo', () => {
  const kit = { selfIntro:{ short:'a', standard:'b' },
    projectPitches:[{ projectName:'P', situation:'S', task:'T', action:'A', result:'R' }] }
  it('round-trips a kit with jd', () => {
    const db = openDb(':memory:')
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null, structured:sample, status:'confirmed' })
    const id = createKit(db, { resumeVersionId: vid, jobDescriptionId: null, kit })
    const got = getKit(db, id)!
    expect(got.kit.selfIntro.short).toBe('a')
    expect(got.jobDescriptionId).toBeNull()
  })
})

describe('interview repo', () => {
  function setup() {
    const db = openDb(':memory:')
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null, structured:sample, status:'confirmed' })
    return { db, vid }
  }
  it('round-trips a session + turns and computes is_weak', () => {
    const { db, vid } = setup()
    const sid = createSession(db, { resumeVersionId: vid, jobDescriptionId: null, cliSessionId: 'uuid-1', role:'后端', roundType:'tech', maxRounds:6 })
    const s = getSession(db, sid)!
    expect(s.status).toBe('active'); expect(s.cliSessionId).toBe('uuid-1'); expect(s.report).toBeNull()
    const t0 = createTurn(db, { sessionId: sid, turnIndex:0, question:'介绍项目' })
    answerTurnRow(db, t0, { answer:'我做了X', score:50, feedback:{ score:50, highlights:[], gaps:['浅'], better:'深入' } })
    const turns = listTurns(db, sid)
    expect(turns[0].answer).toBe('我做了X'); expect(turns[0].isWeak).toBe(true)  // 50 < 60
  })
  it('finishSession writes report and flips status', () => {
    const { db, vid } = setup()
    const sid = createSession(db, { resumeVersionId: vid, jobDescriptionId: null, cliSessionId: null, role:'后端', roundType:'hr', maxRounds:6 })
    const report = { overallScore:70, dimensions:[], bestTurn:null, worstTurn:null, weaknesses:[], nextSteps:[] }
    finishSession(db, sid, report)
    const s = getSession(db, sid)!
    expect(s.status).toBe('finished'); expect(s.report!.overallScore).toBe(70)
  })
})

describe('leetcode repo', () => {
  it('seeds 100 problems idempotently', () => {
    const db = openDb(':memory:')
    seedProblems(db); seedProblems(db)               // 跑两次
    expect(listProblems(db).length).toBe(100)
    expect(getProblem(db, 1)!.title).toBe('两数之和')
    expect(getProblem(db, 1)!.status).toBe('new')    // 无进度记录默认 new
  })
  it('sets progress and summarizes', () => {
    const db = openDb(':memory:'); seedProblems(db)
    setProgress(db, 1, 'mastered'); setProgress(db, 1, 'mastered')  // UPSERT
    expect(getProblem(db, 1)!.status).toBe('mastered')
    const s = progressSummary(db)
    expect(s.total).toBe(100); expect(s.mastered).toBe(1)
    expect(s.byTopic.find(t => t.topic === '哈希')!.total).toBeGreaterThan(0)
  })
  it('round-trips a guide session + turns', () => {
    const db = openDb(':memory:'); seedProblems(db)
    const sid = createGuideSession(db, { leetcodeId:1, cliSessionId:'uuid-1' })
    expect(getGuideSession(db, sid)!.status).toBe('active')
    const t = createGuideTurn(db, { sessionId:sid, turnIndex:0, question:'考点是什么?' })
    answerGuideTurn(db, t, '哈希查找')
    expect(listGuideTurns(db, sid)[0].answer).toBe('哈希查找')
    finishGuideSession(db, sid)
    expect(getGuideSession(db, sid)!.status).toBe('finished')
  })
})

import { createDeepdiveSession, getDeepdiveSession, finishDeepdiveSession,
  createDeepdiveTurn, answerDeepdiveTurn, listDeepdiveTurns, listDeepdiveSessions } from './repo'

describe('deepdive repo', () => {
  function setup() {
    const db = openDb(':memory:')
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],
      projects:[{name:'体验生判',role:'负责人',period:'',stack:['LLM'],bullets:['RAG 召回'],metrics:[]}], skills:[],awards:[] }
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null, structured:sample, status:'confirmed' })
    return { db, vid }
  }
  const fb = { scores:{techDepth:5,implementationClarity:5,architectureAwareness:5,metricsAwareness:5,expression:5},
    total:25, strengths:[], vague:['浅'], missingDetails:[], followUps:[], betterAnswer:'深入' }
  it('round-trips a session + turns and computes is_weak', () => {
    const { db, vid } = setup()
    const sid = createDeepdiveSession(db, { resumeVersionId:vid, projectName:'体验生判', cliSessionId:'uuid', maxRounds:8 })
    expect(getDeepdiveSession(db, sid)!.projectName).toBe('体验生判')
    const t = createDeepdiveTurn(db, { sessionId:sid, turnIndex:0, question:'RAG 怎么召回?' })
    answerDeepdiveTurn(db, t, { answer:'嗯就召回', score:25, feedback:fb })
    expect(listDeepdiveTurns(db, sid)[0].isWeak).toBe(true) // 25 < 30
  })
  it('finishDeepdiveSession writes map + flips status; listDeepdiveSessions lists it', () => {
    const { db, vid } = setup()
    const sid = createDeepdiveSession(db, { resumeVersionId:vid, projectName:'体验生判', cliSessionId:null, maxRounds:8 })
    const map = { projectName:'体验生判', background:'b', businessGoal:'g', techApproach:'t', personalContribution:'c',
      coreChallenges:[], alternatives:[], evaluation:'e', risks:[], optimizations:[], hotQuestions:[], blindSpots:['阈值'] }
    finishDeepdiveSession(db, sid, map)
    expect(getDeepdiveSession(db, sid)!.status).toBe('finished')
    expect(getDeepdiveSession(db, sid)!.map!.blindSpots[0]).toBe('阈值')
    expect(listDeepdiveSessions(db).length).toBe(1)
  })
})

describe('knowledge repo', () => {
  it('create → get round-trip, tags preserved', () => {
    const db = openDb(':memory:')
    const id = createKnowledgeItem(db, { question:'Q', answer:'a', reference:'r', tags:['ai','rag'], note:null, source:'manual', sourceRef:null })
    const item = getKnowledgeItem(db, id)!
    expect(item.question).toBe('Q'); expect(item.tags).toEqual(['ai','rag'])
    expect(item.source).toBe('manual'); expect(item.mastery).toBe(0)
  })
  it('importWeakItem dedupes by (source, source_ref)', () => {
    const db = openDb(':memory:')
    const a = importWeakItem(db, { source:'interview', sourceRef:'42', question:'Q', answer:'a', reference:'ref' })
    const b = importWeakItem(db, { source:'interview', sourceRef:'42', question:'Q', answer:'a', reference:'ref' })
    expect(a).not.toBeNull(); expect(b).toBeNull()
    expect(listKnowledgeItems(db, {}).length).toBe(1)
  })
  it('filters by source/tag/mastery and q (LIKE)', () => {
    const db = openDb(':memory:')
    createKnowledgeItem(db, { question:'RAG 召回', answer:null, reference:null, tags:['ai'], note:null, source:'manual', sourceRef:null })
    createKnowledgeItem(db, { question:'排序算法', answer:null, reference:null, tags:['algo'], note:null, source:'manual', sourceRef:null })
    expect(listKnowledgeItems(db, { tag:'ai' }).length).toBe(1)
    expect(listKnowledgeItems(db, { q:'召回' }).length).toBe(1)
  })
  it('tag filter does not match substrings (ai must not match air)', () => {
    const db = openDb(':memory:')
    createKnowledgeItem(db, { question:'Q1', answer:null, reference:null, tags:['air'], note:null, source:'manual', sourceRef:null })
    expect(listKnowledgeItems(db, { tag:'ai' }).length).toBe(0)
  })
  it('listDueItems: due=today matches, due=tomorrow does not', () => {
    const db = openDb(':memory:')
    const id = createKnowledgeItem(db, { question:'Q', answer:null, reference:null, tags:[], note:null, source:'manual', sourceRef:null })
    expect(listDueItems(db).map(i=>i.id)).toContain(id)   // 新建即今天到期
    reviewKnowledgeItem(db, id, 'remembered')              // due 推到未来
    expect(listDueItems(db).map(i=>i.id)).not.toContain(id)
  })
  it('reviewKnowledgeItem: remembered advances, forgot resets', () => {
    const db = openDb(':memory:')
    const id = createKnowledgeItem(db, { question:'Q', answer:null, reference:null, tags:[], note:null, source:'manual', sourceRef:null })
    let it = reviewKnowledgeItem(db, id, 'remembered')
    expect(it.reviewCount).toBe(1); expect(it.reviewInterval).toBe(2); expect(it.mastery).toBe(1)
    it = reviewKnowledgeItem(db, id, 'forgot')
    expect(it.reviewCount).toBe(0); expect(it.reviewInterval).toBe(1); expect(it.mastery).toBe(0)
  })
  it('update leaves review fields untouched; delete removes; listAllTags dedupes', () => {
    const db = openDb(':memory:')
    const id = createKnowledgeItem(db, { question:'Q', answer:null, reference:null, tags:['ai'], note:null, source:'manual', sourceRef:null })
    reviewKnowledgeItem(db, id, 'remembered')
    updateKnowledgeItem(db, id, { question:'Q2', answer:'a', reference:null, tags:['ai','x'], note:'n' })
    const it = getKnowledgeItem(db, id)!
    expect(it.question).toBe('Q2'); expect(it.reviewCount).toBe(1)  // 复习字段不被 update 重置
    expect(listAllTags(db).sort()).toEqual(['ai','x'])
    deleteKnowledgeItem(db, id)
    expect(getKnowledgeItem(db, id)).toBeUndefined()
  })
})
