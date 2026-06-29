import express, { type Express } from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from './ai/provider'
import { healthRouter } from './routes/health'
import { resumesRouter } from './routes/resumes'
import { reviewsRouter } from './routes/reviews'
import { optimizeRouter } from './routes/optimize'
import { exportRouter } from './routes/export'
import { errorHandler } from './middleware/error'

export function createApp(db: DatabaseSync, ai: AiProvider): Express {
  const app = express()
  app.use(express.json({ limit: '2mb' }))
  app.use('/api', healthRouter)
  app.use('/api', resumesRouter(db, ai))
  app.use('/api', reviewsRouter(db, ai))
  app.use('/api', optimizeRouter(db, ai))
  app.use('/api', exportRouter(db))
  app.use(errorHandler)
  return app
}

// 仅在直接运行时启动真实服务(测试只 import createApp,不会触发 main)。
async function main() {
  const { openDb } = await import('./db/repo')
  const { getAi } = await import('./ai/claude-cli')
  // 数据库路径相对于本模块解析,避免依赖启动时的工作目录;确保目录存在。
  const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../data')
  mkdirSync(dataDir, { recursive: true })
  const db = openDb(resolve(dataDir, 'aios.sqlite'))
  createApp(db, getAi()).listen(5179, '127.0.0.1', () => console.log('server on http://127.0.0.1:5179'))
}

// 健壮的"直接运行"判定:比较入口脚本与本模块的绝对路径(忽略扩展名差异)。
function isDirectRun(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  const entryPath = resolve(entry)
  const selfPath = resolve(fileURLToPath(import.meta.url))
  const strip = (p: string) => p.replace(/\.[^./]+$/, '')
  return entryPath === selfPath || strip(entryPath) === strip(selfPath)
}

if (isDirectRun()) {
  void main()
}
