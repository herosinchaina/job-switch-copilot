import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
export class HttpError extends Error { constructor(public status: number, msg: string){ super(msg) } }
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  // 输入校验失败(zod)按 400 客户端错误返回;显式 HttpError 用其状态码;其余按 500。
  if (err instanceof ZodError) {
    res.status(400).json({ error: '请求参数校验失败', issues: err.issues })
    return
  }
  const status = err instanceof HttpError ? err.status : 500
  res.status(status).json({ error: err.message ?? '服务器内部错误' })
}
