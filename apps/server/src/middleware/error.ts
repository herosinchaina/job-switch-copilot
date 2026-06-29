import type { Request, Response, NextFunction } from 'express'
export class HttpError extends Error { constructor(public status: number, msg: string){ super(msg) } }
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err instanceof HttpError ? err.status : 500
  res.status(status).json({ error: err.message ?? '服务器内部错误' })
}
