import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { dashboardStats } from '../db/repo'

export function dashboardRouter(db: DatabaseSync) {
  const r = Router()
  r.get('/dashboard', (_req, res) => res.json(dashboardStats(db)))
  return r
}
