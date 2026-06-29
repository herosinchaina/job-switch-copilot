import { Router } from 'express'
import { selfCheck } from '../ai/claude-cli'
export const healthRouter = Router()
healthRouter.get('/health', async (_req, res) => { res.json({ cli: await selfCheck() }) })
