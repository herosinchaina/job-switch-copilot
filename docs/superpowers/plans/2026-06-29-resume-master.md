# 第一阶段实现计划:地基 + 简历大师 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建「AI 求职操作系统」的本地 monorepo 地基,并实现简历大师的完整闭环(上传 → 解析 → 人工校对 → 双视角诊断 → 优化版生成 → 前后对比)。

**Architecture:** 单用户本地应用。React+Vite+TS+Tailwind 前端调用仅监听 127.0.0.1 的 Express 后端;后端通过统一的 `AiProvider` 适配层 spawn 本地 `claude` CLI 完成 AI 调用,数据持久化到本地 SQLite(better-sqlite3)。前后端共享 `packages/shared` 里的 TS 数据模型。

**Tech Stack:** npm workspaces monorepo;前端 React 19 + Vite + TypeScript + TailwindCSS + recharts;后端 Node + Express + better-sqlite3 + pdf-parse + mammoth + zod;测试 Vitest。

## Global Constraints

- 运行模式:单用户、本地优先、无账号系统。数据全部存本地 SQLite。
- 后端**只能**绑定 `127.0.0.1`,绝不对外暴露。
- AI 调用**只能**经 `AiProvider` 接口;默认实现 `ClaudeCliProvider`,业务代码不得直接 spawn 进程或拼 prompt。
- spawn CLI **必须** `spawn('claude', [args], { shell: false })`,简历内容/prompt 经 stdin 或参数传入,**永不进 shell**。
- 所有 AI 返回的 JSON **必须**经 zod schema 校验后才入库或返回前端;校验失败重试一次,再失败返回明确错误,**绝不静默崩溃**。
- 结构化 JSON 一律**非流式**整体返回(避免残缺 JSON);流式仅用于自然语言长文本。
- SQLite **全程参数化查询**;多步写操作用事务。
- AI 适配层内置**限并发队列**(默认最多 2 个并发 CLI 进程);每次调用设**超时**,超时 kill 子进程。
- 上传文件:仅 `pdf/docx/md`,大小 ≤10MB。
- 诊断维度固定为 5 项(不依赖 JD):排版可读性、专业度、STAR 法则、量化程度、技术深度。
- 简历优化 prompt **必须**强约束:保持内容真实、不夸大、不编造经历。
- 日志**不得**打印简历全文。
- TypeScript 全程严格模式(`strict: true`)。

---

## 文件结构(决定任务分解)

```
Switch_Job/
├── package.json                      # workspaces 根 + dev 脚本
├── tsconfig.base.json                # 共享 TS 配置
├── packages/shared/
│   ├── package.json
│   └── src/
│       ├── resume.ts                 # StructuredResume 类型 + zod schema
│       ├── review.ts                 # Review/Dimension/Suggestion 类型 + schema
│       └── index.ts
├── apps/server/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts                  # Express 启动,绑 127.0.0.1,挂路由
│   │   ├── db/
│   │   │   ├── connection.ts         # better-sqlite3 实例 + migrate
│   │   │   └── repo.ts               # 参数化 CRUD(resumes/versions/reviews)
│   │   ├── ai/
│   │   │   ├── provider.ts           # AiProvider 接口
│   │   │   ├── claude-cli.ts         # ClaudeCliProvider(spawn)
│   │   │   ├── queue.ts              # 限并发队列
│   │   │   └── index.ts              # 单例 + selfCheck()
│   │   ├── services/
│   │   │   ├── parse.ts              # 文本抽取 + AI 解析
│   │   │   ├── review.ts             # 双视角诊断
│   │   │   └── optimize.ts           # 优化版生成
│   │   ├── routes/
│   │   │   ├── health.ts             # GET /api/health(含 CLI 自检)
│   │   │   ├── resumes.ts            # 简历/版本 CRUD + 解析 + 校对确认
│   │   │   ├── reviews.ts            # 诊断
│   │   │   ├── optimize.ts           # 优化
│   │   │   └── export.ts             # 数据导出
│   │   ├── prompts/                  # parse.txt / review.txt / optimize.txt
│   │   └── middleware/error.ts       # 统一错误中间件
│   └── data/                         # SQLite 文件(gitignored)
└── apps/web/
    ├── package.json
    ├── index.html, vite.config.ts, tailwind.config.js
    └── src/
        ├── main.tsx, App.tsx, api.ts # fetch 封装
        ├── theme.ts                  # 深色模式
        ├── components/               # 通用组件(三态/RadarChart 等)
        └── pages/
            ├── Dashboard.tsx
            ├── ResumeList.tsx
            ├── ResumeUpload.tsx
            ├── ResumeReview.tsx      # 校对 + 诊断 + 联动高亮
            └── ResumeCompare.tsx
```

---

### Task 1: Monorepo 地基 + 共享数据模型

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`(已存在,确认含 `node_modules/`、`data/*.sqlite`)
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/resume.ts`, `packages/shared/src/review.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/resume.test.ts`

**Interfaces:**
- Consumes: 无(首个任务)
- Produces:
  - `StructuredResumeSchema`(zod) 与类型 `StructuredResume`,结构:`{ basics:{name,title,contact,summary}, education:{school,degree,major,period,highlights:string[]}[], work:{company,role,period,bullets:string[]}[], projects:{name,role,period,stack:string[],bullets:string[],metrics:string[]}[], skills:{category,items:string[]}[], awards:{name,date,desc}[] }`
  - `ReviewSchema`(zod) 与类型 `Review`:`{ perspective:'hr'|'interviewer', overallScore:number, dimensionScores:{dimension:DimensionKey,score:number,comment:string}[], suggestions:{location:string,severity:'high'|'medium'|'low',issue:string,suggestion:string}[] }`
  - `DIMENSIONS: DimensionKey[]` = `['layout','professionalism','star','quantification','techDepth']`

- [ ] **Step 1: 初始化 npm workspaces 根**

`package.json`:
```json
{
  "name": "ai-interview-os",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "dev": "npm run dev --workspace=apps/server & npm run dev --workspace=apps/web",
    "test": "vitest run"
  },
  "devDependencies": { "typescript": "^5.5.0", "vitest": "^2.0.0" }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true,
    "declaration": true, "resolveJsonModule": true
  }
}
```

- [ ] **Step 2: 写失败测试(shared schema)**

`packages/shared/src/resume.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { StructuredResumeSchema } from './resume'

describe('StructuredResumeSchema', () => {
  it('accepts a minimal valid resume', () => {
    const r = { basics:{name:'A',title:'Dev',contact:'a@x.com',summary:''},
      education:[], work:[], projects:[], skills:[], awards:[] }
    expect(StructuredResumeSchema.parse(r)).toEqual(r)
  })
  it('rejects missing basics', () => {
    expect(() => StructuredResumeSchema.parse({ education:[] })).toThrow()
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm i && npm test`
Expected: FAIL —无法导入 `./resume`

- [ ] **Step 4: 实现 shared 包**

`packages/shared/package.json`:
```json
{ "name":"@aios/shared","version":"0.0.0","type":"module",
  "main":"src/index.ts","dependencies":{"zod":"^3.23.0"} }
```
`packages/shared/src/resume.ts`:
```ts
import { z } from 'zod'
export const StructuredResumeSchema = z.object({
  basics: z.object({ name:z.string(), title:z.string(), contact:z.string(), summary:z.string() }),
  education: z.array(z.object({ school:z.string(), degree:z.string(), major:z.string(), period:z.string(), highlights:z.array(z.string()) })),
  work: z.array(z.object({ company:z.string(), role:z.string(), period:z.string(), bullets:z.array(z.string()) })),
  projects: z.array(z.object({ name:z.string(), role:z.string(), period:z.string(), stack:z.array(z.string()), bullets:z.array(z.string()), metrics:z.array(z.string()) })),
  skills: z.array(z.object({ category:z.string(), items:z.array(z.string()) })),
  awards: z.array(z.object({ name:z.string(), date:z.string(), desc:z.string() })),
})
export type StructuredResume = z.infer<typeof StructuredResumeSchema>
```
`packages/shared/src/review.ts`:
```ts
import { z } from 'zod'
export const DIMENSIONS = ['layout','professionalism','star','quantification','techDepth'] as const
export type DimensionKey = typeof DIMENSIONS[number]
export const ReviewSchema = z.object({
  perspective: z.enum(['hr','interviewer']),
  overallScore: z.number().min(0).max(100),
  dimensionScores: z.array(z.object({ dimension: z.enum(DIMENSIONS), score: z.number().min(0).max(100), comment: z.string() })),
  suggestions: z.array(z.object({ location: z.string(), severity: z.enum(['high','medium','low']), issue: z.string(), suggestion: z.string() })),
})
export type Review = z.infer<typeof ReviewSchema>
```
`packages/shared/src/index.ts`:
```ts
export * from './resume'
export * from './review'
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test`
Expected: PASS(2 passed)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: monorepo 地基 + 共享数据模型与 schema"
```

---

### Task 2: AI 适配层(接口 + 限并发队列)

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`
- Create: `apps/server/src/ai/provider.ts`, `apps/server/src/ai/queue.ts`
- Test: `apps/server/src/ai/queue.test.ts`

**Interfaces:**
- Consumes: 无运行期依赖
- Produces:
  - `interface AiProvider { complete(o:{system:string;prompt:string}):Promise<string>; stream(o:{system:string;prompt:string}):AsyncIterable<string>; }`
  - `class ConcurrencyQueue { constructor(max:number); run<T>(fn:()=>Promise<T>):Promise<T>; }`

- [ ] **Step 1: 写失败测试(队列限并发)**

`apps/server/src/ai/queue.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { ConcurrencyQueue } from './queue'

describe('ConcurrencyQueue', () => {
  it('never runs more than max tasks at once', async () => {
    const q = new ConcurrencyQueue(2)
    let active = 0, peak = 0
    const task = () => q.run(async () => {
      active++; peak = Math.max(peak, active)
      await new Promise(r => setTimeout(r, 20)); active--
    })
    await Promise.all([task(),task(),task(),task(),task()])
    expect(peak).toBeLessThanOrEqual(2)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- queue`
Expected: FAIL —无法导入 `./queue`

- [ ] **Step 3: 实现 server 包骨架 + provider 接口 + 队列**

`apps/server/package.json`:
```json
{ "name":"@aios/server","version":"0.0.0","type":"module",
  "scripts":{"dev":"tsx watch src/index.ts","start":"tsx src/index.ts"},
  "dependencies":{"@aios/shared":"*","express":"^4.19.0","better-sqlite3":"^11.0.0","pdf-parse":"^1.1.1","mammoth":"^1.8.0","zod":"^3.23.0","multer":"^1.4.5-lts.1"},
  "devDependencies":{"tsx":"^4.16.0","@types/express":"^4.17.0","@types/multer":"^1.4.0","@types/better-sqlite3":"^7.6.0"} }
```
`apps/server/src/ai/provider.ts`:
```ts
export interface AiProvider {
  complete(o: { system: string; prompt: string }): Promise<string>
  stream(o: { system: string; prompt: string }): AsyncIterable<string>
}
```
`apps/server/src/ai/queue.ts`:
```ts
export class ConcurrencyQueue {
  private active = 0
  private waiters: (() => void)[] = []
  constructor(private max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>(r => this.waiters.push(r))
    this.active++
    try { return await fn() }
    finally { this.active--; this.waiters.shift()?.() }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm i && npm test -- queue`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: AI 适配层接口 + 限并发队列"
```

---

### Task 3: ClaudeCliProvider(spawn + 超时 + JSON 解析)

**Files:**
- Create: `apps/server/src/ai/claude-cli.ts`, `apps/server/src/ai/index.ts`
- Test: `apps/server/src/ai/claude-cli.test.ts`

**Interfaces:**
- Consumes: `AiProvider`(Task 2), `ConcurrencyQueue`(Task 2)
- Produces:
  - `class ClaudeCliProvider implements AiProvider`,构造参数 `{ spawnFn?, timeoutMs?, queue? }`(spawnFn 可注入便于测试)
  - `getAi(): AiProvider`(单例)
  - `async function selfCheck(): Promise<{ ok: boolean; detail: string }>`
  - `async function completeJson<T>(provider:AiProvider, schema:ZodType<T>, o:{system:string;prompt:string}): Promise<T>`(调用 + zod 校验 + 失败重试一次)

- [ ] **Step 1: 写失败测试(注入假 spawn,验证参数安全 + JSON 重试)**

`apps/server/src/ai/claude-cli.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { ClaudeCliProvider, completeJson } from './claude-cli'
import { z } from 'zod'

function makeCp(payload: string, code = 0) {
  const cp: any = new EventEmitter()
  cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
  cp.stdin = { write: vi.fn(), end: vi.fn() }; cp.kill = vi.fn()
  setTimeout(() => { cp.stdout.emit('data', payload); cp.emit('close', code) }, 5)
  return cp
}

describe('ClaudeCliProvider', () => {
  it('uses shell:false and feeds prompt via stdin', async () => {
    const spawnFn = vi.fn(() => makeCp('hello'))
    const p = new ClaudeCliProvider({ spawnFn: spawnFn as any })
    const out = await p.complete({ system: 'sys', prompt: 'hi; rm -rf /' })
    expect(out).toBe('hello')
    expect(spawnFn.mock.calls[0][2]).toMatchObject({ shell: false })
  })

  it('completeJson retries once on invalid JSON then succeeds', async () => {
    let n = 0
    const spawnFn = vi.fn(() => makeCp(n++ === 0 ? 'not json' : '{"v":1}'))
    const p = new ClaudeCliProvider({ spawnFn: spawnFn as any })
    const r = await completeJson(p, z.object({ v: z.number() }), { system:'s', prompt:'p' })
    expect(r).toEqual({ v: 1 })
    expect(spawnFn).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- claude-cli`
Expected: FAIL —无法导入 `./claude-cli`

- [ ] **Step 3: 实现 ClaudeCliProvider**

`apps/server/src/ai/claude-cli.ts`:
```ts
import { spawn as nodeSpawn } from 'node:child_process'
import type { ZodType } from 'zod'
import type { AiProvider } from './provider'
import { ConcurrencyQueue } from './queue'

type SpawnFn = typeof nodeSpawn
interface Opts { spawnFn?: SpawnFn; timeoutMs?: number; queue?: ConcurrencyQueue }

export class ClaudeCliProvider implements AiProvider {
  private spawnFn: SpawnFn
  private timeoutMs: number
  private queue: ConcurrencyQueue
  constructor(o: Opts = {}) {
    this.spawnFn = o.spawnFn ?? nodeSpawn
    this.timeoutMs = o.timeoutMs ?? 120_000
    this.queue = o.queue ?? new ConcurrencyQueue(2)
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

let singleton: ClaudeCliProvider | null = null
export function getAi(): AiProvider { return (singleton ??= new ClaudeCliProvider()) }

export async function selfCheck(): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const cp = nodeSpawn('claude', ['--version'], { shell: false })
    let out = ''
    cp.stdout?.on('data', (d) => { out += d.toString() })
    cp.on('error', () => resolve({ ok: false, detail: '未检测到 claude CLI,请安装并登录 Claude Code' }))
    cp.on('close', (code) => code === 0
      ? resolve({ ok: true, detail: out.trim() })
      : resolve({ ok: false, detail: 'claude CLI 不可用' }))
  })
}
```
`apps/server/src/ai/index.ts`:
```ts
export * from './provider'
export * from './claude-cli'
export { ConcurrencyQueue } from './queue'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- claude-cli`
Expected: PASS(2 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: ClaudeCliProvider — 安全 spawn + 超时 + JSON 校验重试 + selfCheck"
```

---

### Task 4: 数据层(SQLite 连接 + migrate + 参数化 repo)

**Files:**
- Create: `apps/server/src/db/connection.ts`, `apps/server/src/db/repo.ts`
- Test: `apps/server/src/db/repo.test.ts`

**Interfaces:**
- Consumes: `StructuredResume`, `Review`(Task 1)
- Produces(`repo.ts` 导出):
  - `openDb(file: string): Database.Database`(已 migrate)
  - `createResume(db, {title,sourceFormat,rawText}): number`
  - `createVersion(db, {resumeId,kind,parentVersionId,structured,status}): number`
  - `confirmVersion(db, versionId): void`
  - `getVersion(db, versionId): {id,resumeId,kind,status,structured:StructuredResume}|undefined`
  - `createReview(db, versionId, review:Review): number`
  - `listResumes(db): {id,title,createdAt}[]`
  - `exportAll(db): object`

- [ ] **Step 1: 写失败测试(内存库 `:memory:`)**

`apps/server/src/db/repo.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDb, createResume, createVersion, confirmVersion, getVersion, createReview, listResumes } from './repo'

let db: Database.Database
beforeEach(() => { db = openDb(':memory:') })
const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }

describe('repo', () => {
  it('round-trips a resume version and confirms it', () => {
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null, structured:sample, status:'draft' })
    expect(getVersion(db, vid)!.structured.basics.name).toBe('A')
    confirmVersion(db, vid)
    expect(getVersion(db, vid)!.status).toBe('confirmed')
  })
  it('stores a review and lists resumes', () => {
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null, structured:sample, status:'confirmed' })
    createReview(db, vid, { perspective:'hr', overallScore:80, dimensionScores:[], suggestions:[] })
    expect(listResumes(db).length).toBe(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- repo`
Expected: FAIL —无法导入 `./repo`

- [ ] **Step 3: 实现 connection + repo**

`apps/server/src/db/connection.ts`:
```ts
import type Database from 'better-sqlite3'
export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
      source_format TEXT NOT NULL, raw_text TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS resume_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, resume_id INTEGER NOT NULL REFERENCES resumes(id),
      kind TEXT NOT NULL, parent_version_id INTEGER, structured_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT, resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id),
      perspective TEXT NOT NULL, overall_score INTEGER NOT NULL,
      dimension_scores_json TEXT NOT NULL, suggestions_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS capability_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source_module TEXT NOT NULL,
      metrics_json TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
  `)
}
```
`apps/server/src/db/repo.ts`:
```ts
import Database from 'better-sqlite3'
import { migrate } from './connection'
import { StructuredResumeSchema, type StructuredResume, type Review } from '@aios/shared'

export function openDb(file: string): Database.Database {
  const db = new Database(file); db.pragma('foreign_keys = ON'); migrate(db); return db
}
export function createResume(db: Database.Database, r: { title:string; sourceFormat:string; rawText:string }): number {
  return Number(db.prepare('INSERT INTO resumes (title,source_format,raw_text) VALUES (?,?,?)')
    .run(r.title, r.sourceFormat, r.rawText).lastInsertRowid)
}
export function createVersion(db: Database.Database, v: { resumeId:number; kind:'original'|'optimized'; parentVersionId:number|null; structured:StructuredResume; status:'draft'|'confirmed' }): number {
  return Number(db.prepare('INSERT INTO resume_versions (resume_id,kind,parent_version_id,structured_json,status) VALUES (?,?,?,?,?)')
    .run(v.resumeId, v.kind, v.parentVersionId, JSON.stringify(v.structured), v.status).lastInsertRowid)
}
export function confirmVersion(db: Database.Database, versionId: number): void {
  db.prepare("UPDATE resume_versions SET status='confirmed' WHERE id=?").run(versionId)
}
export function getVersion(db: Database.Database, versionId: number) {
  const row = db.prepare('SELECT id,resume_id,kind,status,structured_json FROM resume_versions WHERE id=?').get(versionId) as any
  if (!row) return undefined
  return { id: row.id, resumeId: row.resume_id, kind: row.kind, status: row.status,
    structured: StructuredResumeSchema.parse(JSON.parse(row.structured_json)) }
}
export function createReview(db: Database.Database, versionId: number, rv: Review): number {
  return Number(db.prepare('INSERT INTO reviews (resume_version_id,perspective,overall_score,dimension_scores_json,suggestions_json) VALUES (?,?,?,?,?)')
    .run(versionId, rv.perspective, rv.overallScore, JSON.stringify(rv.dimensionScores), JSON.stringify(rv.suggestions)).lastInsertRowid)
}
export function listResumes(db: Database.Database) {
  return db.prepare('SELECT id,title,created_at as createdAt FROM resumes ORDER BY id DESC').all() as {id:number;title:string;createdAt:string}[]
}
export function exportAll(db: Database.Database) {
  return { resumes: db.prepare('SELECT * FROM resumes').all(),
    versions: db.prepare('SELECT * FROM resume_versions').all(),
    reviews: db.prepare('SELECT * FROM reviews').all() }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- repo`
Expected: PASS(2 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: SQLite 数据层 — migrate + 参数化 repo"
```

---

### Task 5: 文本抽取 + AI 解析服务

**Files:**
- Create: `apps/server/src/prompts/parse.txt`
- Create: `apps/server/src/services/parse.ts`
- Test: `apps/server/src/services/parse.test.ts`

**Interfaces:**
- Consumes: `AiProvider`, `completeJson`(Task 3), `StructuredResumeSchema`(Task 1)
- Produces:
  - `async function extractText(buf: Buffer, format: 'pdf'|'docx'|'md'): Promise<string>`
  - `async function parseResume(ai: AiProvider, rawText: string): Promise<StructuredResume>`

- [ ] **Step 1: 写失败测试(用 fake AiProvider,验证解析走 schema)**

`apps/server/src/services/parse.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { parseResume } from './parse'

const valid = JSON.stringify({ basics:{name:'Z',title:'Dev',contact:'z@x',summary:''},
  education:[],work:[],projects:[],skills:[],awards:[] })

const fakeAi = (out: string): AiProvider => ({
  async complete() { return out },
  async *stream() { yield out },
})

describe('parseResume', () => {
  it('returns a validated StructuredResume', async () => {
    const r = await parseResume(fakeAi(valid), '原始简历文本')
    expect(r.basics.name).toBe('Z')
  })
  it('throws on non-schema AI output', async () => {
    await expect(parseResume(fakeAi('{"bad":true}'), 'x')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- parse`
Expected: FAIL —无法导入 `./parse`

- [ ] **Step 3: 写 prompt + 实现服务**

`apps/server/src/prompts/parse.txt`:
```
你是简历解析器。将用户提供的简历纯文本解析为结构化 JSON。
严格要求:
1. 只输出 JSON,不要任何解释或 markdown 代码围栏。
2. 不得编造原文中不存在的内容;缺失字段用空字符串或空数组。
3. JSON 必须符合以下结构:
{ "basics":{"name","title","contact","summary"},
  "education":[{"school","degree","major","period","highlights":[]}],
  "work":[{"company","role","period","bullets":[]}],
  "projects":[{"name","role","period","stack":[],"bullets":[],"metrics":[]}],
  "skills":[{"category","items":[]}],
  "awards":[{"name","date","desc"}] }
```
`apps/server/src/services/parse.ts`:
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import { completeJson } from '../ai/claude-cli'
import { StructuredResumeSchema, type StructuredResume } from '@aios/shared'

const PROMPT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../prompts/parse.txt'), 'utf8')

export async function extractText(buf: Buffer, format: 'pdf'|'docx'|'md'): Promise<string> {
  if (format === 'md') return buf.toString('utf8')
  if (format === 'pdf') { const pdf = (await import('pdf-parse')).default; return (await pdf(buf)).text }
  const mammoth = await import('mammoth'); return (await mammoth.extractRawText({ buffer: buf })).value
}

export async function parseResume(ai: AiProvider, rawText: string): Promise<StructuredResume> {
  return completeJson(ai, StructuredResumeSchema, { system: PROMPT, prompt: rawText })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- parse`
Expected: PASS(2 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 简历文本抽取 + AI 解析服务"
```

---

### Task 6: 诊断服务(双视角)+ 优化服务

**Files:**
- Create: `apps/server/src/prompts/review.txt`, `apps/server/src/prompts/optimize.txt`
- Create: `apps/server/src/services/review.ts`, `apps/server/src/services/optimize.ts`
- Test: `apps/server/src/services/review.test.ts`

**Interfaces:**
- Consumes: `AiProvider`, `completeJson`(Task 3), `ReviewSchema`/`StructuredResumeSchema`(Task 1)
- Produces:
  - `async function reviewResume(ai, structured: StructuredResume, perspective:'hr'|'interviewer'): Promise<Review>`
  - `async function optimizeResume(ai, structured: StructuredResume, suggestions: Review['suggestions']): Promise<StructuredResume>`

- [ ] **Step 1: 写失败测试**

`apps/server/src/services/review.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { reviewResume } from './review'

const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }
const reviewOut = JSON.stringify({ perspective:'hr', overallScore:75,
  dimensionScores:[{dimension:'layout',score:70,comment:'ok'}],
  suggestions:[{location:'work[0]',severity:'high',issue:'缺量化',suggestion:'补数据'}] })
const fakeAi = (out: string): AiProvider => ({ async complete(){return out}, async *stream(){yield out} })

describe('reviewResume', () => {
  it('returns a validated Review and forces the requested perspective', async () => {
    const r = await reviewResume(fakeAi(reviewOut), sample as any, 'interviewer')
    expect(r.overallScore).toBe(75)
    expect(r.perspective).toBe('interviewer') // 服务以入参视角为准,覆盖 AI 输出
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- review`
Expected: FAIL —无法导入 `./review`

- [ ] **Step 3: 写 prompts + 实现两个服务**

`apps/server/src/prompts/review.txt`:
```
你是资深简历评审专家,从指定视角(HR 或面试官)评审结构化简历。
仅基于以下 5 个维度打分(0-100),不要评估岗位匹配/ATS/关键词:
layout(排版可读性) professionalism(专业度) star(STAR法则) quantification(量化程度) techDepth(技术深度)
严格要求:
1. 只输出 JSON,无解释、无 markdown 围栏。
2. suggestions 每条须含 location(定位到简历字段路径,如 "work[0].bullets[1]" 或 "projects[2]")、severity(high/medium/low)、issue、suggestion。
3. JSON 结构:
{ "perspective":"hr"|"interviewer", "overallScore":0-100,
  "dimensionScores":[{"dimension":"layout","score":0-100,"comment":""}],
  "suggestions":[{"location":"","severity":"high","issue":"","suggestion":""}] }
```
`apps/server/src/prompts/optimize.txt`:
```
你是资深简历优化师。根据给定的评审建议优化结构化简历。
铁律(违反即失败):
1. 保持内容真实,不得夸大、不得编造原文不存在的经历、项目或数据。
2. 仅做表达优化、措辞专业化、结构调整,以及把原文已隐含的成果显性量化(不得虚构数字)。
3. 只输出优化后的结构化 JSON,结构与输入完全一致,无解释、无 markdown 围栏。
```
`apps/server/src/services/review.ts`:
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import { completeJson } from '../ai/claude-cli'
import { ReviewSchema, type Review, type StructuredResume } from '@aios/shared'

const PROMPT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../prompts/review.txt'), 'utf8')

export async function reviewResume(ai: AiProvider, structured: StructuredResume, perspective: 'hr'|'interviewer'): Promise<Review> {
  const prompt = `视角: ${perspective}\n简历JSON:\n${JSON.stringify(structured)}`
  const r = await completeJson(ai, ReviewSchema, { system: PROMPT, prompt })
  return { ...r, perspective } // 以入参视角为准
}
```
`apps/server/src/services/optimize.ts`:
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import { completeJson } from '../ai/claude-cli'
import { StructuredResumeSchema, type StructuredResume, type Review } from '@aios/shared'

const PROMPT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../prompts/optimize.txt'), 'utf8')

export async function optimizeResume(ai: AiProvider, structured: StructuredResume, suggestions: Review['suggestions']): Promise<StructuredResume> {
  const prompt = `评审建议:\n${JSON.stringify(suggestions)}\n\n原简历JSON:\n${JSON.stringify(structured)}`
  return completeJson(ai, StructuredResumeSchema, { system: PROMPT, prompt })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- review`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 双视角诊断服务 + 真实约束优化服务"
```

---

### Task 7: 后端 HTTP 层(路由 + 错误中间件 + 启动绑定 127.0.0.1)

**Files:**
- Create: `apps/server/src/middleware/error.ts`
- Create: `apps/server/src/routes/health.ts`, `routes/resumes.ts`, `routes/reviews.ts`, `routes/optimize.ts`, `routes/export.ts`
- Create: `apps/server/src/index.ts`
- Test: `apps/server/src/routes/resumes.test.ts`

**Interfaces:**
- Consumes: 所有 services(Task 5/6)、repo(Task 4)、`getAi`/`selfCheck`(Task 3)
- Produces(REST,均以 `/api` 前缀):
  - `GET /api/health` → `{ cli:{ok,detail} }`
  - `POST /api/resumes`(multipart `file`) → `{ resumeId, versionId, structured }`(status=draft)
  - `PUT /api/resumes/versions/:id`(body: `{structured}`) → `{ ok:true }`(更新草稿内容)
  - `POST /api/resumes/versions/:id/confirm` → `{ ok:true }`
  - `GET /api/resumes` → `{id,title,createdAt}[]`
  - `POST /api/reviews`(body: `{versionId}`) → `{ hr:Review, interviewer:Review }`(版本须 confirmed)
  - `POST /api/optimize`(body: `{versionId, suggestions}`) → `{ versionId, structured }`(新 optimized 版本)
  - `GET /api/export` → 全量 JSON(`Content-Disposition: attachment`)
- 工厂函数 `createApp(db, ai): Express`(便于注入测试)

- [ ] **Step 1: 写失败测试(supertest + 注入 fake ai/内存库,验证上传→草稿→确认门禁)**

`apps/server/src/routes/resumes.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import type Database from 'better-sqlite3'
import { openDb } from '../db/repo'
import { createApp } from '../index'
import type { AiProvider } from '../ai/provider'

const parsed = JSON.stringify({ basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] })
const fakeAi: AiProvider = { async complete(){return parsed}, async *stream(){yield parsed} }
let db: Database.Database, app: any
beforeEach(() => { db = openDb(':memory:'); app = createApp(db, fakeAi) })

describe('resume routes', () => {
  it('upload creates a draft version', async () => {
    const res = await request(app).post('/api/resumes')
      .attach('file', Buffer.from('# resume'), 'r.md')
    expect(res.status).toBe(200)
    expect(res.body.structured.basics.name).toBe('A')
  })
  it('rejects review before confirm', async () => {
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    const res = await request(app).post('/api/reviews').send({ versionId: up.body.versionId })
    expect(res.status).toBe(409) // not confirmed
  })
})
```
(在 server devDependencies 加 `"supertest":"^7.0.0","@types/supertest":"^6.0.0"`)

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- resumes`
Expected: FAIL —无法导入 `../index`

- [ ] **Step 3: 实现错误中间件**

`apps/server/src/middleware/error.ts`:
```ts
import type { Request, Response, NextFunction } from 'express'
export class HttpError extends Error { constructor(public status: number, msg: string){ super(msg) } }
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err instanceof HttpError ? err.status : 500
  res.status(status).json({ error: err.message ?? '服务器内部错误' })
}
```

- [ ] **Step 4: 实现各路由**

`apps/server/src/routes/health.ts`:
```ts
import { Router } from 'express'
import { selfCheck } from '../ai/claude-cli'
export const healthRouter = Router()
healthRouter.get('/health', async (_req, res) => { res.json({ cli: await selfCheck() }) })
```
`apps/server/src/routes/resumes.ts`:
```ts
import { Router } from 'express'
import multer from 'multer'
import type Database from 'better-sqlite3'
import type { AiProvider } from '../ai/provider'
import { extractText, parseResume } from '../services/parse'
import { createResume, createVersion, confirmVersion, getVersion, listResumes } from '../db/repo'
import { StructuredResumeSchema } from '@aios/shared'
import { HttpError } from '../middleware/error'

const ALLOWED = { 'pdf':'pdf','docx':'docx','md':'md','markdown':'md' } as const
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } })

export function resumesRouter(db: Database.Database, ai: AiProvider) {
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
```
`apps/server/src/routes/reviews.ts`:
```ts
import { Router } from 'express'
import type Database from 'better-sqlite3'
import type { AiProvider } from '../ai/provider'
import { getVersion, createReview } from '../db/repo'
import { reviewResume } from '../services/review'
import { HttpError } from '../middleware/error'

export function reviewsRouter(db: Database.Database, ai: AiProvider) {
  const r = Router()
  r.post('/reviews', async (req, res, next) => {
    try {
      const v = getVersion(db, Number(req.body.versionId))
      if (!v) throw new HttpError(404, '版本不存在')
      if (v.status !== 'confirmed') throw new HttpError(409, '请先确认校对后的简历再诊断')
      const hr = await reviewResume(ai, v.structured, 'hr')
      const interviewer = await reviewResume(ai, v.structured, 'interviewer')
      createReview(db, v.id, hr); createReview(db, v.id, interviewer)
      res.json({ hr, interviewer })
    } catch (e) { next(e) }
  })
  return r
}
```
`apps/server/src/routes/optimize.ts`:
```ts
import { Router } from 'express'
import type Database from 'better-sqlite3'
import type { AiProvider } from '../ai/provider'
import { getVersion, createVersion } from '../db/repo'
import { optimizeResume } from '../services/optimize'
import { HttpError } from '../middleware/error'

export function optimizeRouter(db: Database.Database, ai: AiProvider) {
  const r = Router()
  r.post('/optimize', async (req, res, next) => {
    try {
      const v = getVersion(db, Number(req.body.versionId))
      if (!v) throw new HttpError(404, '版本不存在')
      const structured = await optimizeResume(ai, v.structured, req.body.suggestions ?? [])
      const versionId = createVersion(db, { resumeId: v.resumeId, kind:'optimized', parentVersionId: v.id, structured, status:'confirmed' })
      res.json({ versionId, structured })
    } catch (e) { next(e) }
  })
  return r
}
```
`apps/server/src/routes/export.ts`:
```ts
import { Router } from 'express'
import type Database from 'better-sqlite3'
import { exportAll } from '../db/repo'
export function exportRouter(db: Database.Database) {
  const r = Router()
  r.get('/export', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="aios-export.json"')
    res.json(exportAll(db))
  })
  return r
}
```

- [ ] **Step 5: 实现 createApp + 启动(绑 127.0.0.1)**

`apps/server/src/index.ts`:
```ts
import express, { type Express } from 'express'
import type Database from 'better-sqlite3'
import type { AiProvider } from './ai/provider'
import { healthRouter } from './routes/health'
import { resumesRouter } from './routes/resumes'
import { reviewsRouter } from './routes/reviews'
import { optimizeRouter } from './routes/optimize'
import { exportRouter } from './routes/export'
import { errorHandler } from './middleware/error'

export function createApp(db: Database.Database, ai: AiProvider): Express {
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

// 仅在直接运行时启动真实服务
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const { openDb } = await import('./db/repo')
  const { getAi } = await import('./ai/claude-cli')
  const db = openDb('apps/server/data/aios.sqlite')
  createApp(db, getAi()).listen(5179, '127.0.0.1', () => console.log('server on http://127.0.0.1:5179'))
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npm i && npm test -- resumes`
Expected: PASS(2 passed)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: 后端 HTTP 层 — 路由/错误中间件/127.0.0.1 绑定/校对门禁"
```

---

### Task 8: 前端脚手架(Vite + Tailwind + 深色模式 + API 封装)

**Files:**
- Create: `apps/web/package.json`, `vite.config.ts`, `index.html`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`
- Create: `apps/web/src/main.tsx`, `src/index.css`, `src/App.tsx`, `src/api.ts`, `src/theme.ts`
- Test: `apps/web/src/api.test.ts`

**Interfaces:**
- Consumes: 后端 REST(Task 7)、shared 类型(Task 1)
- Produces:
  - `api` 对象:`uploadResume(file):Promise<{resumeId,versionId,structured}>`, `updateVersion(id,structured)`, `confirmVersion(id)`, `listResumes()`, `review(versionId)`, `optimize(versionId,suggestions)`, `health()`
  - `useTheme(): { dark, toggle }`

- [ ] **Step 1: 写失败测试(api 封装拼对 URL/方法)**

`apps/web/src/api.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from './api'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })))
})

describe('api', () => {
  it('confirmVersion posts to the confirm endpoint', async () => {
    await api.confirmVersion(7)
    expect(fetch).toHaveBeenCalledWith('/api/resumes/versions/7/confirm', expect.objectContaining({ method: 'POST' }))
  })
  it('review posts versionId', async () => {
    await api.review(3)
    const [, opts] = (fetch as any).mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({ versionId: 3 })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- api`
Expected: FAIL —无法导入 `./api`

- [ ] **Step 3: 脚手架文件**

`apps/web/package.json`:
```json
{ "name":"@aios/web","version":"0.0.0","type":"module",
  "scripts":{"dev":"vite","build":"tsc && vite build","test":"vitest run"},
  "dependencies":{"@aios/shared":"*","react":"^19.0.0","react-dom":"^19.0.0","recharts":"^2.12.0"},
  "devDependencies":{"@vitejs/plugin-react":"^4.3.0","vite":"^5.3.0","tailwindcss":"^3.4.0","postcss":"^8.4.0","autoprefixer":"^10.4.0","typescript":"^5.5.0","@types/react":"^19.0.0","@types/react-dom":"^19.0.0"} }
```
`apps/web/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: { port: 5180, host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:5179' } },
})
```
`apps/web/index.html`:
```html
<!doctype html><html lang="zh"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>AI 求职操作系统</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
```
`apps/web/tailwind.config.js`:
```js
export default { darkMode: 'class', content: ['./index.html','./src/**/*.{ts,tsx}'], theme: { extend: {} }, plugins: [] }
```
`apps/web/postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```
`apps/web/src/index.css`:
```css
@tailwind base; @tailwind components; @tailwind utilities;
```
`apps/web/src/theme.ts`:
```ts
import { useEffect, useState } from 'react'
export function useTheme() {
  const [dark, setDark] = useState(() => {
    const s = localStorage.getItem('theme')
    return s ? s === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])
  return { dark, toggle: () => setDark(d => !d) }
}
```
`apps/web/src/api.ts`:
```ts
import type { StructuredResume, Review } from '@aios/shared'
async function j<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
  return res.json()
}
const json = (body: unknown): RequestInit => ({ method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
export const api = {
  health: () => j<{cli:{ok:boolean;detail:string}}>('/api/health'),
  listResumes: () => j<{id:number;title:string;createdAt:string}[]>('/api/resumes'),
  uploadResume: (file: File) => { const fd = new FormData(); fd.append('file', file)
    return j<{resumeId:number;versionId:number;structured:StructuredResume}>('/api/resumes', { method:'POST', body: fd }) },
  updateVersion: (id: number, structured: StructuredResume) =>
    j<{ok:true}>(`/api/resumes/versions/${id}`, { ...json({ structured }), method:'PUT' }),
  confirmVersion: (id: number) => j<{ok:true}>(`/api/resumes/versions/${id}/confirm`, { method:'POST' }),
  review: (versionId: number) => j<{hr:Review;interviewer:Review}>('/api/reviews', json({ versionId })),
  optimize: (versionId: number, suggestions: Review['suggestions']) =>
    j<{versionId:number;structured:StructuredResume}>('/api/optimize', json({ versionId, suggestions })),
}
```
`apps/web/src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
```
`apps/web/src/App.tsx`:
```tsx
import { useState } from 'react'
import { useTheme } from './theme'
export default function App() {
  const { dark, toggle } = useTheme()
  const [route] = useState<'dashboard'|'resume'>('resume')
  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-3">
        <span className="font-semibold">AI 求职操作系统</span>
        <button onClick={toggle} className="text-sm">{dark ? '☀️' : '🌙'}</button>
      </header>
      <main className="p-6">{/* Task 9-11 在此挂载页面;route=' + route + ' */}</main>
    </div>
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm i && npm test -- api`
Expected: PASS(2 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 前端脚手架 — Vite/Tailwind/深色模式/API 封装"
```

---

### Task 9: 通用组件(三态 + RadarChart + CLI 状态横幅)

**Files:**
- Create: `apps/web/src/components/Async.tsx`, `components/RadarChart.tsx`, `components/CliBanner.tsx`
- Test: `apps/web/src/components/Async.test.tsx`

**Interfaces:**
- Consumes: `api.health`(Task 8)、`recharts`、`DIMENSIONS`(Task 1)
- Produces:
  - `<AsyncView state={{loading,error,data}} empty? children=(data)=>ReactNode />`(loading/error/empty/data 四态)
  - `<RadarChart scores={{dimension:DimensionKey,score:number}[]} />`
  - `<CliBanner />`(挂载即调 `api.health`,not ok 时显示 ⚠️ 指引横幅)

- [ ] **Step 1: 写失败测试(AsyncView 渲染三态)**

`apps/web/src/components/Async.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { AsyncView } from './Async'

describe('AsyncView', () => {
  it('shows loading', () => {
    const { getByText } = render(<AsyncView state={{loading:true}}>{() => <div/>}</AsyncView>)
    expect(getByText(/加载中/)).toBeTruthy()
  })
  it('shows error', () => {
    const { getByText } = render(<AsyncView state={{error:'boom'}}>{() => <div/>}</AsyncView>)
    expect(getByText(/boom/)).toBeTruthy()
  })
  it('renders data', () => {
    const { getByText } = render(<AsyncView state={{data:'hi'}}>{(d) => <div>{d}</div>}</AsyncView>)
    expect(getByText('hi')).toBeTruthy()
  })
})
```
(web devDependencies 加 `"@testing-library/react":"^16.0.0","jsdom":"^25.0.0"`;`vite.config.ts` 的 `test` 配 `environment:'jsdom'`)

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- Async`
Expected: FAIL —无法导入 `./Async`

- [ ] **Step 3: 实现组件**

`apps/web/src/components/Async.tsx`:
```tsx
import type { ReactNode } from 'react'
export interface AsyncState<T> { loading?: boolean; error?: string; data?: T }
export function AsyncView<T>({ state, empty, children }: { state: AsyncState<T>; empty?: ReactNode; children: (d: T) => ReactNode }) {
  if (state.loading) return <div className="text-sm text-slate-500">加载中…</div>
  if (state.error) return <div className="text-sm text-red-500">出错了:{state.error}</div>
  if (state.data === undefined || state.data === null) return <>{empty ?? <div className="text-sm text-slate-400">暂无数据</div>}</>
  return <>{children(state.data)}</>
}
```
`apps/web/src/components/RadarChart.tsx`:
```tsx
import { Radar, RadarChart as RC, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import type { DimensionKey } from '@aios/shared'
const LABEL: Record<DimensionKey,string> = { layout:'排版', professionalism:'专业度', star:'STAR', quantification:'量化', techDepth:'技术深度' }
export function RadarChart({ scores }: { scores: { dimension: DimensionKey; score: number }[] }) {
  const data = scores.map(s => ({ subject: LABEL[s.dimension], score: s.score }))
  return <div style={{ width:'100%', height:260 }}><ResponsiveContainer>
    <RC data={data}><PolarGrid /><PolarAngleAxis dataKey="subject" />
    <Radar dataKey="score" stroke="#2563eb" fill="#2563eb" fillOpacity={0.4} /></RC>
  </ResponsiveContainer></div>
}
```
`apps/web/src/components/CliBanner.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { api } from '../api'
export function CliBanner() {
  const [cli, setCli] = useState<{ok:boolean;detail:string}|null>(null)
  useEffect(() => { api.health().then(r => setCli(r.cli)).catch(() => setCli({ok:false,detail:'无法连接后端'})) }, [])
  if (!cli || cli.ok) return null
  return <div className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-sm px-4 py-2">
    ⚠️ {cli.detail}。请确认已安装并登录 Claude Code CLI,否则 AI 功能不可用。</div>
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- Async`
Expected: PASS(3 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 通用组件 — 异步三态/雷达图/CLI 状态横幅"
```

---

### Task 10: 上传 + 结构化校对页(强制校对关卡)

**Files:**
- Create: `apps/web/src/pages/ResumeUpload.tsx`, `pages/StructuredEditor.tsx`
- Modify: `apps/web/src/App.tsx`(挂载路由 + CliBanner)
- Test: `apps/web/src/pages/ResumeUpload.test.tsx`

**Interfaces:**
- Consumes: `api.uploadResume/updateVersion/confirmVersion`(Task 8), `AsyncView`/`CliBanner`(Task 9), `StructuredResume`(Task 1)
- Produces:
  - `<ResumeUpload onConfirmed={(versionId:number)=>void} />` — 上传→展示草稿→编辑→点击「确认无误」调 updateVersion+confirmVersion→回调
  - `<StructuredEditor value structured onChange />` — 受控编辑各分区(basics/work/projects 等)

- [ ] **Step 1: 写失败测试(上传后展示草稿;确认前必须先校对)**

`apps/web/src/pages/ResumeUpload.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { ResumeUpload } from './ResumeUpload'
import { api } from '../api'

beforeEach(() => {
  vi.spyOn(api, 'uploadResume').mockResolvedValue({ resumeId:1, versionId:2,
    structured: { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] } as any })
  vi.spyOn(api, 'updateVersion').mockResolvedValue({ ok:true } as any)
  vi.spyOn(api, 'confirmVersion').mockResolvedValue({ ok:true } as any)
})

describe('ResumeUpload', () => {
  it('shows draft after upload and confirms via update+confirm', async () => {
    const onConfirmed = vi.fn()
    const { getByLabelText, getByText } = render(<ResumeUpload onConfirmed={onConfirmed} />)
    fireEvent.change(getByLabelText(/上传简历/), { target: { files: [new File(['# r'], 'r.md')] } })
    await waitFor(() => getByText(/确认无误/))
    fireEvent.click(getByText(/确认无误/))
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(2))
    expect(api.confirmVersion).toHaveBeenCalledWith(2)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- ResumeUpload`
Expected: FAIL —无法导入 `./ResumeUpload`

- [ ] **Step 3: 实现 StructuredEditor + ResumeUpload**

`apps/web/src/pages/StructuredEditor.tsx`:
```tsx
import type { StructuredResume } from '@aios/shared'
export function StructuredEditor({ value, onChange }: { value: StructuredResume; onChange: (v: StructuredResume) => void }) {
  const setBasics = (k: keyof StructuredResume['basics'], v: string) =>
    onChange({ ...value, basics: { ...value.basics, [k]: v } })
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="font-medium">基本信息</h3>
        {(['name','title','contact','summary'] as const).map(k => (
          <input key={k} aria-label={k} value={value.basics[k]} onChange={e => setBasics(k, e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1.5 text-sm" placeholder={k} />
        ))}
      </section>
      <p className="text-xs text-slate-500">工作/项目/技能等可继续在此编辑(逐分区受控);确认后才进入诊断。</p>
    </div>
  )
}
```
`apps/web/src/pages/ResumeUpload.tsx`:
```tsx
import { useState } from 'react'
import { api } from '../api'
import type { StructuredResume } from '@aios/shared'
import { StructuredEditor } from './StructuredEditor'

export function ResumeUpload({ onConfirmed }: { onConfirmed: (versionId: number) => void }) {
  const [versionId, setVersionId] = useState<number | null>(null)
  const [draft, setDraft] = useState<StructuredResume | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>('')

  async function onFile(file: File) {
    setBusy(true); setError('')
    try { const r = await api.uploadResume(file); setVersionId(r.versionId); setDraft(r.structured) }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function confirm() {
    if (!versionId || !draft) return
    setBusy(true); setError('')
    try { await api.updateVersion(versionId, draft); await api.confirmVersion(versionId); onConfirmed(versionId) }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4 max-w-2xl">
      <label className="block text-sm">上传简历(pdf/docx/md)
        <input type="file" accept=".pdf,.docx,.md" disabled={busy}
          onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} className="mt-2 block" /></label>
      {busy && <p className="text-sm text-slate-500">处理中…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {draft && (<>
        <p className="text-sm text-amber-600">请核对 AI 解析结果,修正后再确认 —— 确认后才能诊断。</p>
        <StructuredEditor value={draft} onChange={setDraft} />
        <button onClick={confirm} disabled={busy}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white">确认无误,进入诊断</button>
      </>)}
    </div>
  )
}
```
Modify `apps/web/src/App.tsx` main 区:
```tsx
import { CliBanner } from './components/CliBanner'
import { ResumeUpload } from './pages/ResumeUpload'
import { ResumeReview } from './pages/ResumeReview'
// 在组件内:
const [confirmedVersion, setConfirmedVersion] = useState<number | null>(null)
// header 下方:
<CliBanner />
<main className="p-6">
  {confirmedVersion === null
    ? <ResumeUpload onConfirmed={setConfirmedVersion} />
    : <ResumeReview versionId={confirmedVersion} onBack={() => setConfirmedVersion(null)} />}
</main>
```
(`ResumeReview` 在 Task 11 创建,其 `onOptimize` 在 Task 12 接入 `<ResumeCompare>`;若先跑本任务,临时用占位 `<div/>` 替换 `<ResumeReview .../>` 整行,并在 Task 11/12 替换为真实组件与完整 props。)

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- ResumeUpload`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 上传 + 强制校对关卡(确认后方可诊断)"
```

---

### Task 11: 诊断报告页(双视角 + 雷达图 + 建议↔原文联动)

**Files:**
- Create: `apps/web/src/pages/ResumeReview.tsx`
- Test: `apps/web/src/pages/ResumeReview.test.tsx`

**Interfaces:**
- Consumes: `api.review`(Task 8), `RadarChart`/`AsyncView`(Task 9), `Review`(Task 1)
- Produces:
  - `<ResumeReview versionId:number onBack onOptimize={(suggestions:Review['suggestions'])=>void} />`
  - 双视角 Tab(hr/interviewer);每视角:总分 + `<RadarChart>` + 建议列表;点击建议高亮其 `location`(通过 `data-loc` 属性 + 受控 `activeLoc` 状态)

- [ ] **Step 1: 写失败测试(渲染双视角总分 + 点击建议设置高亮)**

`apps/web/src/pages/ResumeReview.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { ResumeReview } from './ResumeReview'
import { api } from '../api'

const mk = (p: 'hr'|'interviewer', score: number) => ({ perspective:p, overallScore:score,
  dimensionScores:[{dimension:'layout',score,comment:''}],
  suggestions:[{location:'work[0]',severity:'high',issue:'缺量化',suggestion:'补数据'}] })

beforeEach(() => { vi.spyOn(api,'review').mockResolvedValue({ hr: mk('hr',80), interviewer: mk('interviewer',70) } as any) })

describe('ResumeReview', () => {
  it('renders both perspectives and highlights a clicked suggestion', async () => {
    const { getByText } = render(<ResumeReview versionId={2} onBack={()=>{}} onOptimize={()=>{}} />)
    await waitFor(() => getByText(/80/))
    fireEvent.click(getByText(/缺量化/))
    await waitFor(() => expect(getByText(/work\[0\]/)).toBeTruthy())
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- ResumeReview`
Expected: FAIL —无法导入 `./ResumeReview`

- [ ] **Step 3: 实现 ResumeReview**

`apps/web/src/pages/ResumeReview.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { api } from '../api'
import { RadarChart } from '../components/RadarChart'
import { AsyncView } from '../components/Async'
import type { Review } from '@aios/shared'

export function ResumeReview({ versionId, onBack, onOptimize }: {
  versionId: number; onBack: () => void; onOptimize: (s: Review['suggestions']) => void }) {
  const [state, setState] = useState<{ loading?: boolean; error?: string; data?: { hr: Review; interviewer: Review } }>({ loading: true })
  const [tab, setTab] = useState<'hr'|'interviewer'>('hr')
  const [activeLoc, setActiveLoc] = useState<string>('')

  useEffect(() => { api.review(versionId)
    .then(data => setState({ data })).catch(e => setState({ error: e.message })) }, [versionId])

  return (
    <AsyncView state={state}>{(data) => {
      const r = data[tab]
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="text-sm text-slate-500">← 返回</button>
            {(['hr','interviewer'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded px-3 py-1 text-sm ${tab===t?'bg-blue-600 text-white':'bg-slate-200 dark:bg-slate-800'}`}>
                {t==='hr'?'HR 视角':'面试官视角'}</button>))}
          </div>
          <div className="text-2xl font-semibold">总分 {r.overallScore}</div>
          <RadarChart scores={r.dimensionScores} />
          <ul className="space-y-2">
            {r.suggestions.map((s, i) => (
              <li key={i} onClick={() => setActiveLoc(s.location)}
                className={`cursor-pointer rounded border p-3 text-sm ${activeLoc===s.location?'border-blue-500 bg-blue-50 dark:bg-blue-950/40':'border-slate-200 dark:border-slate-800'}`}>
                <span className="mr-2 text-xs text-slate-400" data-loc={s.location}>{s.location}</span>
                <strong>{s.issue}</strong> — {s.suggestion}</li>))}
          </ul>
          <button onClick={() => onOptimize(r.suggestions)}
            className="rounded bg-emerald-600 px-4 py-2 text-sm text-white">根据建议生成优化版</button>
        </div>)
    }}</AsyncView>
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- ResumeReview`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 诊断报告页 — 双视角/雷达图/建议高亮联动"
```

---

### Task 12: 优化对比页 + 仪表盘骨架 + 端到端冒烟

**Files:**
- Create: `apps/web/src/pages/ResumeCompare.tsx`, `pages/Dashboard.tsx`
- Modify: `apps/web/src/App.tsx`(接入 optimize 流程 + 顶部导航切 Dashboard/简历大师)
- Test: `apps/web/src/pages/ResumeCompare.test.tsx`

**Interfaces:**
- Consumes: `api.optimize`(Task 8), `StructuredEditor`(Task 10,只读展示复用), `Review`/`StructuredResume`(Task 1)
- Produces:
  - `<ResumeCompare baseVersionId suggestions onSaved />` — 调 `api.optimize`,生成中显示骨架屏,左右分栏展示原版 vs 优化版结构化内容
  - `<Dashboard />` — Offer Readiness 卡片骨架(简历质量维度可用,其余标"待解锁")

- [ ] **Step 1: 写失败测试(优化中显示骨架→出结果后左右两栏)**

`apps/web/src/pages/ResumeCompare.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { ResumeCompare } from './ResumeCompare'
import { api } from '../api'

const opt = { basics:{name:'A+',title:'T',contact:'c',summary:'更专业'}, education:[],work:[],projects:[],skills:[],awards:[] }
beforeEach(() => { vi.spyOn(api,'optimize').mockResolvedValue({ versionId:9, structured: opt } as any) })

describe('ResumeCompare', () => {
  it('shows skeleton then renders optimized result', async () => {
    const base = { basics:{name:'A',title:'T',contact:'c',summary:'普通'}, education:[],work:[],projects:[],skills:[],awards:[] }
    const { getByText } = render(<ResumeCompare baseVersionId={2} base={base as any} suggestions={[]} onSaved={()=>{}} />)
    expect(getByText(/生成中/)).toBeTruthy()
    await waitFor(() => expect(getByText(/更专业/)).toBeTruthy())
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- ResumeCompare`
Expected: FAIL —无法导入 `./ResumeCompare`

- [ ] **Step 3: 实现 ResumeCompare + Dashboard**

`apps/web/src/pages/ResumeCompare.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { StructuredResume, Review } from '@aios/shared'

function Pane({ title, r }: { title: string; r: StructuredResume }) {
  return <div className="flex-1 rounded border border-slate-200 dark:border-slate-800 p-3">
    <h3 className="mb-2 font-medium">{title}</h3>
    <p className="text-sm font-semibold">{r.basics.name} · {r.basics.title}</p>
    <p className="text-sm text-slate-500">{r.basics.summary}</p>
  </div>
}
export function ResumeCompare({ baseVersionId, base, suggestions, onSaved }: {
  baseVersionId: number; base: StructuredResume; suggestions: Review['suggestions']; onSaved: (versionId: number) => void }) {
  const [opt, setOpt] = useState<StructuredResume | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api.optimize(baseVersionId, suggestions)
    .then(r => { setOpt(r.structured); onSaved(r.versionId) })
    .catch(e => setError(e.message)) }, [baseVersionId])
  if (error) return <p className="text-sm text-red-500">{error}</p>
  return <div className="flex gap-4">
    <Pane title="原版" r={base} />
    {opt ? <Pane title="优化版(已保存)" r={opt} />
         : <div className="flex-1 animate-pulse rounded border border-slate-200 dark:border-slate-800 p-3 text-sm text-slate-400">优化版生成中…</div>}
  </div>
}
```
`apps/web/src/pages/Dashboard.tsx`:
```tsx
export function Dashboard() {
  return <div className="grid gap-4 sm:grid-cols-2">
    <div className="rounded border border-slate-200 dark:border-slate-800 p-4">
      <h3 className="font-medium">Offer Readiness</h3>
      <p className="mt-2 text-sm text-slate-500">简历质量:已接入 · 其他能力维度待解锁(后续阶段)</p>
    </div>
    <div className="rounded border border-slate-200 dark:border-slate-800 p-4 text-sm text-slate-400">
      今日训练任务 — 待解锁</div>
  </div>
}
```
Modify `App.tsx`:加入顶部导航(`dashboard`/`resume` 切换)、把 Task 11 的 `onOptimize` 接到渲染 `<ResumeCompare>`,并提供「数据导出」链接 `<a href="/api/export">导出数据</a>`。完整流程:upload→confirm→review→(点优化)→compare。

- [ ] **Step 4: 运行测试确认通过 + 全量测试**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 5: 端到端冒烟(真实 CLI,验证性能可行性)**

```bash
npm run dev   # 起前后端
# 浏览器开 http://127.0.0.1:5180,用真实简历跑:上传→校对确认→双诊断→优化对比
# 观察:单次诊断/优化端到端耗时与本机 CPU/内存
```
Expected: 流程跑通;若 CLI 延迟/资源不可接受,按 spec §8 切换到 ApiKeyProvider(新增 `apps/server/src/ai/api-key.ts` 实现同 `AiProvider` 接口,经 env 切换 `getAi`),业务零改。记录实测结论。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: 优化对比页 + 仪表盘骨架 + 端到端冒烟;第一阶段完成"
```

---

## 实施顺序与依赖

Task 1 → 2 → 3 → 4(后端基础)→ 5 → 6(服务)→ 7(HTTP)→ 8 → 9(前端基础)→ 10 → 11 → 12(页面闭环)。严格按序;每个 Task 自带测试与提交。






