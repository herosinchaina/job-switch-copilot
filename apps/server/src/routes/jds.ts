import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { parseJd } from '../services/jd'
import { createJd, listJds } from '../db/repo'
import { HttpError } from '../middleware/error'

export function jdsRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()
  r.get('/jds', (_req, res) => res.json(listJds(db)))
  r.post('/jds', async (req, res, next) => {
    try {
      const { title, company, rawText } = req.body ?? {}
      if (!title || !rawText) throw new HttpError(400, '缺少 title 或 rawText')
      const structured = await parseJd(ai, String(rawText))
      const id = createJd(db, { title: String(title), company: company ? String(company) : '', rawText: String(rawText), structured })
      res.json({ id, structured })
    } catch (e) { next(e) }
  })
  return r
}
