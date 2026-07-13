import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { getVersion, createVersion, setSetting } from '../db/repo'
import { optimizeResume } from '../services/optimize'
import { HttpError } from '../middleware/error'

export function optimizeRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()
  r.post('/optimize', async (req, res, next) => {
    try {
      const v = getVersion(db, Number(req.body.versionId))
      if (!v) throw new HttpError(404, '版本不存在')
      if (v.status !== 'confirmed') throw new HttpError(409, '请先确认校对后的简历再优化')
      const structured = await optimizeResume(ai, v.structured, req.body.suggestions ?? [])
      const versionId = createVersion(db, { resumeId: v.resumeId, kind:'optimized', parentVersionId: v.id, structured, status:'confirmed' })
      // 优化版即新的当前活跃简历
      setSetting(db, 'active_version_id', String(versionId))
      res.json({ versionId, structured })
    } catch (e) { next(e) }
  })
  return r
}
