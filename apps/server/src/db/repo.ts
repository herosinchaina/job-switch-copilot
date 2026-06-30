import { DatabaseSync } from 'node:sqlite'
import { migrate } from './connection'
import { StructuredResumeSchema, JobDescriptionSchema, InterviewKitSchema, InterviewReportSchema, TurnFeedbackSchema, type StructuredResume, type Review, type JobDescription, type GapAnalysis, type InterviewKit, type InterviewReport, type TurnFeedback, type RoundType } from '@aios/shared'

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
    interviewKits: db.prepare('SELECT * FROM interview_kits').all(),
    interviewSessions: db.prepare('SELECT * FROM interview_sessions').all(),
    interviewTurns: db.prepare('SELECT * FROM interview_turns').all() }
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
export function createSession(db: DatabaseSync, s: { resumeVersionId:number; jobDescriptionId:number|null; cliSessionId:string|null; role:string; roundType:RoundType; maxRounds:number }): number {
  return Number(db.prepare('INSERT INTO interview_sessions (resume_version_id,job_description_id,cli_session_id,role,round_type,max_rounds) VALUES (?,?,?,?,?,?)')
    .run(s.resumeVersionId, s.jobDescriptionId, s.cliSessionId, s.role, s.roundType, s.maxRounds).lastInsertRowid)
}
export function getSession(db: DatabaseSync, id: number) {
  const row = db.prepare('SELECT * FROM interview_sessions WHERE id=?').get(id) as any
  if (!row) return undefined
  return { id: row.id, resumeVersionId: row.resume_version_id, jobDescriptionId: row.job_description_id ?? null,
    cliSessionId: row.cli_session_id ?? null, role: row.role, roundType: row.round_type as RoundType,
    maxRounds: row.max_rounds, status: row.status as 'active'|'finished',
    report: row.report_json ? InterviewReportSchema.parse(JSON.parse(row.report_json)) : null }
}
export function finishSession(db: DatabaseSync, id: number, report: InterviewReport): void {
  db.prepare("UPDATE interview_sessions SET status='finished', report_json=? WHERE id=?").run(JSON.stringify(report), id)
}
export function createTurn(db: DatabaseSync, t: { sessionId:number; turnIndex:number; question:string }): number {
  return Number(db.prepare('INSERT INTO interview_turns (session_id,turn_index,question) VALUES (?,?,?)')
    .run(t.sessionId, t.turnIndex, t.question).lastInsertRowid)
}
export function answerTurnRow(db: DatabaseSync, turnId: number, a: { answer:string; score:number; feedback:TurnFeedback }): void {
  db.prepare('UPDATE interview_turns SET answer=?, score=?, feedback_json=?, is_weak=? WHERE id=?')
    .run(a.answer, a.score, JSON.stringify(a.feedback), a.score < 60 ? 1 : 0, turnId)
}
export function listTurns(db: DatabaseSync, sessionId: number) {
  const rows = db.prepare('SELECT * FROM interview_turns WHERE session_id=? ORDER BY turn_index').all(sessionId) as any[]
  return rows.map(r => ({ id: r.id, turnIndex: r.turn_index, question: r.question, answer: r.answer ?? null,
    score: r.score ?? null, feedback: r.feedback_json ? TurnFeedbackSchema.parse(JSON.parse(r.feedback_json)) : null,
    isWeak: !!r.is_weak }))
}
export function listSessions(db: DatabaseSync) {
  const rows = db.prepare('SELECT id,role,round_type,status,report_json,created_at FROM interview_sessions ORDER BY id DESC').all() as any[]
  return rows.map(r => ({ id: r.id, role: r.role, roundType: r.round_type as RoundType,
    status: r.status as 'active'|'finished',
    overallScore: r.report_json ? (InterviewReportSchema.parse(JSON.parse(r.report_json)).overallScore) : null,
    createdAt: r.created_at as string }))
}
