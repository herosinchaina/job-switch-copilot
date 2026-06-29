import { DatabaseSync } from 'node:sqlite'
import { migrate } from './connection'
import { StructuredResumeSchema, JobDescriptionSchema, InterviewKitSchema, type StructuredResume, type Review, type JobDescription, type GapAnalysis, type InterviewKit } from '@aios/shared'

export function openDb(file: string): DatabaseSync {
  const db = new DatabaseSync(file); db.exec('PRAGMA foreign_keys = ON'); migrate(db); return db
}
export function createResume(db: DatabaseSync, r: { title:string; sourceFormat:string; rawText:string }): number {
  return Number(db.prepare('INSERT INTO resumes (title,source_format,raw_text) VALUES (?,?,?)')
    .run(r.title, r.sourceFormat, r.rawText).lastInsertRowid)
}
export function createVersion(db: DatabaseSync, v: { resumeId:number; kind:'original'|'optimized'; parentVersionId:number|null; structured:StructuredResume; status:'draft'|'confirmed' }): number {
  return Number(db.prepare('INSERT INTO resume_versions (resume_id,kind,parent_version_id,structured_json,status) VALUES (?,?,?,?,?)')
    .run(v.resumeId, v.kind, v.parentVersionId, JSON.stringify(v.structured), v.status).lastInsertRowid)
}
export function confirmVersion(db: DatabaseSync, versionId: number): void {
  db.prepare("UPDATE resume_versions SET status='confirmed' WHERE id=?").run(versionId)
}
export function getVersion(db: DatabaseSync, versionId: number) {
  const row = db.prepare('SELECT id,resume_id,kind,status,structured_json FROM resume_versions WHERE id=?').get(versionId) as any
  if (!row) return undefined
  return { id: row.id, resumeId: row.resume_id, kind: row.kind, status: row.status,
    structured: StructuredResumeSchema.parse(JSON.parse(row.structured_json)) }
}
export function createReview(db: DatabaseSync, versionId: number, rv: Review,
  opts?: { jobDescriptionId?: number | null; gap?: GapAnalysis | null }): number {
  return Number(db.prepare(
    'INSERT INTO reviews (resume_version_id,perspective,overall_score,dimension_scores_json,suggestions_json,job_description_id,gap_json) VALUES (?,?,?,?,?,?,?)')
    .run(versionId, rv.perspective, rv.overallScore, JSON.stringify(rv.dimensionScores), JSON.stringify(rv.suggestions),
      opts?.jobDescriptionId ?? null, opts?.gap ? JSON.stringify(opts.gap) : null).lastInsertRowid)
}
export function getReviewRow(db: DatabaseSync, id: number) {
  const row = db.prepare('SELECT job_description_id, gap_json FROM reviews WHERE id=?').get(id) as any
  return { jobDescriptionId: row.job_description_id ?? null,
    gap: row.gap_json ? JSON.parse(row.gap_json) as GapAnalysis : null }
}
export function createJd(db: DatabaseSync, j: { title:string; company?:string; rawText:string; structured:JobDescription }): number {
  return Number(db.prepare('INSERT INTO job_descriptions (title,company,raw_text,structured_json) VALUES (?,?,?,?)')
    .run(j.title, j.company ?? '', j.rawText, JSON.stringify(j.structured)).lastInsertRowid)
}
export function getJd(db: DatabaseSync, id: number) {
  const row = db.prepare('SELECT id,title,company,structured_json FROM job_descriptions WHERE id=?').get(id) as any
  if (!row) return undefined
  return { id: row.id, title: row.title, company: row.company,
    structured: JobDescriptionSchema.parse(JSON.parse(row.structured_json)) }
}
export function listJds(db: DatabaseSync) {
  return db.prepare('SELECT id,title,company,created_at as createdAt FROM job_descriptions ORDER BY id DESC').all() as
    { id:number; title:string; company:string; createdAt:string }[]
}
export function listResumes(db: DatabaseSync) {
  return db.prepare('SELECT id,title,created_at as createdAt FROM resumes ORDER BY id DESC').all() as {id:number;title:string;createdAt:string}[]
}
export function exportAll(db: DatabaseSync) {
  return { resumes: db.prepare('SELECT * FROM resumes').all(),
    versions: db.prepare('SELECT * FROM resume_versions').all(),
    reviews: db.prepare('SELECT * FROM reviews').all(),
    jobDescriptions: db.prepare('SELECT * FROM job_descriptions').all(),
    interviewKits: db.prepare('SELECT * FROM interview_kits').all() }
}
export function createKit(db: DatabaseSync, k: { resumeVersionId:number; jobDescriptionId:number|null; kit:InterviewKit }): number {
  return Number(db.prepare('INSERT INTO interview_kits (resume_version_id,job_description_id,kit_json) VALUES (?,?,?)')
    .run(k.resumeVersionId, k.jobDescriptionId, JSON.stringify(k.kit)).lastInsertRowid)
}
export function getKit(db: DatabaseSync, id: number) {
  const row = db.prepare('SELECT id,resume_version_id,job_description_id,kit_json FROM interview_kits WHERE id=?').get(id) as any
  if (!row) return undefined
  return { id: row.id, resumeVersionId: row.resume_version_id, jobDescriptionId: row.job_description_id ?? null,
    kit: InterviewKitSchema.parse(JSON.parse(row.kit_json)) }
}
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN')
  try { const r = fn(); db.exec('COMMIT'); return r }
  catch (e) { db.exec('ROLLBACK'); throw e }
}
