# 阶段二实现计划:JD 分析 + 岗位维度解锁

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已完成的简历大师之上,新增 JD(岗位描述)实体与解析,并让诊断可选绑定 JD —— 绑定时解锁岗位匹配/ATS/关键词覆盖 3 个维度(凑齐 8 维)并产出简历↔JD 缺口分析。

**Architecture:** 沿用现有 monorepo:packages/shared 加 JD/缺口 zod 模型并把 DimensionKey 扩到 8 个;apps/server 加 job_descriptions 表 + JD/缺口/带 JD 诊断服务 + JD 路由 + reviews 路由扩展;apps/web 诊断页加 JD 选择器与缺口卡片。全部向后兼容(新列可空、维度并集、ALTER TABLE 迁移)。

**Tech Stack:** TypeScript + zod(shared);Express + node:sqlite(server);React + Vite + Tailwind(web);Vitest;AI 经 ClaudeCliProvider/completeJson 适配层。

## Global Constraints

- AI 调用**只**经 `AiProvider` 适配层;返回 JSON **必须** zod 校验,失败重试一次再降级报错,绝不静默崩溃(沿用 `completeJson`)。
- SQLite **全程参数化查询**;多步写操作用 `transaction(db, fn)` 助手(阶段一已存在于 `apps/server/src/db/repo.ts`)。
- 诊断 version 必须 `status === 'confirmed'`,否则 HTTP 409(沿用)。
- 后端只绑 `127.0.0.1`;AI 输出当不可信数据,前端渲染不使用 `dangerouslySetInnerHTML`。
- TypeScript 严格模式(`strict: true`)。
- **不破坏现有 25 个测试**;不绑 JD 的旧诊断流程行为完全不变(回归)。
- 维度约定:无 JD → 只 5 个 base 维度;有 JD → 8 个维度。校验放宽为「dimension 必属于 8 个之一」,数量不强制。
- 优化/改写简历**不在本阶段**;本阶段只做分析与诊断。
- node:sqlite:`import { DatabaseSync } from 'node:sqlite'`;`db.exec('PRAGMA ...')`(无 `.pragma()`);`prepare().run/get/all`;迁移用 `CREATE TABLE IF NOT EXISTS` + 幂等 `ALTER TABLE ADD COLUMN`。
- 前端组件测试文件首行加 `// @vitest-environment jsdom`;recharts 测试需 `globalThis.ResizeObserver` polyfill(沿用阶段一写法)。

## 文件结构

```
packages/shared/src/
  jd.ts                    # 新增:JobDescriptionSchema, GapAnalysisSchema + 类型
  review.ts                # 修改:DIMENSIONS 扩到 8(base 5 + jd 3)
  index.ts                 # 修改:导出 jd
apps/server/src/
  db/connection.ts         # 修改:建 job_descriptions 表 + reviews 加列(幂等)
  db/repo.ts               # 修改:createJd/getJd/listJds;createReview 扩展;exportAll 加表
  prompts/jd.txt           # 新增
  prompts/gap.txt          # 新增
  prompts/review-with-jd.txt # 新增
  services/jd.ts           # 新增:parseJd, analyzeGap
  services/review.ts       # 修改:reviewResume 接受可选 jd
  routes/jds.ts            # 新增:POST/GET /api/jds
  routes/reviews.ts        # 修改:支持 jobDescriptionId + gap
  index.ts                 # 修改:挂载 jdsRouter
apps/web/src/
  api.ts                   # 修改:createJd/listJds;review 加可选 jdId
  pages/JdSelector.tsx     # 新增:目标岗位选择/新增
  pages/ResumeReview.tsx   # 修改:JD 选择器 + 8 维 + 缺口卡片
```

实施顺序:Task 1(shared)→ 2(数据层)→ 3(JD/缺口服务)→ 4(诊断服务扩展)→ 5(JD 路由)→ 6(reviews 路由扩展)→ 7(api+JD 选择器)→ 8(诊断页缺口卡片 + 端到端冒烟)。

---

### Task 1: 共享数据模型(JD + 缺口 + 8 维)

**Files:**
- Create: `packages/shared/src/jd.ts`
- Modify: `packages/shared/src/review.ts`(扩 DIMENSIONS)
- Modify: `packages/shared/src/index.ts`(导出 jd)
- Test: `packages/shared/src/jd.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `JobDescriptionSchema`(zod)+ 类型 `JobDescription`:`{ role:string, company:string, keywords:string[], responsibilities:string[], requirements:{ must:string[], nice:string[] } }`
  - `GapAnalysisSchema`(zod)+ 类型 `GapAnalysis`:`{ matchScore:number(0-100), missingKeywords:string[], weakRequirements:string[], coveredHighlights:string[] }`
  - `review.ts` 导出更新:`DIMENSIONS_BASE=['layout','professionalism','star','quantification','techDepth']`、`DIMENSIONS_JD=['jobMatch','ats','keywordCoverage']`、`DIMENSIONS`(8 个并集)、`DimensionKey`(8 个)

- [ ] **Step 1: 写失败测试**

`packages/shared/src/jd.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { JobDescriptionSchema, GapAnalysisSchema } from './jd'
import { DIMENSIONS } from './review'

describe('JD schemas', () => {
  it('accepts a valid JD', () => {
    const jd = { role:'后端工程师', company:'X', keywords:['Go','Redis'],
      responsibilities:['服务端开发'], requirements:{ must:['3年经验'], nice:['k8s'] } }
    expect(JobDescriptionSchema.parse(jd)).toEqual(jd)
  })
  it('accepts a valid gap analysis', () => {
    const g = { matchScore:72, missingKeywords:['k8s'], weakRequirements:['分布式'], coveredHighlights:['Go'] }
    expect(GapAnalysisSchema.parse(g)).toEqual(g)
  })
  it('rejects out-of-range matchScore', () => {
    expect(() => GapAnalysisSchema.parse({ matchScore:150, missingKeywords:[], weakRequirements:[], coveredHighlights:[] })).toThrow()
  })
  it('DIMENSIONS now has 8 keys including jobMatch', () => {
    expect(DIMENSIONS).toHaveLength(8)
    expect(DIMENSIONS).toContain('jobMatch')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- jd`
Expected: FAIL — 无法导入 `./jd`,且 DIMENSIONS 仍是 5

- [ ] **Step 3: 实现**

`packages/shared/src/jd.ts`:
```ts
import { z } from 'zod'
export const JobDescriptionSchema = z.object({
  role: z.string(),
  company: z.string(),
  keywords: z.array(z.string()),
  responsibilities: z.array(z.string()),
  requirements: z.object({ must: z.array(z.string()), nice: z.array(z.string()) }),
})
export type JobDescription = z.infer<typeof JobDescriptionSchema>

export const GapAnalysisSchema = z.object({
  matchScore: z.number().min(0).max(100),
  missingKeywords: z.array(z.string()),
  weakRequirements: z.array(z.string()),
  coveredHighlights: z.array(z.string()),
})
export type GapAnalysis = z.infer<typeof GapAnalysisSchema>
```
`packages/shared/src/review.ts` 改为(保留 ReviewSchema 其余字段,仅扩维度来源):
```ts
import { z } from 'zod'
export const DIMENSIONS_BASE = ['layout','professionalism','star','quantification','techDepth'] as const
export const DIMENSIONS_JD = ['jobMatch','ats','keywordCoverage'] as const
export const DIMENSIONS = [...DIMENSIONS_BASE, ...DIMENSIONS_JD] as const
export type DimensionKey = typeof DIMENSIONS[number]
export const ReviewSchema = z.object({
  perspective: z.enum(['hr','interviewer']),
  overallScore: z.number().min(0).max(100),
  dimensionScores: z.array(z.object({ dimension: z.enum(DIMENSIONS), score: z.number().min(0).max(100), comment: z.string() })),
  suggestions: z.array(z.object({ location: z.string(), severity: z.enum(['high','medium','low']), issue: z.string(), suggestion: z.string() })),
})
export type Review = z.infer<typeof ReviewSchema>
```
> 注意:`z.enum` 需要 string 字面量元组;`DIMENSIONS` 用 `as const` 展开后类型为只读元组,`z.enum(DIMENSIONS)` 合法。
`packages/shared/src/index.ts` 增加:
```ts
export * from './jd'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- jd`
Expected: PASS(4 passed)

- [ ] **Step 5: 全量回归 + 提交**

Run: `npm test`
Expected: 全部 PASS(旧 review 测试仍绿)
```bash
git add packages/shared/src/jd.ts packages/shared/src/jd.test.ts packages/shared/src/review.ts packages/shared/src/index.ts
git commit -m "feat(shared): JD/缺口分析模型 + 诊断维度扩到 8"
```

---

### Task 2: 数据层(job_descriptions 表 + reviews 加列 + repo)

**Files:**
- Modify: `apps/server/src/db/connection.ts`
- Modify: `apps/server/src/db/repo.ts`
- Test: `apps/server/src/db/repo.test.ts`(追加用例)

**Interfaces:**
- Consumes: `JobDescription`, `GapAnalysis`(Task 1), 现有 `transaction`/`createReview`
- Produces:
  - `createJd(db, {title,company,rawText,structured:JobDescription}): number`
  - `getJd(db, id): { id,title,company,structured:JobDescription } | undefined`
  - `listJds(db): { id,title,company,createdAt }[]`
  - `createReview(db, versionId, review:Review, opts?:{ jobDescriptionId?:number|null, gap?:GapAnalysis|null }): number`(扩展,旧调用兼容)
  - `getReviewRow(db, id): { jobDescriptionId:number|null, gap:GapAnalysis|null }`(测试用读回)

- [ ] **Step 1: 写失败测试(追加到 repo.test.ts)**

```ts
import { openDb, createJd, getJd, listJds, createResume, createVersion, createReview, getReviewRow } from './repo'
// ... 现有 import 保留

describe('jd repo', () => {
  it('round-trips a job description', () => {
    const db = openDb(':memory:')
    const jd = { role:'后端', company:'X', keywords:['Go'], responsibilities:[], requirements:{must:[],nice:[]} }
    const id = createJd(db, { title:'后端工程师', company:'X', rawText:'原文', structured: jd })
    expect(getJd(db, id)!.structured.role).toBe('后端')
    expect(listJds(db).length).toBe(1)
  })
  it('stores a review with jobDescriptionId and gap', () => {
    const db = openDb(':memory:')
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null, structured:sample, status:'confirmed' })
    const jdId = createJd(db, { title:'后端', company:'', rawText:'jd', structured:{role:'后端',company:'',keywords:[],responsibilities:[],requirements:{must:[],nice:[]}} })
    const gap = { matchScore:80, missingKeywords:['k8s'], weakRequirements:[], coveredHighlights:['Go'] }
    const reviewId = createReview(db, vid, { perspective:'hr', overallScore:80, dimensionScores:[], suggestions:[] }, { jobDescriptionId: jdId, gap })
    const row = getReviewRow(db, reviewId)
    expect(row.jobDescriptionId).toBe(jdId)
    expect(row.gap!.matchScore).toBe(80)
  })
  it('createReview without opts leaves jd/gap null (backward compat)', () => {
    const db = openDb(':memory:')
    const rid = createResume(db, { title:'r', sourceFormat:'md', rawText:'x' })
    const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] }
    const vid = createVersion(db, { resumeId:rid, kind:'original', parentVersionId:null, structured:sample, status:'confirmed' })
    const reviewId = createReview(db, vid, { perspective:'hr', overallScore:70, dimensionScores:[], suggestions:[] })
    const row = getReviewRow(db, reviewId)
    expect(row.jobDescriptionId).toBeNull()
    expect(row.gap).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- repo`
Expected: FAIL — createJd/getJd/listJds/getReviewRow 未定义

- [ ] **Step 3: 迁移(connection.ts)**

在 `migrate()` 的 `db.exec` SQL 末尾追加(同一个 exec 字符串或新 exec 调用均可):
```ts
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_descriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, company TEXT,
      raw_text TEXT NOT NULL, structured_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')));
  `)
  // 幂等加列:列已存在时 ALTER 会抛错,用 try/catch 吞掉。
  for (const col of ['job_description_id INTEGER', 'gap_json TEXT']) {
    try { db.exec(`ALTER TABLE reviews ADD COLUMN ${col}`) } catch { /* 已存在 */ }
  }
```

- [ ] **Step 4: repo.ts 新增/扩展**

```ts
import type { JobDescription, GapAnalysis } from '@aios/shared'
import { JobDescriptionSchema } from '@aios/shared'

export function createJd(db: DatabaseSync, j: { title:string; company?:string; rawText:string; structured:JobDescription }): number {
  return Number(db.prepare('INSERT INTO job_descriptions (title,company,raw_text,structured_json) VALUES (?,?,?,?)')
    .run(j.title, j.company ?? '', j.rawText, JSON.stringify(j.structured)).lastInsertRowid)
}
export function getJd(db: DatabaseSync, id: number) {
  const row = db.prepare('SELECT id,title,company,structured_json FROM job_descriptions WHERE id=?').get(id) as any
  if (!row) return undefined
  return { id: row.id, title: row.title, company: row.company,
    structured: JobDescriptionSchema.parse(JSON.parse(row.structured_json)) }
}
export function listJds(db: DatabaseSync) {
  return db.prepare('SELECT id,title,company,created_at as createdAt FROM job_descriptions ORDER BY id DESC').all() as
    { id:number; title:string; company:string; createdAt:string }[]
}
```
扩展现有 `createReview`(把签名加可选 opts,SQL 加两列):
```ts
export function createReview(db: DatabaseSync, versionId: number, rv: Review,
  opts?: { jobDescriptionId?: number | null; gap?: GapAnalysis | null }): number {
  return Number(db.prepare(
    'INSERT INTO reviews (resume_version_id,perspective,overall_score,dimension_scores_json,suggestions_json,job_description_id,gap_json) VALUES (?,?,?,?,?,?,?)')
    .run(versionId, rv.perspective, rv.overallScore, JSON.stringify(rv.dimensionScores), JSON.stringify(rv.suggestions),
      opts?.jobDescriptionId ?? null, opts?.gap ? JSON.stringify(opts.gap) : null).lastInsertRowid)
}
export function getReviewRow(db: DatabaseSync, id: number) {
  const row = db.prepare('SELECT job_description_id, gap_json FROM reviews WHERE id=?').get(id) as any
  return { jobDescriptionId: row.job_description_id ?? null,
    gap: row.gap_json ? JSON.parse(row.gap_json) as GapAnalysis : null }
}
```
扩展 `exportAll` 增加 `jobDescriptions: db.prepare('SELECT * FROM job_descriptions').all()`。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- repo`
Expected: PASS(含 3 个新用例)

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/db/connection.ts apps/server/src/db/repo.ts apps/server/src/db/repo.test.ts
git commit -m "feat(server): job_descriptions 表 + reviews 加 jd/gap 列 + repo 扩展"
```

---

### Task 3: JD 解析 + 缺口分析服务

**Files:**
- Create: `apps/server/src/prompts/jd.txt`, `apps/server/src/prompts/gap.txt`
- Create: `apps/server/src/services/jd.ts`
- Test: `apps/server/src/services/jd.test.ts`

**Interfaces:**
- Consumes: `AiProvider`, `completeJson`(Task 3 阶段一), `JobDescriptionSchema`/`GapAnalysisSchema`(Task 1)
- Produces:
  - `parseJd(ai: AiProvider, rawText: string): Promise<JobDescription>`
  - `analyzeGap(ai: AiProvider, resume: StructuredResume, jd: JobDescription): Promise<GapAnalysis>`

- [ ] **Step 1: 写失败测试**

`apps/server/src/services/jd.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import type { AiProvider } from '../ai/provider'
import { parseJd, analyzeGap } from './jd'

const fakeAi = (out: string): AiProvider => ({ async complete(){return out}, async *stream(){yield out} })
const jdOut = JSON.stringify({ role:'后端', company:'X', keywords:['Go'], responsibilities:['开发'], requirements:{must:['3年'],nice:[]} })
const gapOut = JSON.stringify({ matchScore:75, missingKeywords:['k8s'], weakRequirements:[], coveredHighlights:['Go'] })
const sample = { basics:{name:'A',title:'T',contact:'c',summary:''}, education:[],work:[],projects:[],skills:[],awards:[] } as any

describe('jd services', () => {
  it('parseJd returns a validated JobDescription', async () => {
    const jd = await parseJd(fakeAi(jdOut), 'JD 原文')
    expect(jd.role).toBe('后端')
  })
  it('analyzeGap returns a validated GapAnalysis', async () => {
    const g = await analyzeGap(fakeAi(gapOut), sample, JSON.parse(jdOut))
    expect(g.matchScore).toBe(75)
  })
  it('parseJd throws on non-schema output', async () => {
    await expect(parseJd(fakeAi('{"bad":1}'), 'x')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- services/jd`
Expected: FAIL — 无法导入 `./jd`

- [ ] **Step 3: 写 prompts + 实现**

`apps/server/src/prompts/jd.txt`:
```
你是岗位描述(JD)解析器。将用户提供的 JD 原文解析为结构化 JSON。
严格要求:
1. 只输出 JSON,无解释、无 markdown 围栏。
2. 不得编造原文不存在的要求;缺失字段用空字符串或空数组。
3. JSON 结构:
{ "role":"岗位名称", "company":"公司名(没有则空串)",
  "keywords":["技术/工具关键词"],
  "responsibilities":["岗位职责"],
  "requirements":{ "must":["硬性要求"], "nice":["加分项"] } }
```
`apps/server/src/prompts/gap.txt`:
```
你是简历与岗位匹配分析师。基于给定的结构化简历与 JD,客观比对两者差距。
严格要求:
1. 只输出 JSON,无解释、无 markdown 围栏。
2. 客观评估,不夸大匹配度;matchScore 为 0-100 整数。
3. missingKeywords:JD keywords 中简历未体现的;weakRequirements:JD must 要求中简历体现不足的;coveredHighlights:简历已很好匹配 JD 的亮点。
4. JSON 结构:
{ "matchScore":0-100, "missingKeywords":[], "weakRequirements":[], "coveredHighlights":[] }
```
`apps/server/src/services/jd.ts`:
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import { completeJson } from '../ai/claude-cli'
import { JobDescriptionSchema, GapAnalysisSchema, type JobDescription, type GapAnalysis, type StructuredResume } from '@aios/shared'

const dir = dirname(fileURLToPath(import.meta.url))
const JD_PROMPT = readFileSync(join(dir, '../prompts/jd.txt'), 'utf8')
const GAP_PROMPT = readFileSync(join(dir, '../prompts/gap.txt'), 'utf8')

export function parseJd(ai: AiProvider, rawText: string): Promise<JobDescription> {
  return completeJson(ai, JobDescriptionSchema, { system: JD_PROMPT, prompt: rawText })
}
export function analyzeGap(ai: AiProvider, resume: StructuredResume, jd: JobDescription): Promise<GapAnalysis> {
  const prompt = `简历JSON:\n${JSON.stringify(resume)}\n\nJD JSON:\n${JSON.stringify(jd)}`
  return completeJson(ai, GapAnalysisSchema, { system: GAP_PROMPT, prompt })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- services/jd`
Expected: PASS(3 passed)

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/prompts/jd.txt apps/server/src/prompts/gap.txt apps/server/src/services/jd.ts apps/server/src/services/jd.test.ts
git commit -m "feat(server): JD 解析 + 简历↔JD 缺口分析服务"
```

---

### Task 4: 诊断服务扩展(可选绑定 JD → 8 维)

**Files:**
- Create: `apps/server/src/prompts/review-with-jd.txt`
- Modify: `apps/server/src/services/review.ts`
- Test: `apps/server/src/services/review.test.ts`(追加用例)

**Interfaces:**
- Consumes: `JobDescription`(Task 1), `completeJson`, `ReviewSchema`
- Produces:
  - `reviewResume(ai, structured: StructuredResume, perspective:'hr'|'interviewer', jd?: JobDescription): Promise<Review>`(新增可选第 4 参)。无 jd → 现有 review.txt(5 维);有 jd → review-with-jd.txt(8 维,JD 注入 prompt)。返回仍强制 `{...r, perspective}`。

- [ ] **Step 1: 写失败测试(追加)**

```ts
const reviewJdOut = JSON.stringify({ perspective:'hr', overallScore:70,
  dimensionScores:[
    {dimension:'layout',score:70,comment:''},{dimension:'jobMatch',score:65,comment:''},
    {dimension:'ats',score:60,comment:''},{dimension:'keywordCoverage',score:55,comment:''}],
  suggestions:[] })
const sampleJd = { role:'后端', company:'', keywords:['Go'], responsibilities:[], requirements:{must:[],nice:[]} }

it('reviewResume with jd returns dimensions including jobMatch', async () => {
  const r = await reviewResume(fakeAi(reviewJdOut), sample as any, 'hr', sampleJd as any)
  expect(r.dimensionScores.some(d => d.dimension === 'jobMatch')).toBe(true)
})
```
(`fakeAi`、`sample` 沿用文件已有定义。)

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- services/review`
Expected: FAIL — reviewResume 不接受第 4 参 / 返回不含 jobMatch

- [ ] **Step 3: 写 prompt + 改 service**

`apps/server/src/prompts/review-with-jd.txt`:
```
你是资深简历评审专家,从指定视角(HR 或面试官)评审结构化简历,并结合给定的目标岗位 JD。
评分维度(共 8 个,0-100):
layout(排版可读性) professionalism(专业度) star(STAR法则) quantification(量化程度) techDepth(技术深度)
jobMatch(与该 JD 职责/要求的契合度) ats(格式与关键词能否通过 ATS 筛选) keywordCoverage(JD 关键词在简历中的覆盖率)
严格要求:
1. 只输出 JSON,无解释、无 markdown 围栏。
2. 必须包含上述全部 8 个维度的评分。
3. suggestions 每条含 location(简历字段路径,如 "work[0].bullets[1]")、severity(high/medium/low)、issue、suggestion。
4. JSON 结构:
{ "perspective":"hr"|"interviewer", "overallScore":0-100,
  "dimensionScores":[{"dimension":"layout","score":0-100,"comment":""}],
  "suggestions":[{"location":"","severity":"high","issue":"","suggestion":""}] }
```
`apps/server/src/services/review.ts` 改为:
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import { completeJson } from '../ai/claude-cli'
import { ReviewSchema, type Review, type StructuredResume, type JobDescription } from '@aios/shared'

const dir = dirname(fileURLToPath(import.meta.url))
const PROMPT = readFileSync(join(dir, '../prompts/review.txt'), 'utf8')
const PROMPT_JD = readFileSync(join(dir, '../prompts/review-with-jd.txt'), 'utf8')

export async function reviewResume(
  ai: AiProvider, structured: StructuredResume, perspective: 'hr'|'interviewer', jd?: JobDescription,
): Promise<Review> {
  const system = jd ? PROMPT_JD : PROMPT
  const prompt = jd
    ? `视角: ${perspective}\nJD JSON:\n${JSON.stringify(jd)}\n\n简历JSON:\n${JSON.stringify(structured)}`
    : `视角: ${perspective}\n简历JSON:\n${JSON.stringify(structured)}`
  const r = await completeJson(ai, ReviewSchema, { system, prompt })
  return { ...r, perspective }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- services/review`
Expected: PASS(原有 + 新用例;旧的「无 jd 强制 perspective」用例仍绿)

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/prompts/review-with-jd.txt apps/server/src/services/review.ts apps/server/src/services/review.test.ts
git commit -m "feat(server): 诊断服务支持可选绑定 JD,解锁 8 维度"
```

---

### Task 5: JD 路由(POST/GET /api/jds)

**Files:**
- Create: `apps/server/src/routes/jds.ts`
- Modify: `apps/server/src/index.ts`(挂载 jdsRouter)
- Test: `apps/server/src/routes/jds.test.ts`

**Interfaces:**
- Consumes: `parseJd`(Task 3), `createJd`/`listJds`(Task 2), `HttpError`(阶段一)
- Produces:
  - `jdsRouter(db, ai): Router`
  - `POST /api/jds`(body `{title, company?, rawText}`)→ parseJd → createJd → `{ id, structured }`;缺 rawText/title → 400
  - `GET /api/jds` → `{id,title,company,createdAt}[]`

- [ ] **Step 1: 写失败测试**

`apps/server/src/routes/jds.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../db/repo'
import { createApp } from '../index'
import type { AiProvider } from '../ai/provider'

const jdOut = JSON.stringify({ role:'后端', company:'X', keywords:['Go'], responsibilities:[], requirements:{must:[],nice:[]} })
const fakeAi: AiProvider = { async complete(){return jdOut}, async *stream(){yield jdOut} }
let db: DatabaseSync, app: any
beforeEach(() => { db = openDb(':memory:'); app = createApp(db, fakeAi) })

describe('jd routes', () => {
  it('creates and lists a JD', async () => {
    const c = await request(app).post('/api/jds').send({ title:'后端工程师', rawText:'JD 原文' })
    expect(c.status).toBe(200)
    expect(c.body.structured.role).toBe('后端')
    const l = await request(app).get('/api/jds')
    expect(l.body.length).toBe(1)
  })
  it('rejects missing rawText with 400', async () => {
    const r = await request(app).post('/api/jds').send({ title:'x' })
    expect(r.status).toBe(400)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- routes/jds`
Expected: FAIL — /api/jds 404(路由未挂载)

- [ ] **Step 3: 实现路由**

`apps/server/src/routes/jds.ts`:
```ts
import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { parseJd } from '../services/jd'
import { createJd, listJds } from '../db/repo'
import { HttpError } from '../middleware/error'

export function jdsRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()
  r.get('/jds', (_req, res) => res.json(listJds(db)))
  r.post('/jds', async (req, res, next) => {
    try {
      const { title, company, rawText } = req.body ?? {}
      if (!title || !rawText) throw new HttpError(400, '缺少 title 或 rawText')
      const structured = await parseJd(ai, String(rawText))
      const id = createJd(db, { title: String(title), company: company ? String(company) : '', rawText: String(rawText), structured })
      res.json({ id, structured })
    } catch (e) { next(e) }
  })
  return r
}
```

- [ ] **Step 4: 挂载到 index.ts**

在 `createApp` 内,其他 `app.use('/api', ...)` 之间加:
```ts
import { jdsRouter } from './routes/jds'
// ...
  app.use('/api', jdsRouter(db, ai))
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- routes/jds`
Expected: PASS(2 passed)

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/routes/jds.ts apps/server/src/index.ts apps/server/src/routes/jds.test.ts
git commit -m "feat(server): /api/jds 路由 — JD 解析入库与列表"
```

---

### Task 6: reviews 路由扩展(可选 jobDescriptionId + 缺口)

**Files:**
- Modify: `apps/server/src/routes/reviews.ts`
- Test: 追加到 `apps/server/src/routes/resumes.test.ts`(阶段一的 reviews 409 用例就在此文件;沿用其 `openDb`/`createApp`/supertest 导入,在文件内新增一个 `describe('reviews with jd', ...)`)

**Interfaces:**
- Consumes: `reviewResume`(Task 4), `analyzeGap`(Task 3), `getJd`/`getVersion`/`createReview`/`transaction`(Task 2)
- Produces:
  - `POST /api/reviews`(body `{versionId, jobDescriptionId?}`):
    - version 必须 confirmed,否则 409(沿用)
    - 无 jobDescriptionId → 双视角 5 维(现状),返回 `{hr, interviewer}`
    - 有 jobDescriptionId → 校验 JD 存在(否则 404);双视角各带 jd 调一次(8 维)+ analyzeGap 一次;事务写两条 review(带 jobDescriptionId+gap);返回 `{hr, interviewer, gap}`

- [ ] **Step 1: 写失败测试**

```ts
// 在 reviews 路由测试文件中追加。fakeAi 需要按调用顺序返回不同 JSON:
// 这里用一个能按 system 内容分辨的 fake——含 "JD JSON" 的诊断 prompt 返回 8 维;gap prompt 返回 gap。
import { createJd } from '../db/repo'

function smartAi(): AiProvider {
  const reviewBase = JSON.stringify({ perspective:'hr', overallScore:70, dimensionScores:[{dimension:'layout',score:70,comment:''}], suggestions:[] })
  const review8 = JSON.stringify({ perspective:'hr', overallScore:72, dimensionScores:[{dimension:'jobMatch',score:66,comment:''}], suggestions:[] })
  const gap = JSON.stringify({ matchScore:80, missingKeywords:['k8s'], weakRequirements:[], coveredHighlights:['Go'] })
  return {
    async complete(o) {
      if (o.system.includes('JD 关键词在简历中')) return review8     // review-with-jd.txt
      if (o.system.includes('匹配分析师')) return gap                 // gap.txt
      return reviewBase                                              // review.txt
    },
    async *stream(o){ yield await this.complete(o) },
  }
}

it('review with jobDescriptionId returns gap and jd dimensions', async () => {
  const db = openDb(':memory:'); const app = createApp(db, smartAi())
  // upload + confirm a resume
  const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
  await request(app).post(`/api/resumes/versions/${up.body.versionId}/confirm`)
  const jdId = createJd(db, { title:'后端', company:'', rawText:'jd', structured:{role:'后端',company:'',keywords:['Go'],responsibilities:[],requirements:{must:[],nice:[]}} })
  const res = await request(app).post('/api/reviews').send({ versionId: up.body.versionId, jobDescriptionId: jdId })
  expect(res.status).toBe(200)
  expect(res.body.gap.matchScore).toBe(80)
  expect(res.body.hr.dimensionScores.some((d:any)=>d.dimension==='jobMatch')).toBe(true)
})
it('review with unknown jobDescriptionId returns 404', async () => {
  const db = openDb(':memory:'); const app = createApp(db, smartAi())
  const up = await request(app).post('/api/resumes').attach('file', Buffer.from('# r'), 'r.md')
  await request(app).post(`/api/resumes/versions/${up.body.versionId}/confirm`)
  const res = await request(app).post('/api/reviews').send({ versionId: up.body.versionId, jobDescriptionId: 999 })
  expect(res.status).toBe(404)
})
```
> 注：smartAi 通过 system prompt 内容分辨调用类型;`'JD 关键词在简历中'` 与 `'匹配分析师'` 是 review-with-jd.txt / gap.txt 里的原句,实现时确保 prompt 含这些字样(Task 3/4 的 prompt 已含)。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- resumes`
Expected: FAIL — 当前路由忽略 jobDescriptionId,无 gap 字段
- [ ] **Step 3: 改 reviews 路由**

`apps/server/src/routes/reviews.ts` 改为:
```ts
import { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { AiProvider } from '../ai/provider'
import { getVersion, getJd, createReview, transaction } from '../db/repo'
import { reviewResume } from '../services/review'
import { analyzeGap } from '../services/jd'
import { HttpError } from '../middleware/error'

export function reviewsRouter(db: DatabaseSync, ai: AiProvider) {
  const r = Router()
  r.post('/reviews', async (req, res, next) => {
    try {
      const v = getVersion(db, Number(req.body.versionId))
      if (!v) throw new HttpError(404, '版本不存在')
      if (v.status !== 'confirmed') throw new HttpError(409, '请先确认校对后的简历再诊断')

      const jdIdRaw = req.body.jobDescriptionId
      if (jdIdRaw === undefined || jdIdRaw === null) {
        // 现状:5 维双视角
        const hr = await reviewResume(ai, v.structured, 'hr')
        const interviewer = await reviewResume(ai, v.structured, 'interviewer')
        transaction(db, () => { createReview(db, v.id, hr); createReview(db, v.id, interviewer) })
        return res.json({ hr, interviewer })
      }

      const jd = getJd(db, Number(jdIdRaw))
      if (!jd) throw new HttpError(404, 'JD 不存在')
      const hr = await reviewResume(ai, v.structured, 'hr', jd.structured)
      const interviewer = await reviewResume(ai, v.structured, 'interviewer', jd.structured)
      const gap = await analyzeGap(ai, v.structured, jd.structured)
      transaction(db, () => {
        createReview(db, v.id, hr, { jobDescriptionId: jd.id, gap })
        createReview(db, v.id, interviewer, { jobDescriptionId: jd.id, gap })
      })
      res.json({ hr, interviewer, gap })
    } catch (e) { next(e) }
  })
  return r
}
```

- [ ] **Step 4: 运行测试确认通过 + 全量回归**

Run: `npm test`
Expected: 全部 PASS(原有 reviews 409/双视角用例 + 新 JD 用例)

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/routes/reviews.ts apps/server/src/routes/reviews.test.ts
git commit -m "feat(server): reviews 路由支持可选 JD,产出 8 维 + 缺口分析"
```

---

### Task 7: 前端 api 扩展 + JD 选择器组件

**Files:**
- Modify: `apps/web/src/api.ts`
- Create: `apps/web/src/pages/JdSelector.tsx`
- Test: `apps/web/src/pages/JdSelector.test.tsx`

**Interfaces:**
- Consumes: 后端 `/api/jds` 与 `/api/reviews`(Task 5/6);类型 `JobDescription`(Task 1)
- Produces:
  - `api.listJds(): Promise<{id,title,company,createdAt}[]>`
  - `api.createJd(input:{title,company?,rawText}): Promise<{id, structured:JobDescription}>`
  - `api.review` 改为 `review(versionId, jobDescriptionId?)`(可选第 2 参,有则 body 带 jobDescriptionId)
  - `<JdSelector value:number|null onChange:(id:number|null)=>void />` — 下拉选已有 JD 或「+ 添加 JD」展开表单(title/company/rawText)→ 调 createJd → 选中新 JD

- [ ] **Step 1: 写 api(无需独立测试,被 JdSelector 测试覆盖)**

`apps/web/src/api.ts` 改动:
```ts
import type { StructuredResume, Review, JobDescription } from '@aios/shared'
// ... j / json 不变
export const api = {
  // ... 现有项保留 ...
  listJds: () => j<{id:number;title:string;company:string;createdAt:string}[]>('/api/jds'),
  createJd: (input: { title:string; company?:string; rawText:string }) =>
    j<{id:number; structured:JobDescription}>('/api/jds', json(input)),
  review: (versionId: number, jobDescriptionId?: number) =>
    j<{hr:Review;interviewer:Review;gap?:import('@aios/shared').GapAnalysis}>(
      '/api/reviews', json(jobDescriptionId == null ? { versionId } : { versionId, jobDescriptionId })),
}
```
> 保留其余方法不变(health/listResumes/uploadResume/updateVersion/confirmVersion/optimize)。

- [ ] **Step 2: 写失败测试**

`apps/web/src/pages/JdSelector.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { JdSelector } from './JdSelector'
import { api } from '../api'

beforeEach(() => {
  vi.spyOn(api, 'listJds').mockResolvedValue([{ id:1, title:'后端工程师', company:'X', createdAt:'' }])
  vi.spyOn(api, 'createJd').mockResolvedValue({ id:2, structured:{ role:'前端', company:'', keywords:[], responsibilities:[], requirements:{must:[],nice:[]} } } as any)
})

describe('JdSelector', () => {
  it('lists existing JDs and selects one', async () => {
    const onChange = vi.fn()
    const { findByText, getByLabelText } = render(<JdSelector value={null} onChange={onChange} />)
    await findByText(/后端工程师/)
    fireEvent.change(getByLabelText(/目标岗位/), { target: { value: '1' } })
    expect(onChange).toHaveBeenCalledWith(1)
  })
  it('adds a new JD via the form', async () => {
    const onChange = vi.fn()
    const { getByText, getByLabelText } = render(<JdSelector value={null} onChange={onChange} />)
    fireEvent.click(getByText(/添加 JD/))
    fireEvent.change(getByLabelText(/岗位名称/), { target: { value: '前端工程师' } })
    fireEvent.change(getByLabelText(/JD 原文/), { target: { value: '岗位描述...' } })
    fireEvent.click(getByText(/保存/))
    await waitFor(() => expect(api.createJd).toHaveBeenCalled())
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(2))
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- JdSelector`
Expected: FAIL — 无法导入 `./JdSelector`

- [ ] **Step 4: 实现 JdSelector**

`apps/web/src/pages/JdSelector.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { api } from '../api'
import { Button } from '../components/ui'

export function JdSelector({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const [jds, setJds] = useState<{ id:number; title:string; company:string }[]>([])
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState(''); const [company, setCompany] = useState(''); const [rawText, setRawText] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')

  useEffect(() => { api.listJds().then(setJds).catch(() => {}) }, [])

  const inputCls = 'w-full rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40'

  async function save() {
    if (!title || !rawText) { setError('请填写岗位名称与 JD 原文'); return }
    setBusy(true); setError('')
    try {
      const r = await api.createJd({ title, company, rawText })
      setJds(prev => [{ id: r.id, title, company }, ...prev])
      setAdding(false); setTitle(''); setCompany(''); setRawText('')
      onChange(r.id)
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted" htmlFor="jd-select">目标岗位（可选）</label>
        <select id="jd-select" aria-label="目标岗位" value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
          className="rounded-btn border border-border bg-surface-2 px-3 py-1.5 text-sm text-text">
          <option value="">不绑定（仅 5 维诊断）</option>
          {jds.map(j => <option key={j.id} value={j.id}>{j.title}{j.company ? ` · ${j.company}` : ''}</option>)}
        </select>
        {!adding && <button onClick={() => setAdding(true)} className="cursor-pointer text-sm text-accent hover:underline">+ 添加 JD</button>}
      </div>
      {adding && (
        <div className="space-y-2 rounded-card border border-border bg-surface p-4">
          <input aria-label="岗位名称" className={inputCls} placeholder="岗位名称" value={title} onChange={e => setTitle(e.target.value)} />
          <input aria-label="公司" className={inputCls} placeholder="公司（可选）" value={company} onChange={e => setCompany(e.target.value)} />
          <textarea aria-label="JD 原文" rows={5} className={inputCls} placeholder="粘贴 JD 原文…" value={rawText} onChange={e => setRawText(e.target.value)} />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>取消</Button>
            <Button variant="primary" onClick={save} disabled={busy}>{busy ? '解析中…' : '保存'}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- JdSelector`
Expected: PASS(2 passed)

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/api.ts apps/web/src/pages/JdSelector.tsx apps/web/src/pages/JdSelector.test.tsx
git commit -m "feat(web): api 扩展 JD + 目标岗位选择器组件"
```

---

### Task 8: 诊断页接入 JD 选择器 + 缺口卡片 + 端到端冒烟

**Files:**
- Modify: `apps/web/src/pages/ResumeReview.tsx`
- Test: `apps/web/src/pages/ResumeReview.test.tsx`(追加缺口卡片用例)

**Interfaces:**
- Consumes: `JdSelector`(Task 7), `api.review(versionId, jobDescriptionId?)`(Task 7), `GapAnalysis`(Task 1)
- Produces: 诊断页在「开始诊断」前展示 `<JdSelector>`;选中 JD 时调 `api.review(versionId, jdId)`;返回含 `gap` 时,在报告区渲染「岗位匹配缺口」卡片(matchScore + missingKeywords 标签 + weakRequirements 列表 + coveredHighlights)。雷达图据返回的 dimensionScores 自动 5/8 维。

> 设计说明:当前 ResumeReview 在挂载时立即 `api.review(versionId)`。本任务改为:先展示 JD 选择器 + 「开始诊断」按钮,用户点击后才发起诊断(带可选 jdId)。这样用户能在诊断前选岗位。

- [ ] **Step 1: 写失败测试(追加到 ResumeReview.test.tsx)**

```ts
it('shows gap card when review returns gap', async () => {
  const withGap = {
    hr: { perspective:'hr', overallScore:72,
      dimensionScores:[{dimension:'jobMatch',score:66,comment:''}], suggestions:[] },
    interviewer: { perspective:'interviewer', overallScore:70, dimensionScores:[{dimension:'jobMatch',score:60,comment:''}], suggestions:[] },
    gap: { matchScore:80, missingKeywords:['k8s'], weakRequirements:['分布式经验'], coveredHighlights:['Go'] },
  }
  vi.spyOn(api,'review').mockResolvedValue(withGap as any)
  const { getByText, findByText } = render(<ResumeReview versionId={2} onBack={()=>{}} onOptimize={()=>{}} />)
  fireEvent.click(getByText(/开始诊断/))
  await findByText(/匹配缺口|岗位匹配/)
  expect(getByText(/k8s/)).toBeTruthy()
})
```
(`api`、`vi`、`render`、`fireEvent`、`ResizeObserver` polyfill 沿用文件已有部分;原有「双视角+高亮」用例需相应改为先点击「开始诊断」——见 Step 3 改造说明。)

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- ResumeReview`
Expected: FAIL — 无 JD 选择器/「开始诊断」入口,无缺口卡片

- [ ] **Step 3: 改造 ResumeReview**

把「挂载即诊断」改为「选 JD → 点开始诊断」。`apps/web/src/pages/ResumeReview.tsx` 顶部状态与触发逻辑改为:
```tsx
import { JdSelector } from './JdSelector'
import type { Review, GapAnalysis } from '@aios/shared'
// ... 其余 import 保留(RadarChart/AsyncView/Card/Button/Badge/icons)

type Data = { hr: Review; interviewer: Review; gap?: GapAnalysis }

export function ResumeReview({ versionId, onBack, onOptimize }: {
  versionId: number; onBack: () => void; onOptimize: (s: Review['suggestions']) => void
}) {
  const [jdId, setJdId] = useState<number | null>(null)
  const [started, setStarted] = useState(false)
  const [state, setState] = useState<{ loading?: boolean; error?: string; data?: Data }>({})
  const [tab, setTab] = useState<'hr' | 'interviewer'>('hr')
  const [activeLoc, setActiveLoc] = useState<string>('')

  function start() {
    setStarted(true); setState({ loading: true })
    api.review(versionId, jdId ?? undefined)
      .then(data => setState({ data })).catch(e => setState({ error: e.message }))
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <button onClick={onBack} className="flex cursor-pointer items-center gap-1 text-sm text-muted hover:text-text">
          <ChevronLeft size={15} /> 返回
        </button>
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-text">开始诊断</h2>
          <p className="text-sm text-muted">可选择一个目标岗位 JD —— 绑定后将解锁岗位匹配 / ATS / 关键词覆盖 3 个维度,并产出简历与 JD 的缺口分析。</p>
          <JdSelector value={jdId} onChange={setJdId} />
          <div className="flex justify-end">
            <Button variant="primary" onClick={start}>开始诊断</Button>
          </div>
        </Card>
      </div>
    )
  }
  // ...诊断结果渲染:沿用阶段一的 AsyncView + Tab + 评分卡 + RadarChart + 建议列表,
  //    并在建议列表之前,如果 state.data.gap 存在,插入缺口卡片(见下)。
}
```
缺口卡片(在结果渲染区、雷达图之后插入):
```tsx
{data.gap && (
  <Card className="space-y-3 p-5">
    <div className="flex items-center gap-2">
      <h3 className="text-sm font-semibold text-text">岗位匹配缺口</h3>
      <Badge tone="accent">匹配度 {data.gap.matchScore}</Badge>
    </div>
    {data.gap.missingKeywords.length > 0 && (
      <div>
        <p className="mb-1 text-xs font-medium text-muted">缺失关键词</p>
        <div className="flex flex-wrap gap-1.5">
          {data.gap.missingKeywords.map((k, i) => <Badge key={i} tone="danger">{k}</Badge>)}
        </div>
      </div>
    )}
    {data.gap.weakRequirements.length > 0 && (
      <div>
        <p className="mb-1 text-xs font-medium text-muted">体现不足的要求</p>
        <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted">
          {data.gap.weakRequirements.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      </div>
    )}
    {data.gap.coveredHighlights.length > 0 && (
      <div>
        <p className="mb-1 text-xs font-medium text-muted">已匹配亮点</p>
        <div className="flex flex-wrap gap-1.5">
          {data.gap.coveredHighlights.map((c, i) => <Badge key={i} tone="muted">{c}</Badge>)}
        </div>
      </div>
    )}
  </Card>
)}
```
> 实现时把结果渲染部分(AsyncView 块)完整保留阶段一逻辑,仅:① 数据类型换成 `Data`(含可选 gap);② 在雷达图卡片之后插入上面的缺口卡片。原有 onBack 在结果页仍可用(返回到未开始状态或上层均可,沿用 onBack)。

- [ ] **Step 4: 运行测试确认通过 + 全量回归**

Run: `npm test`
Expected: 全部 PASS(含改造后的 ResumeReview 用例 + 缺口卡片用例;其余阶段一/阶段二测试仍绿)。再跑 `npx tsc --noEmit -p apps/web/tsconfig.json`(0 错)与 `npm run build --workspace=apps/web`。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/pages/ResumeReview.tsx apps/web/src/pages/ResumeReview.test.tsx
git commit -m "feat(web): 诊断页接入 JD 选择器 + 8 维 + 岗位缺口卡片"
```

- [ ] **Step 6: 端到端冒烟(真机,验证 JD 闭环)**

控制者执行(非子代理):重启后端(`apps/server`,带数据库),用 CSQ.pdf 走:上传→确认→**创建一个 JD**(POST /api/jds,贴一段真实岗位 JD)→**带 jobDescriptionId 诊断**(POST /api/reviews)。验证:返回含 8 维 dimensionScores + gap;耗时可接受。记录结论到进度账本。

---

## 实施顺序与依赖

Task 1(shared)→ 2(数据层)→ 3(JD/缺口服务)→ 4(诊断服务)→ 5(JD 路由)→ 6(reviews 路由)→ 7(前端 api+JD 选择器)→ 8(诊断页缺口卡片 + 冒烟)。严格按序;每个 Task 自带测试与提交。Task 8 的真机冒烟由控制者完成,不交子代理。



