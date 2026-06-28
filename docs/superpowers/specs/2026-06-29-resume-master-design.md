# AI 求职操作系统 — 第一阶段设计:地基 + 简历大师

- 日期:2026-06-29
- 状态:待评审
- 范围:第一阶段(共多阶段)。本阶段搭建项目地基,并实现「简历大师」模块的核心闭环。

## 1. 背景与定位

最终产品是一个个人自用的「AI 求职操作系统」,通过「学习 → 理解 → 训练 → 面试 → 复盘 → 再训练」闭环提升跳槽成功率(完整愿景见 `AI_Interview_OS_Detailed_Product_Prompt.docx`,含 7 大模块 + 统一能力模型 + Offer Readiness 仪表盘)。

完整产品过大,无法一次实现。本阶段聚焦**数据源头模块——简历大师**,并搭好后续模块复用的地基。

### 本阶段目标
1. 搭建地基:前端框架、本地后端、SQLite、AI 适配层、统一数据模型骨架。地基为后续模块预留接口,但**本阶段不实现**它们。
2. 实现简历大师核心闭环:**上传 → 解析 → 人工校对 → 双视角诊断 → 逐条建议 → 优化版生成 → 前后对比**。

### 非目标(后置到后续阶段)
- 多岗位适配、JD 上传与关键词提取、面试材料生成
- 模块一/三/四/五/六/七、AI Coach、完整能力模型
- 账号系统、云同步、多设备

## 2. 顶层约束(贯穿全设计的硬性优先级)

按用户要求,**流畅性、稳定性、安全性为第一优先级**,高于功能数量。

- 流畅性:长任务有明确进度反馈,绝不"卡住转圈不知死活";所有 AI 调用有超时控制。
- 稳定性:AI 返回非法数据 → 重试 → 降级报错,绝不静默崩溃;DB 写操作用事务;前端每个异步态有 loading/error/empty 三态。
- 安全性:后端 spawn 本地 CLI 是最大风险面,专项处理(见 §7)。
- 性能可行性:必须保证在本机能流畅运行。若实测本地 CLI 方案延迟/资源不可接受,适配层可无缝切换到 API Key provider(见 §5、§8)。

## 3. 架构总览

```
┌─────────────────────────────────────────────┐
│  浏览器前端  (React + Vite + TS + Tailwind)   │
│  - 简洁专业 SaaS 风 / 深色优先 / 响应式        │
└───────────────────────┬─────────────────────┘
                        │ HTTP + SSE(流式)
┌───────────────────────┴─────────────────────┐
│  本地后端  (Node + Express),仅监听 127.0.0.1 │
│  - REST API + SSE 流式输出                    │
│  - 文本抽取 (pdf-parse / mammoth)             │
│  - AI 适配层 (AiProvider 接口)                │
│        ├─ ClaudeCliProvider → spawn `claude`  │
│        └─ ApiKeyProvider(预留,可切换)        │
│  - 串行/限并发队列(保护本机资源)             │
│  - SQLite 持久化 (better-sqlite3, 参数化+事务) │
└───────────────────────────────────────────────┘
```

### 设计原则
1. **单用户、本地优先** — 无账号系统,数据全在本地 SQLite,隐私自持。
2. **AI 调用收敛到一个适配层** — 业务只依赖 `AiProvider` 接口,默认 `ClaudeCliProvider`;加 API Key 仅多写一个 provider,业务零改动。
3. **统一数据模型从第一天就定好** — 简历、项目、能力维度一次设计到位,后续模块往上挂,不返工。

### 目录结构(monorepo, npm workspaces)
```
Switch_Job/
├── apps/web/        # React 前端
├── apps/server/     # Express 后端(含 prompts/、db/、ai/)
├── packages/shared/ # 前后端共享 TS 类型(数据模型)
└── docs/superpowers/specs/
```
`npm run dev` 一键起前后端。

## 4. 数据模型(SQLite)

```
resumes              一份上传的简历
  id, title, source_format(pdf/docx/md), raw_text,
  created_at, updated_at

resume_versions      结构化内容 + 优化版(同表, kind 区分)
  id, resume_id, kind(original/optimized),
  parent_version_id,            -- 优化版指向其来源版本
  structured_json,              -- 解析后的结构化简历
  status,                       -- draft(待校对) / confirmed
  created_at

reviews              一次诊断报告
  id, resume_version_id,
  perspective(hr/interviewer),  -- 双视角各一条
  overall_score,
  dimension_scores_json,
  suggestions_json,             -- 逐条建议(定位到简历某段)
  created_at

capability_snapshots 能力模型快照(地基预留,本阶段只写简历相关维度)
  id, source_module('resume'), metrics_json, created_at
```

### 结构化简历 `structured_json`(置于 `packages/shared`)
```ts
{
  basics:    { name, title, contact, summary }
  education: [{ school, degree, major, period, highlights[] }]
  work:      [{ company, role, period, bullets[] }]
  projects:  [{ name, role, period, stack[], bullets[], metrics[] }]
  skills:    [{ category, items[] }]
  awards:    [{ name, date, desc }]
}
```
`projects` 字段刻意完整(stack/metrics),供后续「项目深挖」模块直接复用。

### 数据导出 / 备份
本地单机有数据丢失风险。提供**一键导出全部数据为 JSON**(简历、版本、诊断),便于备份与将来云迁移。

## 5. AI 适配层与交互逻辑

### 接口
```ts
interface AiProvider {
  // 一次性结构化输出(解析、评分、生成优化版)
  complete(opts: { system: string; prompt: string; json?: boolean }): Promise<string>
  // 流式自然语言长文本(总评、建议解释)
  stream(opts: { system: string; prompt: string }): AsyncIterable<string>
}
```

### ClaudeCliProvider
`spawn('claude', [...args], { shell: false })`,经 stdout 取结果;流式读 stdout 增量。业务代码只见接口。`ApiKeyProvider` 实现同接口,经 env 切换。

### 限并发队列
AI 适配层内置队列,**最多并发 N(默认 2)个 CLI 进程**,超出排队,防止连点/多任务把本机拖垮。每次调用设超时,超时 kill 子进程。

### 三处 AI 调用(prompt 模板存 `apps/server/prompts/`)
1. **解析** — 输入简历纯文本;system 要求严格输出符合 schema 的 JSON、不杜撰;输出 `structured_json`。后端 schema 校验,失败重试一次。
2. **诊断评分** — 输入结构化简历 + 视角(HR / 面试官);输出 `overall_score` + `dimension_scores` + `suggestions`(每条 `{location, severity, issue, suggestion}`)。HR 与面试官各调一次,各存一条 review。维度见 §6。
3. **生成优化版** — 输入原结构化简历 + 已生成建议;**非流式**一次性返回完整 `structured_json`(避免残缺 JSON 无法解析);前端用骨架屏展示进度。system 强约束:**保持内容真实、不夸大、不编造**,只做表达优化/量化补强/结构调整。存为新 `resume_version(kind=optimized, parent=原版本)`。

> 说明:流式仅用于自然语言长文本(如总评叙述),结构化 JSON 一律非流式整体返回。

### 可靠性
AI 返回非法 JSON → 重试一次 → 仍失败返回明确错误,不静默崩溃。

## 6. 诊断维度(第一阶段)

第一阶段无 JD,故只保留**不依赖目标岗位**的 5 个维度,保证每个分数都有真实依据:
1. 排版可读性
2. 专业度
3. STAR 法则
4. 量化程度
5. 技术深度

> 岗位匹配度 / ATS 兼容性 / 关键词覆盖依赖 JD,留到后续「JD 适配」阶段再上。

## 7. 页面结构与 UI

简洁专业 SaaS 风 / 深色优先 / 响应式。

```
顶部:Logo + 模块导航(仅"简历大师""仪表盘"可用,其余置灰预留)
     + Claude CLI 就绪状态指示(✅ 已就绪 / ⚠️ 未检测到,附指引)

1. 仪表盘 Dashboard(地基骨架)
   - Offer Readiness 卡片(本阶段仅简历质量维度,其余"待解锁")
   - 最近简历、最近诊断入口

2. 简历大师 Resume Master(本阶段主战场)
   ├─ 简历列表        卡片展示,可新建/删除
   ├─ 上传/解析        拖拽上传 → 进度 → 解析结果预览
   ├─ 结构化校对       【强制关卡】分区展示,用户确认/修正后才存为 original、才允许诊断
   ├─ 诊断报告        双视角 Tab(HR/面试官);总分 + 维度雷达图 + 逐条建议
   │                  建议可点击 location → 右侧原文滚动并高亮(问题↔原文联动)
   └─ 优化对比        左右分栏:原版 vs 优化版,生成中骨架屏,可保存为新版本
```

- 深色模式:Tailwind `dark:` + 系统跟随 + 手动切换,状态存 localStorage。
- 雷达图:`recharts` 或 `echarts`。

## 8. 安全性专项(spawn CLI 风险面)

1. **命令注入防护** — 仅 `spawn('claude', [args], {shell:false})`,简历/prompt 经参数或 stdin 传入,永不进 shell 解析。
2. **仅监听回环** — 后端绑 `127.0.0.1`,不对外暴露。
3. **上传防护** — 限类型(pdf/docx/md)+ 大小(≤10MB);文件名清洗;只读内容不落可执行文件;解析在内存/临时区。
4. **AI 输出当不可信数据** — 严格 schema 校验后入库;前端渲染 Markdown/富文本做净化,防 XSS。
5. **SQLite 全程参数化查询 + 事务**。
6. **超时与资源控制** — CLI 调用超时即 kill;限并发队列防进程堆积。
7. **机密处理** — 简历仅存本地;日志不打印简历全文。

### 性能可行性校验(实现期必做)
实现地基后,先用真实简历跑一遍解析+双诊断+优化,实测单次端到端延迟与本机资源占用。若 CLI 方案不可接受,切换适配层到 `ApiKeyProvider`(接口不变,业务零改),并在 spec 评审记录中更新结论。

## 9. 技术选型

- 前端:React 19 + Vite + TypeScript + Tailwind + recharts/echarts(雷达图)
- 后端:Node + Express + better-sqlite3 + pdf-parse(PDF)+ mammoth(docx)
- 共享:`packages/shared` TS 数据模型
- 仓库:monorepo(npm workspaces),`npm run dev` 一键起前后端
- 测试:Vitest — 重点测 AI 适配层(mock CLI)、JSON schema 校验、数据层 CRUD、API 错误路径

## 10. 后续阶段(预告,不在本阶段)
JD 适配 + 三个岗位维度 → 面试材料生成 → 知识训练(模块三)→ 模拟面试(模块四)→ 项目深挖(模块五)→ 错题本(模块六)→ AI Coach + 完整能力模型(模块七/九)。每阶段独立 spec → plan → 实现。
