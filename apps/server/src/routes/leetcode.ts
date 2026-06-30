import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { PROGRESS_STATUSES, type ProgressStatus } from '@aios/shared'
import { listProblems, getProblem, setProgress, progressSummary,
  createGuideSession, getGuideSession, finishGuideSession, createGuideTurn, answerGuideTurn, listGuideTurns } from '../db/repo'
import { startGuide, continueGuide } from '../services/guide'
import { HttpError } from '../middleware/error'

export function leetcodeRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()
  r.get('/lc/problems', (_req, res) => res.json(listProblems(db)))
  r.get('/lc/summary', (_req, res) => res.json(progressSummary(db)))

  r.put('/lc/problems/:id/progress', (req, res, next) => {
    try {
      const status = req.body.status as ProgressStatus
      if (!PROGRESS_STATUSES.includes(status)) throw new HttpError(400, 'status 非法')
      if (!getProblem(db, Number(req.params.id))) throw new HttpError(404, '题目不存在')
      setProgress(db, Number(req.params.id), status)
      res.json({ ok: true })
    } catch (e) { next(e) }
  })

  r.post('/lc/guides', async (req, res, next) => {
    try {
      const problem = getProblem(db, Number(req.body.leetcodeId))
      if (!problem) throw new HttpError(404, '题目不存在')
      const { cliSessionId, firstGuidance } = await startGuide(ai, problem)
      const sessionId = createGuideSession(db, { leetcodeId: problem.leetcodeId, cliSessionId })
      createGuideTurn(db, { sessionId, turnIndex: 0, question: firstGuidance })
      res.json({ sessionId, guidance: firstGuidance })
    } catch (e) { next(e) }
  })

  r.post('/lc/guides/:id/step', async (req, res, next) => {
    try {
      const session = getGuideSession(db, Number(req.params.id))
      if (!session) throw new HttpError(404, '引导会话不存在')
      if (session.status !== 'active') throw new HttpError(409, '引导已结束')
      const turns = listGuideTurns(db, session.id)
      const pending = turns.find(t => t.answer === null)
      if (!pending) throw new HttpError(409, '没有待回答的引导')
      const answer = String(req.body.answer ?? '')
      const problem = getProblem(db, session.leetcodeId)!
      const history = turns.filter(t => t.answer !== null).map(t => ({ question: t.question, answer: t.answer! }))
      history.push({ question: pending.question, answer })

      const step = await continueGuide(ai, { cliSessionId: session.cliSessionId, problem, history, question: pending.question, answer })
      answerGuideTurn(db, pending.id, answer)
      if (step.done) {
        finishGuideSession(db, session.id)
      } else {
        createGuideTurn(db, { sessionId: session.id, turnIndex: pending.turnIndex + 1, question: step.guidance })
      }
      res.json({ guidance: step.guidance, done: step.done })
    } catch (e) { next(e) }
  })

  r.get('/lc/guides/:id', (req, res, next) => {
    try {
      const session = getGuideSession(db, Number(req.params.id))
      if (!session) throw new HttpError(404, '引导会话不存在')
      res.json({ session, turns: listGuideTurns(db, session.id) })
    } catch (e) { next(e) }
  })

  return r
}
