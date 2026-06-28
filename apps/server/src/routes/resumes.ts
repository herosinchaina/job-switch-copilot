import { Router } from 'express'
import multer from 'multer'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { extractText, parseResume } from '../services/parse'
import { createResume, createVersion, confirmVersion, getVersion, listResumes } from '../db/repo'
import { StructuredResumeSchema } from '@aios/shared'
import { HttpError } from '../middleware/error'

const ALLOWED = { 'pdf':'pdf','docx':'docx','md':'md','markdown':'md' } as const
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } })

export function resumesRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()
  r.get('/resumes', (_req, res) => res.json(listResumes(db)))
  r.post('/resumes', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, '缺少文件')
      const ext = req.file.originalname.split('.').pop()?.toLowerCase() ?? ''
      const fmt = (ALLOWED as any)[ext]
      if (!fmt) throw new HttpError(400, '仅支持 pdf/docx/md')
      const rawText = await extractText(req.file.buffer, fmt)
      const structured = await parseResume(ai, rawText)
      const title = req.file.originalname.replace(/\.[^.]+$/, '')
      const resumeId = createResume(db, { title, sourceFormat: fmt, rawText })
      const versionId = createVersion(db, { resumeId, kind:'original', parentVersionId:null, structured, status:'draft' })
      res.json({ resumeId, versionId, structured })
    } catch (e) { next(e) }
  })
  r.put('/resumes/versions/:id', (req, res, next) => {
    try {
      const structured = StructuredResumeSchema.parse(req.body.structured)
      const v = getVersion(db, Number(req.params.id))
      if (!v) throw new HttpError(404, '版本不存在')
      db.prepare('UPDATE resume_versions SET structured_json=? WHERE id=?')
        .run(JSON.stringify(structured), v.id)
      res.json({ ok: true })
    } catch (e) { next(e) }
  })
  r.post('/resumes/versions/:id/confirm', (req, res, next) => {
    try {
      const v = getVersion(db, Number(req.params.id))
      if (!v) throw new HttpError(404, '版本不存在')
      confirmVersion(db, v.id); res.json({ ok: true })
    } catch (e) { next(e) }
  })
  return r
}
