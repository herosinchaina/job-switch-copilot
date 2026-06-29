import { describe, it, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb, createResume, createVersion, confirmVersion, getVersion, createReview, listResumes, transaction } from './repo'

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
