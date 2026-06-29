import { describe, it, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb, createResume, createVersion, confirmVersion, getVersion, createReview, listResumes, transaction, createJd, getJd, listJds, getReviewRow } from './repo'
import { createKit, getKit } from './repo'

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
