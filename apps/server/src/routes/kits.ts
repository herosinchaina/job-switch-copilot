import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { generateKit } from '../services/kit'
import { getVersion, getJd, createKit } from '../db/repo'
import { HttpError } from '../middleware/error'

export function kitsRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()
  r.post('/kits', async (req, res, next) => {
    try {
      const v = getVersion(db, Number(req.body.versionId))
      if (!v) throw new HttpError(404, '版本不存在')
      if (v.status !== 'confirmed') throw new HttpError(409, '请先确认校对后的简历再生成材料')
      const jdIdRaw = req.body.jobDescriptionId
      let jdId: number | null = null
      let jd
      if (jdIdRaw !== undefined && jdIdRaw !== null) {
        const found = getJd(db, Number(jdIdRaw))
        if (!found) throw new HttpError(404, 'JD 不存在')
        jd = found.structured; jdId = found.id
      }
      const kit = await generateKit(ai, v.structured, jd)
      const id = createKit(db, { resumeVersionId: v.id, jobDescriptionId: jdId, kit })
      res.json({ id, kit })
    } catch (e) { next(e) }
  })
  return r
}
