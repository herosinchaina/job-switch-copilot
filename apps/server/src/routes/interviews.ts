import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { ROUND_TYPES, type RoundType } from '@aios/shared'
import { startInterview, answerTurn, generateReport } from '../services/interview'
import { getVersion, getJd, createSession, getSession, finishSession, createTurn, answerTurnRow, listTurns } from '../db/repo'
import { HttpError } from '../middleware/error'

export function interviewsRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()

  r.post('/interviews', async (req, res, next) => {
    try {
      const v = getVersion(db, Number(req.body.versionId))
      if (!v) throw new HttpError(404, '版本不存在')
      if (v.status !== 'confirmed') throw new HttpError(409, '请先确认校对后的简历再开始面试')
      const roundType = req.body.roundType as RoundType
      if (!ROUND_TYPES.includes(roundType)) throw new HttpError(400, 'roundType 非法')
      const maxRounds = Math.min(Math.max(Math.trunc(Number(req.body.maxRounds)) || 6, 1), 12)
      let jd, jdId: number | null = null, role = roundType === 'tech' ? '技术岗' : '通用岗'
      const jdRaw = req.body.jobDescriptionId
      if (jdRaw !== undefined && jdRaw !== null) {
        const found = getJd(db, Number(jdRaw))
        if (!found) throw new HttpError(404, 'JD 不存在')
        jd = found.structured; jdId = found.id; role = found.structured.role || role
      }
      const { cliSessionId, firstQuestion } = await startInterview(ai, { resume: v.structured, jd, roundType })
      const sessionId = createSession(db, { resumeVersionId: v.id, jobDescriptionId: jdId, cliSessionId, role, roundType, maxRounds })
      createTurn(db, { sessionId, turnIndex: 0, question: firstQuestion })
      res.json({ sessionId, turnIndex: 0, question: firstQuestion })
    } catch (e) { next(e) }
  })

  r.post('/interviews/:id/answer', async (req, res, next) => {
    try {
      const session = getSession(db, Number(req.params.id))
      if (!session) throw new HttpError(404, '面试不存在')
      if (session.status !== 'active') throw new HttpError(409, '面试已结束')
      const turns = listTurns(db, session.id)
      const pending = turns.find(t => t.answer === null)
      if (!pending) throw new HttpError(409, '没有待回答的问题')
      const answer = String(req.body.answer ?? '')
      const v = getVersion(db, session.resumeVersionId)!
      const jd = session.jobDescriptionId ? getJd(db, session.jobDescriptionId)?.structured : undefined
      const history = turns.filter(t => t.answer !== null).map(t => ({ question: t.question, answer: t.answer! }))
      history.push({ question: pending.question, answer })

      const step = await answerTurn(ai, {
        cliSessionId: session.cliSessionId, roundType: session.roundType, resume: v.structured, jd,
        history, question: pending.question, answer, turnIndex: pending.turnIndex, maxRounds: session.maxRounds,
      })
      const score = step.feedback?.score ?? 0
      answerTurnRow(db, pending.id, { answer, score, feedback: step.feedback ?? { score, highlights: [], gaps: [], better: '' } })

      // 硬停止:模型可能无视轮次上限的提示词约束,因此路由强制收口。
      // 当刚作答的 turn 满足 turnIndex + 1 >= maxRounds 时,无论 AI 是否返回 nextQuestion,
      // 本场面试必须结束(生成报告 + finishSession)。
      const reachedCap = pending.turnIndex + 1 >= session.maxRounds
      const shouldContinue = step.nextQuestion && !reachedCap

      if (shouldContinue) {
        createTurn(db, { sessionId: session.id, turnIndex: pending.turnIndex + 1, question: step.nextQuestion! })
        return res.json({ feedback: step.feedback, nextQuestion: step.nextQuestion, turnIndex: pending.turnIndex + 1, finished: false })
      }
      // 结束:生成报告
      const allTurns = listTurns(db, session.id).filter(t => t.answer !== null)
        .map(t => ({ question: t.question, answer: t.answer!, score: t.score ?? 0 }))
      const report = await generateReport(ai, { roundType: session.roundType, turns: allTurns })
      finishSession(db, session.id, report)
      res.json({ feedback: step.feedback, nextQuestion: null, turnIndex: pending.turnIndex, finished: true, report })
    } catch (e) { next(e) }
  })

  r.get('/interviews/:id', (req, res, next) => {
    try {
      const session = getSession(db, Number(req.params.id))
      if (!session) throw new HttpError(404, '面试不存在')
      res.json({ session, turns: listTurns(db, session.id) })
    } catch (e) { next(e) }
  })

  return r
}
