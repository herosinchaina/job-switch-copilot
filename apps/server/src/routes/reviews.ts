import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { getVersion, createReview } from '../db/repo'
import { reviewResume } from '../services/review'
import { HttpError } from '../middleware/error'

export function reviewsRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()
  r.post('/reviews', async (req, res, next) => {
    try {
      const v = getVersion(db, Number(req.body.versionId))
      if (!v) throw new HttpError(404, '版本不存在')
      if (v.status !== 'confirmed') throw new HttpError(409, '请先确认校对后的简历再诊断')
      const hr = await reviewResume(ai, v.structured, 'hr')
      const interviewer = await reviewResume(ai, v.structured, 'interviewer')
      createReview(db, v.id, hr); createReview(db, v.id, interviewer)
      res.json({ hr, interviewer })
    } catch (e) { next(e) }
  })
  return r
}
