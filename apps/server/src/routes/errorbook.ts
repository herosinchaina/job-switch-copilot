import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { HttpError } from '../middleware/error'
import { listBookItems, bookStats, listAttempts, createAttempt, getKnowledgeItem } from '../db/repo'
import { gradeAttempt } from '../services/errorbook'

export function errorbookRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()

  r.get('/error-book', (req, res, next) => {
    try {
      const status = req.query.status
      if (status !== undefined && status !== 'pending' && status !== 'conquered') throw new HttpError(400, 'status 非法')
      const source = req.query.source ? String(req.query.source) : undefined
      res.json(listBookItems(db, {
        status: status as 'pending' | 'conquered' | undefined,
        source, tag: req.query.tag ? String(req.query.tag) : undefined,
      }))
    } catch (e) { next(e) }
  })

  r.get('/error-book/stats', (_req, res) => res.json(bookStats(db)))

  r.get('/error-book/items/:id/attempts', (req, res, next) => {
    try {
      const item = getKnowledgeItem(db, Number(req.params.id))
      if (!item) throw new HttpError(404, '条目不存在')
      res.json(listAttempts(db, item.id))
    } catch (e) { next(e) }
  })

  r.post('/error-book/items/:id/attempt', async (req, res, next) => {
    try {
      const item = getKnowledgeItem(db, Number(req.params.id))
      if (!item) throw new HttpError(404, '条目不存在')
      if (item.source !== 'interview' && item.source !== 'deepdive') throw new HttpError(400, '该条目不是错题')
      const answer = String(req.body.answer ?? '').trim()
      if (!answer) throw new HttpError(400, 'answer 不能为空')
      const feedback = await gradeAttempt(ai, { question: item.question, reference: item.reference, answer })
      const { attempt, conquered } = createAttempt(db, { itemId: item.id, answer, feedback })
      res.json({ feedback, conquered, attempt })
    } catch (e) { next(e) }
  })

  return r
}
