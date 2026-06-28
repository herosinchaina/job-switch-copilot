import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { getVersion, createVersion } from '../db/repo'
import { optimizeResume } from '../services/optimize'
import { HttpError } from '../middleware/error'

export function optimizeRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()
  r.post('/optimize', async (req, res, next) => {
    try {
      const v = getVersion(db, Number(req.body.versionId))
      if (!v) throw new HttpError(404, '版本不存在')
      const structured = await optimizeResume(ai, v.structured, req.body.suggestions ?? [])
      const versionId = createVersion(db, { resumeId: v.resumeId, kind:'optimized', parentVersionId: v.id, structured, status:'confirmed' })
      res.json({ versionId, structured })
    } catch (e) { next(e) }
  })
  return r
}
