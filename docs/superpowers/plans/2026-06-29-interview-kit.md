# 阶段三实现计划:面试材料生成(讲述型)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于结构化简历(可选绑 JD)生成讲述型面试材料 —— 自我介绍(30秒/1-2分钟两版)+ 每个项目的 STAR 讲解模板。

**Architecture:** 沿用现有 monorepo:packages/shared 加 InterviewKit zod 模型;apps/server 加 interview_kits 表 + generateKit 服务 + /api/kits 路由;apps/web 加 generateKit api + InterviewKit 页,在诊断页加入口。纯新增,完全向后兼容。

**Tech Stack:** TypeScript + zod(shared);Express + node:sqlite(server);React + Vite + Tailwind(web);Vitest;AI 经 ClaudeCliProvider/completeJson 适配层。

## Global Constraints

- AI 调用**只**经 `AiProvider` 适配层;返回 JSON **必须** zod 校验,失败重试一次再降级报错(沿用 `completeJson`)。材料包**非流式**整包返回(避免残缺 JSON)。
- 真实性约束:prompt **必须**要求不编造简历中没有的经历;项目讲解严格基于简历已有内容。
- SQLite **全程参数化**;后端只绑 `127.0.0.1`;AI 输出当不可信数据,前端**不用** `dangerouslySetInnerHTML`。
- 生成材料前 version 必须 `status === 'confirmed'`,否则 HTTP 409;version 不存在 404;未知 jobDescriptionId 404。
- TypeScript 严格模式;**不破坏现有 45 个测试**。
- node:sqlite:`import { DatabaseSync } from 'node:sqlite'`;`db.exec('CREATE TABLE IF NOT EXISTS ...')`;`prepare().run/get/all`。
- 前端组件测试首行 `// @vitest-environment jsdom`;沿用根 vitest.config.ts(node:sqlite shim + afterEach cleanup)。
- 本阶段**只做讲述型**:自我介绍 + 项目讲解。**不做** HR/技术 Q&A、追问、对练(归模块四/五)。

## 文件结构

```
packages/shared/src/
  kit.ts                   # 新增:InterviewKitSchema + 类型
  index.ts                 # 修改:导出 kit
apps/server/src/
  db/connection.ts         # 修改:建 interview_kits 表
  db/repo.ts               # 修改:createKit/getKit;exportAll 加表
  prompts/kit.txt          # 新增:通用材料 prompt
  prompts/kit-with-jd.txt  # 新增:岗位定制 prompt
  services/kit.ts          # 新增:generateKit
  routes/kits.ts           # 新增:POST /api/kits
  index.ts                 # 修改:挂载 kitsRouter
apps/web/src/
  api.ts                   # 修改:generateKit
  pages/InterviewKit.tsx   # 新增:材料展示页(复制按钮)
  pages/ResumeReview.tsx   # 修改:加「生成面试材料」入口
  App.tsx                  # 修改:接入材料页流转
```

实施顺序:Task 1(shared)→ 2(数据层)→ 3(服务)→ 4(路由)→ 5(api+材料页)→ 6(诊断页入口+流转+冒烟)。

---

### Task 1: 共享数据模型(InterviewKit)

**Files:**
- Create: `packages/shared/src/kit.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/kit.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `InterviewKitSchema`(zod)+ 类型 `InterviewKit`:`{ selfIntro:{ short:string, standard:string }, projectPitches: Array<{ projectName:string, situation:string, task:string, action:string, result:string }> }`

- [ ] **Step 1: 写失败测试**

`packages/shared/src/kit.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { InterviewKitSchema } from './kit'

describe('InterviewKitSchema', () => {
  it('accepts a valid kit', () => {
    const k = { selfIntro:{ short:'30秒', standard:'1-2分钟' },
      projectPitches:[{ projectName:'P', situation:'S', task:'T', action:'A', result:'R' }] }
    expect(InterviewKitSchema.parse(k)).toEqual(k)
  })
  it('accepts empty projectPitches', () => {
    const k = { selfIntro:{ short:'a', standard:'b' }, projectPitches:[] }
    expect(InterviewKitSchema.parse(k)).toEqual(k)
  })
  it('rejects missing selfIntro.standard', () => {
    expect(() => InterviewKitSchema.parse({ selfIntro:{ short:'a' }, projectPitches:[] })).toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- kit`
Expected: FAIL — 无法导入 `./kit`

- [ ] **Step 3: 实现**

`packages/shared/src/kit.ts`:
```ts
import { z } from 'zod'
export const InterviewKitSchema = z.object({
  selfIntro: z.object({ short: z.string(), standard: z.string() }),
  projectPitches: z.array(z.object({
    projectName: z.string(),
    situation: z.string(),
    task: z.string(),
    action: z.string(),
    result: z.string(),
  })),
})
export type InterviewKit = z.infer<typeof InterviewKitSchema>
```
`packages/shared/src/index.ts` 增加:
```ts
export * from './kit'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- kit`
Expected: PASS(3 passed)

- [ ] **Step 5: 全量回归 + 提交**

Run: `npm test`
Expected: 全部 PASS(现有 45 个仍绿)
```bash
git add packages/shared/src/kit.ts packages/shared/src/kit.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): InterviewKit 面试材料模型"
```

---

### Task 2: 数据层(interview_kits 表 + repo)

**Files:**
- Modify: `apps/server/src/db/connection.ts`
- Modify: `apps/server/src/db/repo.ts`
- Test: `apps/server/src/db/repo.test.ts`(追加)

**Interfaces:**
- Consumes: `InterviewKit`/`InterviewKitSchema`(Task 1), 现有 `openDb`/`createResume`/`createVersion`
- Produces:
  - `createKit(db, {resumeVersionId, jobDescriptionId, kit:InterviewKit}): number`(jobDescriptionId 可为 null)
  - `getKit(db, id): { id, resumeVersionId, jobDescriptionId:number|null, kit:InterviewKit } | undefined`(读回 zod 校验)
  - `exportAll` 增加 `interviewKits`

- [ ] **Step 1: 写失败测试(追加到 repo.test.ts)**

```ts
import { createKit, getKit } from './repo'  // 加入现有 import

describe('interview_kits repo', () => {
  const kit = { selfIntro:{ short:'a', standard:'b' },
    projectPitches:[{ projectName:'P', situation:'S', task:'T', action:'A', result:'R' }] }
  it('round-trips a kit with jd', () => {
    const db = openDb(':memory:')
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null, structured:sample, status:'confirmed' })
    const id = createKit(db, { resumeVersionId: vid, jobDescriptionId: null, kit })
    const got = getKit(db, id)!
    expect(got.kit.selfIntro.short).toBe('a')
    expect(got.jobDescriptionId).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- repo`
Expected: FAIL — createKit/getKit 未定义

- [ ] **Step 3: 迁移(connection.ts)**

在 `migrate()` 的 SQL 中追加:
```ts
  db.exec(`
    CREATE TABLE IF NOT EXISTS interview_kits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id),
      job_description_id INTEGER,
      kit_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')));
  `)
```

- [ ] **Step 4: repo.ts 新增**

```ts
import { InterviewKitSchema, type InterviewKit } from '@aios/shared'

export function createKit(db: DatabaseSync, k: { resumeVersionId:number; jobDescriptionId:number|null; kit:InterviewKit }): number {
  return Number(db.prepare('INSERT INTO interview_kits (resume_version_id,job_description_id,kit_json) VALUES (?,?,?)')
    .run(k.resumeVersionId, k.jobDescriptionId, JSON.stringify(k.kit)).lastInsertRowid)
}
export function getKit(db: DatabaseSync, id: number) {
  const row = db.prepare('SELECT id,resume_version_id,job_description_id,kit_json FROM interview_kits WHERE id=?').get(id) as any
  if (!row) return undefined
  return { id: row.id, resumeVersionId: row.resume_version_id, jobDescriptionId: row.job_description_id ?? null,
    kit: InterviewKitSchema.parse(JSON.parse(row.kit_json)) }
}
```
`exportAll` 增加:`interviewKits: db.prepare('SELECT * FROM interview_kits').all()`。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- repo`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/db/connection.ts apps/server/src/db/repo.ts apps/server/src/db/repo.test.ts
git commit -m "feat(server): interview_kits 表 + repo"
```

---

### Task 3: 材料生成服务(generateKit,可选绑 JD)

**Files:**
- Create: `apps/server/src/prompts/kit.txt`, `apps/server/src/prompts/kit-with-jd.txt`
- Create: `apps/server/src/services/kit.ts`
- Test: `apps/server/src/services/kit.test.ts`

**Interfaces:**
- Consumes: `AiProvider`, `completeJson`, `InterviewKitSchema`, `StructuredResume`, `JobDescription`
- Produces:
  - `generateKit(ai: AiProvider, resume: StructuredResume, jd?: JobDescription): Promise<InterviewKit>`(无 jd → kit.txt;有 jd → kit-with-jd.txt,JD 注入 prompt)

- [ ] **Step 1: 写失败测试**

`apps/server/src/services/kit.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { generateKit } from './kit'

const kitOut = JSON.stringify({ selfIntro:{ short:'30秒', standard:'1-2分钟' },
  projectPitches:[{ projectName:'P', situation:'S', task:'T', action:'A', result:'R' }] })
const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] } as any
const sampleJd = { role:'后端', company:'', keywords:['Go'], responsibilities:[], requirements:{must:[],nice:[]} } as any

describe('generateKit', () => {
  it('returns a validated kit without jd', async () => {
    const ai: AiProvider = { async complete(){return kitOut}, async *stream(){yield kitOut} }
    const k = await generateKit(ai, sample)
    expect(k.selfIntro.short).toBe('30秒')
  })
  it('selects the jd prompt and injects JD when jd given', async () => {
    let captured = ''
    const ai: AiProvider = { async complete(o){ captured = o.system + '\n' + o.prompt; return kitOut }, async *stream(o){ yield await this.complete(o) } }
    await generateKit(ai, sample, sampleJd)
    expect(captured).toContain('目标岗位')        // kit-with-jd.txt 含此短语
    expect(captured).toContain('JD JSON')          // JD 注入 prompt body
  })
  it('throws on non-schema output', async () => {
    const ai: AiProvider = { async complete(){return '{"bad":1}'}, async *stream(){yield '{"bad":1}'} }
    await expect(generateKit(ai, sample)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- services/kit`
Expected: FAIL — 无法导入 `./kit`

- [ ] **Step 3: 写 prompts + 实现**

`apps/server/src/prompts/kit.txt`:
```
你是面试辅导专家。基于用户的结构化简历,生成讲述型面试材料。
严格要求:
1. 只输出 JSON,无解释、无 markdown 围栏。
2. 不得编造简历中不存在的经历、项目或数据;只基于简历已有内容组织表达。
3. selfIntro.short 为约 30 秒(口语,突出最强亮点);selfIntro.standard 为约 1-2 分钟(背景→能力→亮点→求职意向)。
4. projectPitches:为简历中每个项目各生成一份 STAR 讲解(situation 情境/task 任务/action 我的行动/result 结果与量化)。projectName 用简历中的项目名。
5. JSON 结构:
{ "selfIntro":{ "short":"", "standard":"" },
  "projectPitches":[{ "projectName":"", "situation":"", "task":"", "action":"", "result":"" }] }
```
`apps/server/src/prompts/kit-with-jd.txt`:
```
你是面试辅导专家。基于用户的结构化简历与目标岗位 JD,生成针对该岗位定制的讲述型面试材料。
严格要求:
1. 只输出 JSON,无解释、无 markdown 围栏。
2. 不得编造简历中不存在的经历;只基于简历已有内容组织表达,但在表达上向目标岗位靠拢。
3. selfIntro 突出与目标岗位匹配的能力与亮点;standard 版结尾点明对该岗位的求职意向。
4. projectPitches:为每个项目生成 STAR 讲解,action/result 侧重与 JD 相关的技术与成果。
5. JSON 结构与通用版一致:
{ "selfIntro":{ "short":"", "standard":"" },
  "projectPitches":[{ "projectName":"", "situation":"", "task":"", "action":"", "result":"" }] }
```
`apps/server/src/services/kit.ts`:
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import { completeJson } from '../ai/claude-cli'
import { InterviewKitSchema, type InterviewKit, type StructuredResume, type JobDescription } from '@aios/shared'

const dir = dirname(fileURLToPath(import.meta.url))
const PROMPT = readFileSync(join(dir, '../prompts/kit.txt'), 'utf8')
const PROMPT_JD = readFileSync(join(dir, '../prompts/kit-with-jd.txt'), 'utf8')

export function generateKit(ai: AiProvider, resume: StructuredResume, jd?: JobDescription): Promise<InterviewKit> {
  const system = jd ? PROMPT_JD : PROMPT
  const prompt = jd
    ? `JD JSON:\n${JSON.stringify(jd)}\n\n简历JSON:\n${JSON.stringify(resume)}`
    : `简历JSON:\n${JSON.stringify(resume)}`
  return completeJson(ai, InterviewKitSchema, { system, prompt })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- services/kit`
Expected: PASS(3 passed)

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/prompts/kit.txt apps/server/src/prompts/kit-with-jd.txt apps/server/src/services/kit.ts apps/server/src/services/kit.test.ts
git commit -m "feat(server): 面试材料生成服务 generateKit(可选绑 JD)"
```

---

### Task 4: 路由(POST /api/kits)

**Files:**
- Create: `apps/server/src/routes/kits.ts`
- Modify: `apps/server/src/index.ts`(挂载)
- Test: 追加到 `apps/server/src/routes/resumes.test.ts`(沿用其 supertest/openDb/createApp 与 smartAi 模式)

**Interfaces:**
- Consumes: `generateKit`(Task 3), `getVersion`/`getJd`/`createKit`(Task 2), `HttpError`
- Produces:
  - `kitsRouter(db, ai): Router`
  - `POST /api/kits`(body `{versionId, jobDescriptionId?}`):version 不存在 404;未 confirmed 409;有 jobDescriptionId 但 JD 不存在 404;正常 → generateKit → createKit → `{ id, kit }`

- [ ] **Step 1: 写失败测试(追加 describe 到 resumes.test.ts)**

```ts
import { createJd } from '../db/repo'

function kitAi(): AiProvider {
  const parsed = JSON.stringify({ basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] })
  const kit = JSON.stringify({ selfIntro:{ short:'30秒', standard:'1-2分钟' }, projectPitches:[] })
  return {
    async complete(o) {
      if (o.system.includes('简历解析器')) return parsed   // parse.txt
      return kit                                          // kit.txt / kit-with-jd.txt
    },
    async *stream(o){ yield await this.complete(o) },
  }
}

describe('kit routes', () => {
  it('rejects kit before confirm with 409', async () => {
    const db = openDb(':memory:'); const app = createApp(db, kitAi())
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    const res = await request(app).post('/api/kits').send({ versionId: up.body.versionId })
    expect(res.status).toBe(409)
  })
  it('generates a kit after confirm', async () => {
    const db = openDb(':memory:'); const app = createApp(db, kitAi())
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    await request(app).post(`/api/resumes/versions/${up.body.versionId}/confirm`)
    const res = await request(app).post('/api/kits').send({ versionId: up.body.versionId })
    expect(res.status).toBe(200)
    expect(res.body.kit.selfIntro.short).toBe('30秒')
  })
  it('404 on unknown jobDescriptionId', async () => {
    const db = openDb(':memory:'); const app = createApp(db, kitAi())
    const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
    await request(app).post(`/api/resumes/versions/${up.body.versionId}/confirm`)
    const res = await request(app).post('/api/kits').send({ versionId: up.body.versionId, jobDescriptionId: 999 })
    expect(res.status).toBe(404)
  })
})
```
> 注意:parse.txt 的 system 含「简历解析器」(确认实现时该 prompt 含此词;阶段一 parse.txt 首句为"你是简历解析器")。kit prompt 不含该词,故按此分辨。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- resumes`
Expected: FAIL — /api/kits 404(未挂载)

- [ ] **Step 3: 实现路由**

`apps/server/src/routes/kits.ts`:
```ts
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
```

- [ ] **Step 4: 挂载到 index.ts**

```ts
import { kitsRouter } from './routes/kits'
// 在 createApp 内:
  app.use('/api', kitsRouter(db, ai))
```

- [ ] **Step 5: 运行测试确认通过 + 全量回归**

Run: `npm test`
Expected: 全部 PASS(含 3 个 kit 用例)

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/routes/kits.ts apps/server/src/index.ts apps/server/src/routes/resumes.test.ts
git commit -m "feat(server): /api/kits 路由 — 生成面试材料(confirmed 门禁 + 可选 JD)"
```

---

### Task 5: 前端 api + 面试材料页

**Files:**
- Modify: `apps/web/src/api.ts`
- Create: `apps/web/src/pages/InterviewKit.tsx`
- Test: `apps/web/src/pages/InterviewKit.test.tsx`

**Interfaces:**
- Consumes: 后端 `/api/kits`(Task 4);类型 `InterviewKit`(Task 1);`Card`/`Button`(现有 ui.tsx);`AsyncView`(现有)
- Produces:
  - `api.generateKit(versionId:number, jobDescriptionId?:number): Promise<{id:number; kit:InterviewKit}>`
  - `<InterviewKit versionId:number jobDescriptionId:number|null onBack:()=>void />` — 挂载即调 generateKit,骨架屏 → 渲染自我介绍(两卡片 + 复制)+ 项目讲解(STAR 卡片 + 复制)

- [ ] **Step 1: 改 api(被材料页测试覆盖)**

`apps/web/src/api.ts` 加(保留其余):
```ts
import type { StructuredResume, Review, JobDescription, GapAnalysis, InterviewKit } from '@aios/shared'
// ... 现有方法保留 ...
  generateKit: (versionId: number, jobDescriptionId?: number) =>
    j<{id:number; kit:InterviewKit}>('/api/kits',
      json(jobDescriptionId == null ? { versionId } : { versionId, jobDescriptionId })),
```
> 若 `GapAnalysis` 已在 import,合并即可;不要重复声明。

- [ ] **Step 2: 写失败测试**

`apps/web/src/pages/InterviewKit.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { InterviewKit } from './InterviewKit'
import { api } from '../api'

const kit = { selfIntro:{ short:'三十秒介绍', standard:'两分钟介绍' },
  projectPitches:[{ projectName:'我的项目', situation:'背景', task:'任务', action:'行动', result:'结果' }] }

beforeEach(() => { vi.spyOn(api,'generateKit').mockResolvedValue({ id:1, kit } as any) })

describe('InterviewKit', () => {
  it('shows skeleton then renders self-intro and project pitch', async () => {
    const { getByText, findByText } = render(<InterviewKit versionId={2} jobDescriptionId={null} onBack={()=>{}} />)
    expect(getByText(/生成中/)).toBeTruthy()
    await findByText(/三十秒介绍/)
    expect(getByText(/两分钟介绍/)).toBeTruthy()
    expect(getByText(/我的项目/)).toBeTruthy()
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- InterviewKit`
Expected: FAIL — 无法导入 `./InterviewKit`

- [ ] **Step 4: 实现材料页**

`apps/web/src/pages/InterviewKit.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, Button } from '../components/ui'
import { ChevronLeft, Copy } from 'lucide-react'
import type { InterviewKit as Kit } from '@aios/shared'

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }}
      className="flex cursor-pointer items-center gap-1 text-xs text-muted hover:text-text"
    >
      <Copy size={13} /> {done ? '已复制' : '复制'}
    </button>
  )
}

export function InterviewKit({ versionId, jobDescriptionId, onBack }: {
  versionId: number; jobDescriptionId: number | null; onBack: () => void
}) {
  const [state, setState] = useState<{ loading?: boolean; error?: string; kit?: Kit }>({ loading: true })
  useEffect(() => {
    api.generateKit(versionId, jobDescriptionId ?? undefined)
      .then(r => setState({ kit: r.kit })).catch(e => setState({ error: e.message }))
  }, [versionId, jobDescriptionId])

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex cursor-pointer items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft size={15} /> 返回
      </button>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">面试材料</h1>
        <p className="mt-1 text-sm text-muted">基于你的简历{jobDescriptionId != null ? '与目标岗位' : ''}生成的自我介绍与项目讲解模板。</p>
      </div>

      {state.loading && (
        <div className="space-y-3">
          <div className="skeleton h-24 w-full rounded-card" />
          <div className="skeleton h-40 w-full rounded-card" />
          <p className="text-center text-sm text-muted">生成中,约需 1 分钟…</p>
        </div>
      )}
      {state.error && (
        <div className="rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">生成失败：{state.error}</div>
      )}

      {state.kit && (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-text">自我介绍</h2>
            <Card className="space-y-2 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted">30 秒版</span>
                <CopyBtn text={state.kit.selfIntro.short} />
              </div>
              <p className="whitespace-pre-line text-sm text-text">{state.kit.selfIntro.short}</p>
            </Card>
            <Card className="space-y-2 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted">1-2 分钟版</span>
                <CopyBtn text={state.kit.selfIntro.standard} />
              </div>
              <p className="whitespace-pre-line text-sm text-text">{state.kit.selfIntro.standard}</p>
            </Card>
          </section>

          {state.kit.projectPitches.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-text">项目讲解（STAR）</h2>
              {state.kit.projectPitches.map((p, i) => (
                <Card key={i} className="space-y-3 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-text">{p.projectName}</h3>
                    <CopyBtn text={`${p.projectName}\n情境：${p.situation}\n任务：${p.task}\n行动：${p.action}\n结果：${p.result}`} />
                  </div>
                  {([['情境', p.situation], ['任务', p.task], ['行动', p.action], ['结果', p.result]] as const).map(([label, val]) => (
                    <div key={label}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-faint">{label}</p>
                      <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{val}</p>
                    </div>
                  ))}
                </Card>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- InterviewKit`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/api.ts apps/web/src/pages/InterviewKit.tsx apps/web/src/pages/InterviewKit.test.tsx
git commit -m "feat(web): api generateKit + 面试材料页(自我介绍/项目讲解/复制)"
```

---

### Task 6: 诊断页入口 + App 流转 + 端到端冒烟

**Files:**
- Modify: `apps/web/src/pages/ResumeReview.tsx`(加「生成面试材料」按钮 + 透传当前 jdId)
- Modify: `apps/web/src/App.tsx`(接入材料页流转)
- Test: `apps/web/src/pages/ResumeReview.test.tsx`(追加入口回调用例)

**Interfaces:**
- Consumes: `InterviewKit` 页(Task 5)
- Produces:
  - ResumeReview 新增可选 prop `onGenerateKit?: (jobDescriptionId: number | null) => void`;结果区按钮点击时回调当前绑定的 jdId(诊断时选的 JD;无则 null)
  - App.tsx:新增 `kitFor: { versionId:number; jdId:number|null } | null` 状态;ResumeReview 的 onGenerateKit 设置它 → 渲染 `<InterviewKit>`;返回时清空

- [ ] **Step 1: 写失败测试(追加到 ResumeReview.test.tsx)**

```ts
it('calls onGenerateKit with the bound jd when clicking the kit button', async () => {
  const withGap = { hr:{ perspective:'hr', overallScore:70, dimensionScores:[{dimension:'layout',score:70,comment:''}], suggestions:[] },
    interviewer:{ perspective:'interviewer', overallScore:70, dimensionScores:[{dimension:'layout',score:70,comment:''}], suggestions:[] } }
  vi.spyOn(api,'review').mockResolvedValue(withGap as any)
  const onGenerateKit = vi.fn()
  const { getByText, findByText } = render(
    <ResumeReview versionId={2} onBack={()=>{}} onOptimize={()=>{}} onGenerateKit={onGenerateKit} />)
  fireEvent.click(getByText(/开始诊断/))
  await findByText(/总分|70/)
  fireEvent.click(getByText(/生成面试材料/))
  expect(onGenerateKit).toHaveBeenCalledWith(null)  // 本用例未选 JD
})
```
(`api`/`vi`/`render`/`fireEvent`/ResizeObserver polyfill/jsdom pragma 沿用文件已有。)

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- ResumeReview`
Expected: FAIL — 无「生成面试材料」按钮 / onGenerateKit prop

- [ ] **Step 3: 改 ResumeReview**

`ResumeReview` 的 props 加可选 `onGenerateKit?: (jobDescriptionId: number | null) => void`。组件内已有 `jdId` 状态(阶段二:开始诊断前选的 JD)。在结果区「根据建议生成优化版」按钮旁加:
```tsx
{onGenerateKit && (
  <Button variant="secondary" onClick={() => onGenerateKit(jdId)}>
    生成面试材料
  </Button>
)}
```
(放在优化按钮所在的 `flex justify-end` 容器里,与之并列。)

- [ ] **Step 4: 改 App.tsx 接入流转**

在 App 的状态机加:
```tsx
import { InterviewKit } from './pages/InterviewKit'
// 状态:
const [kitFor, setKitFor] = useState<{ versionId: number; jdId: number | null } | null>(null)
```
`resetFlow()` 内增加 `setKitFor(null)`。在 `renderResume()` 中,优先判断 kit:
```tsx
if (kitFor) {
  return <InterviewKit versionId={kitFor.versionId} jobDescriptionId={kitFor.jdId} onBack={() => setKitFor(null)} />
}
```
并把 ResumeReview 用法补上回调:
```tsx
<ResumeReview
  versionId={confirmedVersion}
  onBack={resetFlow}
  onOptimize={setOptimizeSuggestions}
  onGenerateKit={(jdId) => setKitFor({ versionId: confirmedVersion!, jdId })}
/>
```
> `kitFor` 判断放在 optimize 分支之前或之后均可,但要在 `confirmedVersion === null` 之后。确保返回后能回到诊断结果。

- [ ] **Step 5: 运行测试确认通过 + 全量回归 + 构建**

Run: `npm test`
Expected: 全部 PASS。
再跑 `npx tsc --noEmit -p apps/web/tsconfig.json`(0 错)+ `npm run build --workspace=apps/web`(成功)。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/pages/ResumeReview.tsx apps/web/src/App.tsx apps/web/src/pages/ResumeReview.test.tsx
git commit -m "feat(web): 诊断页生成面试材料入口 + App 流转"
```

- [ ] **Step 7: 端到端冒烟(真机,控制者执行,不交子代理)**

重启后端,用已确认的简历版本:`POST /api/kits {versionId}`(通用)与 `{versionId, jobDescriptionId}`(绑 JD)各跑一次。验证:返回 selfIntro(short/standard)+ 每个项目的 STAR projectPitches;内容真实(项目名与简历一致,无编造);耗时可接受。记录到进度账本。

---

## 实施顺序与依赖

Task 1(shared)→ 2(数据层)→ 3(服务)→ 4(路由)→ 5(前端 api+材料页)→ 6(诊断页入口+流转+冒烟)。严格按序;每个 Task 自带测试与提交。Task 6 真机冒烟由控制者完成。


