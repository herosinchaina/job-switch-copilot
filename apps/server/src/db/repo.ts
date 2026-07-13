import { DatabaseSync } from 'node:sqlite'
import { migrate } from './connection'
import { StructuredResumeSchema, JobDescriptionSchema, InterviewKitSchema, InterviewReportSchema, TurnFeedbackSchema, ProjectMapSchema, DeepdiveFeedbackSchema, KnowledgeItemSchema, type StructuredResume, type Review, type JobDescription, type GapAnalysis, type InterviewKit, type InterviewReport, type TurnFeedback, type RoundType, type LcProblem, type ProgressStatus, type ProjectMap, type DeepdiveFeedback, type KnowledgeItem, type KnowledgeItemInput, type KnowledgeSource, type ReviewGrade, type KnowledgeAttempt, type KnowledgeAttemptFeedback } from '@aios/shared'
export { seedProblems } from './seed'

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
// ── 应用级设置(当前活跃简历版本等单例状态)──────────────
export function getSetting(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get(key) as any
  return row ? (row.value as string) : null
}
export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(`INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`).run(key, value)
}
// 当前活跃简历版本:返回该版本(不存在或已删则 null,并顺带清除失效标记)
export function getActiveVersion(db: DatabaseSync) {
  const v = getSetting(db, 'active_version_id')
  if (!v) return null
  const version = getVersion(db, Number(v))
  if (!version) { db.prepare("DELETE FROM app_settings WHERE key='active_version_id'").run(); return null }
  return version
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
    interviewTurns: db.prepare('SELECT * FROM interview_turns').all(),
    lcProgress: db.prepare('SELECT * FROM lc_progress').all(),
    lcGuideSessions: db.prepare('SELECT * FROM lc_guide_sessions').all(),
    lcGuideTurns: db.prepare('SELECT * FROM lc_guide_turns').all(),
    deepdiveSessions: db.prepare('SELECT * FROM project_deepdive_sessions').all(),
    deepdiveTurns: db.prepare('SELECT * FROM project_deepdive_turns').all(),
    knowledgeItems: db.prepare('SELECT * FROM knowledge_items').all(),
    knowledgeAttempts: db.prepare('SELECT * FROM knowledge_attempts').all() }
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

type ProblemWithStatus = LcProblem & { status: ProgressStatus }
function rowToProblem(r: any): ProblemWithStatus {
  return { leetcodeId: r.leetcode_id, title: r.title, difficulty: r.difficulty, topic: r.topic,
    keyIdea: r.key_idea, url: r.url, status: (r.status ?? 'new') as ProgressStatus }
}
export function listProblems(db: DatabaseSync): ProblemWithStatus[] {
  const rows = db.prepare(`SELECT p.*, pr.status FROM lc_problems p
    LEFT JOIN lc_progress pr ON pr.leetcode_id = p.leetcode_id ORDER BY p.leetcode_id`).all() as any[]
  return rows.map(rowToProblem)
}
export function getProblem(db: DatabaseSync, leetcodeId: number): ProblemWithStatus | undefined {
  const r = db.prepare(`SELECT p.*, pr.status FROM lc_problems p
    LEFT JOIN lc_progress pr ON pr.leetcode_id = p.leetcode_id WHERE p.leetcode_id=?`).get(leetcodeId) as any
  return r ? rowToProblem(r) : undefined
}
export function setProgress(db: DatabaseSync, leetcodeId: number, status: ProgressStatus): void {
  db.prepare(`INSERT INTO lc_progress (leetcode_id,status,updated_at) VALUES (?,?,datetime('now'))
    ON CONFLICT(leetcode_id) DO UPDATE SET status=excluded.status, updated_at=datetime('now')`).run(leetcodeId, status)
}
export function progressSummary(db: DatabaseSync) {
  const total = (db.prepare('SELECT COUNT(*) c FROM lc_problems').get() as any).c
  const mastered = (db.prepare("SELECT COUNT(*) c FROM lc_progress WHERE status='mastered'").get() as any).c
  const learning = (db.prepare("SELECT COUNT(*) c FROM lc_progress WHERE status='learning'").get() as any).c
  const byTopic = db.prepare(`SELECT p.topic,
      COUNT(*) total,
      SUM(CASE WHEN pr.status='mastered' THEN 1 ELSE 0 END) mastered
    FROM lc_problems p LEFT JOIN lc_progress pr ON pr.leetcode_id=p.leetcode_id
    GROUP BY p.topic`).all() as any[]
  return { total, mastered, learning, byTopic: byTopic.map(t => ({ topic: t.topic, total: t.total, mastered: Number(t.mastered) })) }
}
export function createGuideSession(db: DatabaseSync, s: { leetcodeId:number; cliSessionId:string|null }): number {
  return Number(db.prepare('INSERT INTO lc_guide_sessions (leetcode_id,cli_session_id) VALUES (?,?)')
    .run(s.leetcodeId, s.cliSessionId).lastInsertRowid)
}
export function getGuideSession(db: DatabaseSync, id: number) {
  const r = db.prepare('SELECT * FROM lc_guide_sessions WHERE id=?').get(id) as any
  if (!r) return undefined
  return { id: r.id, leetcodeId: r.leetcode_id, cliSessionId: r.cli_session_id ?? null, status: r.status as 'active'|'finished' }
}
export function finishGuideSession(db: DatabaseSync, id: number): void {
  db.prepare("UPDATE lc_guide_sessions SET status='finished' WHERE id=?").run(id)
}
export function createGuideTurn(db: DatabaseSync, t: { sessionId:number; turnIndex:number; question:string }): number {
  return Number(db.prepare('INSERT INTO lc_guide_turns (session_id,turn_index,question) VALUES (?,?,?)')
    .run(t.sessionId, t.turnIndex, t.question).lastInsertRowid)
}
export function answerGuideTurn(db: DatabaseSync, turnId: number, answer: string): void {
  db.prepare('UPDATE lc_guide_turns SET answer=? WHERE id=?').run(answer, turnId)
}
export function listGuideTurns(db: DatabaseSync, sessionId: number) {
  const rows = db.prepare('SELECT * FROM lc_guide_turns WHERE session_id=? ORDER BY turn_index').all(sessionId) as any[]
  return rows.map(r => ({ id: r.id, turnIndex: r.turn_index, question: r.question, answer: r.answer ?? null }))
}

export function createDeepdiveSession(db: DatabaseSync, s: { resumeVersionId:number; projectName:string; cliSessionId:string|null; maxRounds:number }): number {
  return Number(db.prepare('INSERT INTO project_deepdive_sessions (resume_version_id,project_name,cli_session_id,max_rounds) VALUES (?,?,?,?)')
    .run(s.resumeVersionId, s.projectName, s.cliSessionId, s.maxRounds).lastInsertRowid)
}
export function getDeepdiveSession(db: DatabaseSync, id: number) {
  const r = db.prepare('SELECT * FROM project_deepdive_sessions WHERE id=?').get(id) as any
  if (!r) return undefined
  return { id: r.id, resumeVersionId: r.resume_version_id, projectName: r.project_name,
    cliSessionId: r.cli_session_id ?? null, maxRounds: r.max_rounds, status: r.status as 'active'|'finished',
    map: r.map_json ? ProjectMapSchema.parse(JSON.parse(r.map_json)) : null }
}
export function finishDeepdiveSession(db: DatabaseSync, id: number, map: ProjectMap): void {
  db.prepare("UPDATE project_deepdive_sessions SET status='finished', map_json=? WHERE id=?").run(JSON.stringify(map), id)
}
export function createDeepdiveTurn(db: DatabaseSync, t: { sessionId:number; turnIndex:number; question:string }): number {
  return Number(db.prepare('INSERT INTO project_deepdive_turns (session_id,turn_index,question) VALUES (?,?,?)')
    .run(t.sessionId, t.turnIndex, t.question).lastInsertRowid)
}
export function answerDeepdiveTurn(db: DatabaseSync, turnId: number, a: { answer:string; score:number; feedback:DeepdiveFeedback }): void {
  db.prepare('UPDATE project_deepdive_turns SET answer=?, score=?, feedback_json=?, is_weak=? WHERE id=?')
    .run(a.answer, a.score, JSON.stringify(a.feedback), a.score < 30 ? 1 : 0, turnId)
}
export function listDeepdiveTurns(db: DatabaseSync, sessionId: number) {
  const rows = db.prepare('SELECT * FROM project_deepdive_turns WHERE session_id=? ORDER BY turn_index').all(sessionId) as any[]
  return rows.map(r => ({ id: r.id, turnIndex: r.turn_index, question: r.question, answer: r.answer ?? null,
    score: r.score ?? null, feedback: r.feedback_json ? DeepdiveFeedbackSchema.parse(JSON.parse(r.feedback_json)) : null,
    isWeak: !!r.is_weak }))
}
export function listDeepdiveSessions(db: DatabaseSync) {
  const rows = db.prepare('SELECT id,project_name,status,created_at FROM project_deepdive_sessions ORDER BY id DESC').all() as any[]
  return rows.map(r => {
    const scored = db.prepare('SELECT score FROM project_deepdive_turns WHERE session_id=? AND score IS NOT NULL').all(r.id) as any[]
    // 各轮总分(每轮 0-50)的平均;未评分则 null。
    const avgScore = scored.length ? Math.round(scored.reduce((s, x) => s + x.score, 0) / scored.length) : null
    return { id: r.id, projectName: r.project_name, status: r.status as 'active'|'finished', avgScore, createdAt: r.created_at as string }
  })
}

// ── 知识库(模块三) ──────────────────────────────────────────
const INTERVALS = [1, 2, 4, 7, 15, 30]

function rowToKnowledgeItem(r: any): KnowledgeItem {
  return KnowledgeItemSchema.parse({
    id: r.id, question: r.question, answer: r.answer ?? null, reference: r.reference ?? null,
    tags: JSON.parse(r.tags ?? '[]'), source: r.source, sourceRef: r.source_ref ?? null,
    note: r.note ?? null, mastery: r.mastery, reviewDue: r.review_due,
    reviewInterval: r.review_interval, reviewCount: r.review_count,
    createdAt: r.created_at, updatedAt: r.updated_at,
    conqueredAt: r.conquered_at ?? null,
  })
}

export function createKnowledgeItem(db: DatabaseSync, input: KnowledgeItemInput & { source: KnowledgeSource; sourceRef: string | null }): number {
  return Number(db.prepare(`INSERT INTO knowledge_items
    (question,answer,reference,tags,source,source_ref,note,review_due,review_interval,review_count)
    VALUES (?,?,?,?,?,?,?, date('now','localtime'), 0, 0)`)
    .run(input.question, input.answer, input.reference, JSON.stringify(input.tags ?? []),
      input.source, input.sourceRef, input.note).lastInsertRowid)
}

export function importWeakItem(db: DatabaseSync, w: { source: KnowledgeSource; sourceRef: string; question: string; answer: string | null; reference: string | null; tags?: string[] }): number | null {
  const res = db.prepare(`INSERT OR IGNORE INTO knowledge_items
    (question,answer,reference,tags,source,source_ref,note,review_due,review_interval,review_count)
    VALUES (?,?,?, ?, ?,?, NULL, date('now','localtime'), 0, 0)`)
    .run(w.question, w.answer, w.reference, JSON.stringify(w.tags ?? []), w.source, w.sourceRef)
  return res.changes ? Number(res.lastInsertRowid) : null
}

export function getKnowledgeItem(db: DatabaseSync, id: number): KnowledgeItem | undefined {
  const r = db.prepare('SELECT * FROM knowledge_items WHERE id=?').get(id) as any
  return r ? rowToKnowledgeItem(r) : undefined
}

export function updateKnowledgeItem(db: DatabaseSync, id: number, input: KnowledgeItemInput): void {
  db.prepare(`UPDATE knowledge_items SET question=?, answer=?, reference=?, tags=?, note=?, updated_at=datetime('now') WHERE id=?`)
    .run(input.question, input.answer, input.reference, JSON.stringify(input.tags ?? []), input.note, id)
}

export function deleteKnowledgeItem(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM knowledge_items WHERE id=?').run(id)
}

export function listKnowledgeItems(db: DatabaseSync, f: { source?: string; tag?: string; mastery?: number; q?: string }): KnowledgeItem[] {
  const where: string[] = []; const params: any[] = []
  if (f.source) { where.push('source=?'); params.push(f.source) }
  if (typeof f.mastery === 'number') { where.push('mastery=?'); params.push(f.mastery) }
  if (f.q) { where.push('(question LIKE ? OR answer LIKE ? OR reference LIKE ? OR note LIKE ?)')
    const like = `%${f.q}%`; params.push(like, like, like, like) }
  // tags 存为 JSON 数组;用带引号的完整标签匹配(%"ai"% 不会误中 "air")
  if (f.tag) { where.push('tags LIKE ?'); params.push(`%${JSON.stringify(f.tag)}%`) }
  const sql = `SELECT * FROM knowledge_items ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC`
  return (db.prepare(sql).all(...params) as any[]).map(rowToKnowledgeItem)
}

export function listDueItems(db: DatabaseSync): KnowledgeItem[] {
  const rows = db.prepare(`SELECT * FROM knowledge_items WHERE date(review_due) <= date('now','localtime') ORDER BY review_due ASC`).all() as any[]
  return rows.map(rowToKnowledgeItem)
}

export function reviewKnowledgeItem(db: DatabaseSync, id: number, grade: ReviewGrade): KnowledgeItem {
  return transaction(db, () => {
    const cur = getKnowledgeItem(db, id)
    if (!cur) throw new Error('knowledge item not found')
    if (grade === 'remembered') {
      const count = cur.reviewCount + 1
      const interval = INTERVALS[Math.min(count, INTERVALS.length - 1)]
      db.prepare(`UPDATE knowledge_items SET review_count=?, review_interval=?, mastery=?,
        review_due=date('now','localtime','+' || ? || ' days'), updated_at=datetime('now') WHERE id=?`)
        .run(count, interval, Math.min(5, cur.mastery + 1), interval, id)
    } else {
      db.prepare(`UPDATE knowledge_items SET review_count=0, review_interval=1, mastery=?,
        review_due=date('now','localtime','+1 days'), updated_at=datetime('now') WHERE id=?`)
        .run(Math.max(0, cur.mastery - 1), id)
    }
    return getKnowledgeItem(db, id)!
  })
}

export function listAllTags(db: DatabaseSync): string[] {
  const rows = db.prepare('SELECT tags FROM knowledge_items').all() as any[]
  const set = new Set<string>()
  for (const r of rows) for (const t of JSON.parse(r.tags ?? '[]')) set.add(t)
  return [...set]
}

export function knowledgeStats(db: DatabaseSync) {
  const total = (db.prepare('SELECT COUNT(*) c FROM knowledge_items').get() as any).c
  const due = (db.prepare(`SELECT COUNT(*) c FROM knowledge_items WHERE date(review_due) <= date('now','localtime')`).get() as any).c
  const mastered = (db.prepare('SELECT COUNT(*) c FROM knowledge_items WHERE mastery>=5').get() as any).c
  return { total, due, mastered }
}

// ── Dashboard 聚合(Offer Readiness 首页真数据）──────────────
export function dashboardStats(db: DatabaseSync) {
  // 简历质量:最近一次诊断的 HR / 面试官双视角总分(各取最新一条）
  const latestReview = (p: string) =>
    (db.prepare('SELECT overall_score s FROM reviews WHERE perspective=? ORDER BY id DESC LIMIT 1').get(p) as any)?.s ?? null
  const hrScore = latestReview('hr')
  const interviewerScore = latestReview('interviewer')

  // 算法能力:Hot100 掌握进度
  const lc = progressSummary(db)

  // 知识掌握
  const kn = knowledgeStats(db)

  // 模拟面试:已结束场次的平均总分
  const interviewRows = db.prepare(
    "SELECT report_json FROM interview_sessions WHERE status='finished' AND report_json IS NOT NULL"
  ).all() as any[]
  const interviewScores = interviewRows.map(r => InterviewReportSchema.parse(JSON.parse(r.report_json)).overallScore)
  const interviewAvg = interviewScores.length
    ? Math.round(interviewScores.reduce((a, b) => a + b, 0) / interviewScores.length) : null

  // 项目深度:各场次平均分(每轮满分 50)再求均值
  const deepdiveSessions = listDeepdiveSessions(db)
  const ddScores = deepdiveSessions.map(s => s.avgScore).filter((n): n is number => n != null)
  const deepdiveAvg = ddScores.length ? Math.round(ddScores.reduce((a, b) => a + b, 0) / ddScores.length) : null

  // 错题本
  const eb = bookStats(db)

  return {
    resume: { hasData: hrScore != null || interviewerScore != null, hrScore, interviewerScore },
    algorithm: { total: lc.total, mastered: lc.mastered, learning: lc.learning },
    knowledge: { total: kn.total, due: kn.due, mastered: kn.mastered },
    interview: { count: interviewScores.length, avgScore: interviewAvg },
    deepdive: { count: ddScores.length, avgScore: deepdiveAvg },
    errorbook: { total: eb.total, pending: eb.pending, conquered: eb.conquered },
  }
}

// ── 错题本(模块六) ──────────────────────────────────────────
function rowToAttempt(r: any): KnowledgeAttempt {
  return { id: r.id, itemId: r.item_id, answer: r.answer, score: r.score,
    feedback: JSON.parse(r.feedback_json) as KnowledgeAttemptFeedback, createdAt: r.created_at }
}

export function createAttempt(db: DatabaseSync, a: { itemId: number; answer: string; feedback: KnowledgeAttemptFeedback }): { attempt: KnowledgeAttempt; conquered: boolean } {
  return transaction(db, () => {
    const id = Number(db.prepare('INSERT INTO knowledge_attempts (item_id,answer,score,feedback_json) VALUES (?,?,?,?)')
      .run(a.itemId, a.answer, a.feedback.score, JSON.stringify(a.feedback)).lastInsertRowid)
    let conquered = false
    if (a.feedback.verdict === 'pass') {
      const cur = db.prepare('SELECT conquered_at FROM knowledge_items WHERE id=?').get(a.itemId) as any
      if (cur && cur.conquered_at == null) {
        db.prepare(`UPDATE knowledge_items SET conquered_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(a.itemId)
        conquered = true
      }
    }
    const attempt = rowToAttempt(db.prepare('SELECT * FROM knowledge_attempts WHERE id=?').get(id))
    return { attempt, conquered }
  })
}

export function listAttempts(db: DatabaseSync, itemId: number): KnowledgeAttempt[] {
  return (db.prepare('SELECT * FROM knowledge_attempts WHERE item_id=? ORDER BY id DESC').all(itemId) as any[]).map(rowToAttempt)
}

export function listBookItems(db: DatabaseSync, f: { status?: 'pending' | 'conquered'; source?: string; tag?: string }): (KnowledgeItem & { attemptCount: number })[] {
  const where: string[] = [`source IN ('interview','deepdive')`]
  const params: any[] = []
  where.push(f.status === 'conquered' ? 'conquered_at IS NOT NULL' : 'conquered_at IS NULL')
  if (f.source === 'interview' || f.source === 'deepdive') { where.push('source=?'); params.push(f.source) }
  if (f.tag) { where.push('tags LIKE ?'); params.push(`%${JSON.stringify(f.tag)}%`) }
  const rows = db.prepare(`SELECT * FROM knowledge_items WHERE ${where.join(' AND ')} ORDER BY updated_at DESC`).all(...params) as any[]
  return rows.map(r => {
    const c = (db.prepare('SELECT COUNT(*) c FROM knowledge_attempts WHERE item_id=?').get(r.id) as any).c
    return { ...rowToKnowledgeItem(r), attemptCount: Number(c) }
  })
}

export function bookStats(db: DatabaseSync) {
  const scope = `source IN ('interview','deepdive')`
  const total = (db.prepare(`SELECT COUNT(*) c FROM knowledge_items WHERE ${scope}`).get() as any).c
  const conquered = (db.prepare(`SELECT COUNT(*) c FROM knowledge_items WHERE ${scope} AND conquered_at IS NOT NULL`).get() as any).c
  const pending = total - conquered
  const bySourceRows = db.prepare(`SELECT source, COUNT(*) c FROM knowledge_items WHERE ${scope} GROUP BY source`).all() as any[]
  const bySource = bySourceRows.map(r => ({ source: r.source as string, count: Number(r.c) }))
  const conqueredLast7Days = (db.prepare(
    `SELECT COUNT(*) c FROM knowledge_items WHERE ${scope} AND conquered_at IS NOT NULL AND date(conquered_at) >= date('now','localtime','-6 days')`
  ).get() as any).c
  // byTag:仅统计未攻克(薄弱)条目
  const weakRows = db.prepare(`SELECT tags FROM knowledge_items WHERE ${scope} AND conquered_at IS NULL`).all() as any[]
  const tagCount = new Map<string, number>()
  for (const r of weakRows) for (const t of JSON.parse(r.tags ?? '[]')) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
  const byTag = [...tagCount.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count)
  return { total, pending, conquered, bySource, byTag, conqueredLast7Days: Number(conqueredLast7Days) }
}
