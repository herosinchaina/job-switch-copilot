import { spawn as nodeSpawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { ZodType } from 'zod'
import type { AiProvider } from './provider'
import { ConcurrencyQueue } from './queue'

type SpawnFn = typeof nodeSpawn
interface Opts { spawnFn?: SpawnFn; timeoutMs?: number; queue?: ConcurrencyQueue; model?: string }

export class ClaudeCliProvider implements AiProvider {
  private spawnFn: SpawnFn
  private timeoutMs: number
  private queue: ConcurrencyQueue
  private model?: string
  private startedSessions = new Set<string>()
  constructor(o: Opts = {}) {
    this.spawnFn = o.spawnFn ?? nodeSpawn
    this.timeoutMs = o.timeoutMs ?? 120_000
    this.queue = o.queue ?? new ConcurrencyQueue(2)
    this.model = o.model
  }
  complete(o: { system: string; prompt: string }): Promise<string> {
    return this.queue.run(() => this.invoke(o.system, o.prompt))
  }
  async *stream(o: { system: string; prompt: string }): AsyncIterable<string> {
    yield await this.complete(o) // 第一阶段流式简化为整体返回后一次性 yield
  }
  private invoke(system: string, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ['-p', '--output-format', 'text', '--append-system-prompt', system]
      if (this.model) args.push('--model', this.model)
      const cp = this.spawnFn('claude', args, { shell: false })
      let out = '', err = ''
      const timer = setTimeout(() => { cp.kill('SIGKILL'); reject(new Error('AI 调用超时')) }, this.timeoutMs)
      cp.stdout!.on('data', (d: Buffer) => { out += d.toString() })
      cp.stderr!.on('data', (d: Buffer) => { err += d.toString() })
      cp.on('error', (e: Error) => { clearTimeout(timer); reject(e) })
      cp.on('close', (code: number) => {
        clearTimeout(timer)
        if (code === 0) resolve(out.trim())
        else reject(new Error(`claude CLI 退出码 ${code}: ${err.slice(0, 200)}`))
      })
      cp.stdin!.write(prompt); cp.stdin!.end()
    })
  }

  startSession(): string { return randomUUID() }

  continueSession(sessionId: string, o: { system?: string; prompt: string }): Promise<string> {
    return this.queue.run(() => this.invokeSession(sessionId, o.system, o.prompt))
  }

  private invokeSession(sessionId: string, system: string | undefined, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const first = !this.startedSessions.has(sessionId)
      const args = ['-p', '--output-format', 'text']
      if (first) args.push('--session-id', sessionId)
      else args.push('--resume', sessionId)
      if (system) args.push('--append-system-prompt', system)
      if (this.model) args.push('--model', this.model)
      const cp = this.spawnFn('claude', args, { shell: false })
      let out = '', err = ''
      const timer = setTimeout(() => { cp.kill('SIGKILL'); reject(new Error('AI 会话调用超时')) }, this.timeoutMs)
      cp.stdout!.on('data', (d: Buffer) => { out += d.toString() })
      cp.stderr!.on('data', (d: Buffer) => { err += d.toString() })
      cp.on('error', (e: Error) => { clearTimeout(timer); reject(e) })
      cp.on('close', (code: number) => {
        clearTimeout(timer)
        if (code === 0) { this.startedSessions.add(sessionId); resolve(out.trim()) }
        else reject(new Error(`claude 会话退出码 ${code}: ${err.slice(0, 200)}`))
      })
      cp.stdin!.write(prompt); cp.stdin!.end()
    })
  }
}

function extractJson(raw: string): string {
  const s = raw.indexOf('{'); const e = raw.lastIndexOf('}')
  return s >= 0 && e > s ? raw.slice(s, e + 1) : raw
}

export async function completeJson<T>(provider: AiProvider, schema: ZodType<T>, o: { system: string; prompt: string }): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.complete(o)
    try { return schema.parse(JSON.parse(extractJson(raw))) }
    catch (e) { lastErr = e }
  }
  throw new Error('AI 返回的数据格式非法,已重试仍失败')
}

export async function completeJsonSession<T>(
  provider: AiProvider, schema: ZodType<T>, sessionId: string, o: { system?: string; prompt: string },
): Promise<T> {
  if (!provider.continueSession) throw new Error('provider 不支持会话')
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.continueSession(sessionId, o)
    try { return schema.parse(JSON.parse(extractJson(raw))) } catch { /* retry */ }
  }
  throw new Error('AI 会话返回的数据格式非法,已重试仍失败')
}

let singleton: ClaudeCliProvider | null = null
export function getAi(): AiProvider { return (singleton ??= new ClaudeCliProvider()) }

// LeetCode 引导讲题专用 provider:固定用 Sonnet(省 token,够用)。
// 与默认 getAi() 分开,避免影响简历诊断/模拟面试。
let guideSingleton: ClaudeCliProvider | null = null
export function getGuideAi(): AiProvider { return (guideSingleton ??= new ClaudeCliProvider({ model: 'sonnet' })) }

export async function selfCheck(): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const cp = nodeSpawn('claude', ['--version'], { shell: false })
    let out = ''
    let settled = false
    const settle = (r: { ok: boolean; detail: string }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(r)
    }
    const timer = setTimeout(() => {
      cp.kill('SIGKILL')
      settle({ ok: false, detail: 'claude CLI 响应超时' })
    }, 5000)
    cp.stdout?.on('data', (d) => { out += d.toString() })
    cp.on('error', () => settle({ ok: false, detail: '未检测到 claude CLI,请安装并登录 Claude Code' }))
    cp.on('close', (code) => settle(code === 0
      ? { ok: true, detail: out.trim() }
      : { ok: false, detail: 'claude CLI 不可用' }))
  })
}
