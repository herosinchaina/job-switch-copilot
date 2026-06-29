import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { getVersion, getJd, createReview, transaction } from '../db/repo'
import { reviewResume } from '../services/review'
import { analyzeGap } from '../services/jd'
import { HttpError } from '../middleware/error'

export function reviewsRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()
  r.post('/reviews', async (req, res, next) => {
    try {
      const v = getVersion(db, Number(req.body.versionId))
      if (!v) throw new HttpError(404, '版本不存在')
      if (v.status !== 'confirmed') throw new HttpError(409, '请先确认校对后的简历再诊断')

      const jdIdRaw = req.body.jobDescriptionId
      if (jdIdRaw === undefined || jdIdRaw === null) {
        // 现状:5 维双视角
        const hr = await reviewResume(ai, v.structured, 'hr')
        const interviewer = await reviewResume(ai, v.structured, 'interviewer')
        transaction(db, () => { createReview(db, v.id, hr); createReview(db, v.id, interviewer) })
        return res.json({ hr, interviewer })
      }

      const jd = getJd(db, Number(jdIdRaw))
      if (!jd) throw new HttpError(404, 'JD 不存在')
      const hr = await reviewResume(ai, v.structured, 'hr', jd.structured)
      const interviewer = await reviewResume(ai, v.structured, 'interviewer', jd.structured)
      const gap = await analyzeGap(ai, v.structured, jd.structured)
      transaction(db, () => {
        createReview(db, v.id, hr, { jobDescriptionId: jd.id, gap })
        createReview(db, v.id, interviewer, { jobDescriptionId: jd.id, gap })
      })
      res.json({ hr, interviewer, gap })
    } catch (e) { next(e) }
  })
  return r
}
