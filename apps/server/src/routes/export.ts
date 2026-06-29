import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { exportAll } from '../db/repo'
export function exportRouter(db: DatabaseSync) {
  const r = Router()
  r.get('/export', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="aios-export.json"')
    res.json(exportAll(db))
  })
  return r
}
