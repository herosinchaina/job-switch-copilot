import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { KnowledgeItemInputSchema, REVIEW_GRADES, type ReviewGrade } from '@aios/shared'
import { HttpError } from '../middleware/error'
import { createKnowledgeItem, importWeakItem, getKnowledgeItem, updateKnowledgeItem,
  deleteKnowledgeItem, listKnowledgeItems, listDueItems, reviewKnowledgeItem, listAllTags,
  listTurns, listDeepdiveTurns, transaction } from '../db/repo'

export function knowledgeRouter(db: DatabaseSync) {
  const r = Router()

  r.get('/knowledge', (req, res) => {
    const q = req.query
    res.json(listKnowledgeItems(db, {
      source: q.source ? String(q.source) : undefined,
      tag: q.tag ? String(q.tag) : undefined,
      mastery: q.mastery !== undefined ? Number(q.mastery) : undefined,
      q: q.q ? String(q.q) : undefined,
    }))
  })

  // 静态段须先于含参数的 /:id 注册,避免被当成 id
  r.get('/knowledge/due', (_req, res) => res.json(listDueItems(db)))
  r.get('/knowledge/tags', (_req, res) => res.json(listAllTags(db)))

  r.post('/knowledge', (req, res, next) => {
    try {
      const input = KnowledgeItemInputSchema.parse(req.body)
      const id = createKnowledgeItem(db, { ...input, source: 'manual', sourceRef: null })
      res.json(getKnowledgeItem(db, id))
    } catch (e) { next(e) }
  })

  r.post('/knowledge/import', (req, res, next) => {
    try {
      const from = String(req.body.from)
      const sessionId = Number(req.body.sessionId)
      if (from !== 'interview' && from !== 'deepdive') throw new HttpError(400, 'from 非法')
      const turns = from === 'interview' ? listTurns(db, sessionId) : listDeepdiveTurns(db, sessionId)
      const weak = turns.filter((t: any) => t.isWeak && t.answer !== null)
      let imported = 0, skipped = 0
      transaction(db, () => {
        for (const t of weak as any[]) {
          const reference = from === 'interview' ? (t.feedback?.better ?? null) : (t.feedback?.betterAnswer ?? null)
          const id = importWeakItem(db, { source: from, sourceRef: String(t.id), question: t.question, answer: t.answer, reference })
          if (id === null) skipped++; else imported++
        }
      })
      res.json({ imported, skipped })
    } catch (e) { next(e) }
  })

  r.get('/knowledge/:id', (req, res, next) => {
    try {
      const item = getKnowledgeItem(db, Number(req.params.id))
      if (!item) throw new HttpError(404, '条目不存在')
      res.json(item)
    } catch (e) { next(e) }
  })

  r.put('/knowledge/:id', (req, res, next) => {
    try {
      if (!getKnowledgeItem(db, Number(req.params.id))) throw new HttpError(404, '条目不存在')
      const input = KnowledgeItemInputSchema.parse(req.body)
      updateKnowledgeItem(db, Number(req.params.id), input)
      res.json(getKnowledgeItem(db, Number(req.params.id)))
    } catch (e) { next(e) }
  })

  r.delete('/knowledge/:id', (req, res, next) => {
    try {
      if (!getKnowledgeItem(db, Number(req.params.id))) throw new HttpError(404, '条目不存在')
      deleteKnowledgeItem(db, Number(req.params.id))
      res.json({ ok: true })
    } catch (e) { next(e) }
  })

  r.post('/knowledge/:id/review', (req, res, next) => {
    try {
      const grade = String(req.body.grade) as ReviewGrade
      if (!REVIEW_GRADES.includes(grade)) throw new HttpError(400, 'grade 非法')
      if (!getKnowledgeItem(db, Number(req.params.id))) throw new HttpError(404, '条目不存在')
      res.json(reviewKnowledgeItem(db, Number(req.params.id), grade))
    } catch (e) { next(e) }
  })

  return r
}
