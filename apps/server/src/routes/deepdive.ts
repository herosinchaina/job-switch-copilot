import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { startDeepdive, answerDeepdive, generateMap, findProject } from '../services/deepdive'
import { getVersion, createDeepdiveSession, getDeepdiveSession, finishDeepdiveSession,
  createDeepdiveTurn, answerDeepdiveTurn, listDeepdiveTurns, listDeepdiveSessions } from '../db/repo'
import { HttpError } from '../middleware/error'

export function deepdiveRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()

  r.get('/deepdives', (_req, res) => res.json(listDeepdiveSessions(db)))

  r.post('/deepdives', async (req, res, next) => {
    try {
      const v = getVersion(db, Number(req.body.versionId))
      if (!v) throw new HttpError(404, '版本不存在')
      if (v.status !== 'confirmed') throw new HttpError(409, '请先确认校对后的简历再深挖')
      const projectName = String(req.body.projectName ?? '')
      if (!findProject(v.structured, projectName)) throw new HttpError(400, '该项目不在简历中')
      const maxRounds = Math.min(Math.max(Math.trunc(Number(req.body.maxRounds)) || 8, 1), 15)
      const { cliSessionId, firstQuestion } = await startDeepdive(ai, { resume: v.structured, projectName })
      const sessionId = createDeepdiveSession(db, { resumeVersionId: v.id, projectName, cliSessionId, maxRounds })
      createDeepdiveTurn(db, { sessionId, turnIndex: 0, question: firstQuestion })
      res.json({ sessionId, turnIndex: 0, question: firstQuestion })
    } catch (e) { next(e) }
  })

  r.post('/deepdives/:id/answer', async (req, res, next) => {
    try {
      const session = getDeepdiveSession(db, Number(req.params.id))
      if (!session) throw new HttpError(404, '深挖会话不存在')
      if (session.status !== 'active') throw new HttpError(409, '深挖已结束')
      const turns = listDeepdiveTurns(db, session.id)
      const pending = turns.find(t => t.answer === null)
      if (!pending) throw new HttpError(409, '没有待回答的问题')
      const answer = String(req.body.answer ?? '')
      const v = getVersion(db, session.resumeVersionId)!
      const history = turns.filter(t => t.answer !== null).map(t => ({ question: t.question, answer: t.answer! }))
      history.push({ question: pending.question, answer })

      const step = await answerDeepdive(ai, {
        cliSessionId: session.cliSessionId, resume: v.structured, projectName: session.projectName,
        history, question: pending.question, answer, turnIndex: pending.turnIndex, maxRounds: session.maxRounds,
      })
      const score = step.feedback?.total ?? 0
      const feedback = step.feedback ?? { scores: { techDepth:0, implementationClarity:0, architectureAwareness:0, metricsAwareness:0, expression:0 }, total: 0, strengths: [], vague: [], missingDetails: [], followUps: [], betterAnswer: '' }
      answerDeepdiveTurn(db, pending.id, { answer, score, feedback })

      const reachedCap = pending.turnIndex + 1 >= session.maxRounds
      const shouldContinue = step.nextQuestion && !reachedCap
      if (shouldContinue) {
        createDeepdiveTurn(db, { sessionId: session.id, turnIndex: pending.turnIndex + 1, question: step.nextQuestion! })
        return res.json({ feedback: step.feedback, nextQuestion: step.nextQuestion, turnIndex: pending.turnIndex + 1, finished: false })
      }
      const allTurns = listDeepdiveTurns(db, session.id).filter(t => t.answer !== null)
        .map(t => ({ question: t.question, answer: t.answer!, score: t.score ?? 0 }))
      const map = await generateMap(ai, { resume: v.structured, projectName: session.projectName, turns: allTurns })
      finishDeepdiveSession(db, session.id, map)
      res.json({ feedback: step.feedback, nextQuestion: null, turnIndex: pending.turnIndex, finished: true, map })
    } catch (e) { next(e) }
  })

  r.get('/deepdives/:id', (req, res, next) => {
    try {
      const session = getDeepdiveSession(db, Number(req.params.id))
      if (!session) throw new HttpError(404, '深挖会话不存在')
      res.json({ session, turns: listDeepdiveTurns(db, session.id) })
    } catch (e) { next(e) }
  })

  return r
}
