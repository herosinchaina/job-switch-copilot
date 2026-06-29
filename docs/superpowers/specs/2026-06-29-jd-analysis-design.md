# 简历模块·阶段二设计:JD 分析 + 岗位维度解锁

- 日期:2026-06-29
- 状态:待评审
- 范围:在已完成的简历大师之上,新增 JD(岗位描述)分析能力,并解锁因「无 JD」而后置的 3 个诊断维度。

## 1. 背景

阶段一交付了简历闭环(上传 → 解析 → 校对 → 双视角诊断 → 优化 → 对比),诊断固定 5 个不依赖岗位的维度(排版/专业度/STAR/量化/技术深度),并明确把「岗位匹配度 / ATS 兼容性 / 关键词覆盖」3 个依赖 JD 的维度后置。

本阶段补齐这条线:让用户上传目标岗位 JD,系统提取岗位要求,在诊断时可选绑定 JD,从而:
- 解锁上述 3 个诊断维度(凑齐 8 维);
- 额外产出「简历 ↔ JD 缺口分析」。

## 2. 顶层约束(沿用阶段一)

流畅性、稳定性、安全性第一优先级:
- AI 调用经统一 `AiProvider` 适配层,返回 JSON 一律 zod 校验,失败重试一次再降级报错,绝不静默崩溃。
- 长任务有进度反馈(骨架屏);限并发队列与超时沿用。
- SQLite 全程参数化;多步写操作用事务(沿用阶段一 `transaction` 助手)。
- 后端仅绑 127.0.0.1;上传限制沿用。
- TypeScript 严格模式。
- 不破坏现有 25 个测试。

## 3. 数据模型变更

### 新增表 `job_descriptions`
```
job_descriptions
  id INTEGER PK
  title TEXT NOT NULL          -- 岗位名称(用户填或从 JD 提取)
  company TEXT                 -- 公司(可空)
  raw_text TEXT NOT NULL       -- JD 原文
  structured_json TEXT NOT NULL-- AI 解析结果(见 §4)
  created_at TEXT
```

### `reviews` 表加列
```
reviews
  ... (现有列)
  job_description_id INTEGER   -- 可空;记录本次诊断绑定的 JD
  gap_json TEXT                -- 可空;绑定 JD 时的缺口分析(见 §4)
```
> 现有诊断(不绑 JD)这两列为 NULL,完全向后兼容。

## 4. 共享数据模型(packages/shared)

新增 `jd.ts`:
```ts
// JD 解析结构
JobDescriptionSchema = {
  role: string
  company: string            // 可为空串
  keywords: string[]         // 技术/工具关键词(ATS 关键词比对用)
  responsibilities: string[] // 岗位职责
  requirements: {
    must: string[]           // 硬性要求(学历/年限/必备技能)
    nice: string[]           // 加分项
  }
}

// 缺口分析结构(绑定 JD 诊断时产出)
GapAnalysisSchema = {
  matchScore: number          // 0-100 简历↔JD 综合匹配度
  missingKeywords: string[]   // JD 要求但简历缺失的关键词
  weakRequirements: string[]  // JD 硬性要求中简历体现不足的
  coveredHighlights: string[] // 简历已很好匹配的亮点
}
```

### 诊断维度扩展(review.ts)
```ts
DIMENSIONS_BASE = ['layout','professionalism','star','quantification','techDepth']  // 现有 5
DIMENSIONS_JD   = ['jobMatch','ats','keywordCoverage']                              // 新增 3
// DimensionKey = 两者并集(8 个)
```
- `ReviewSchema.dimensionScores` 的 `dimension` 枚举扩到 8 个。
- 约定:**不绑 JD 时只返回 5 个 base 维度**;**绑 JD 时返回全部 8 个**。校验放宽为「维度值必须属于 8 个之一」,数量不强制(由 service 控制传入哪几维)。

## 5. 后端变更

### 新服务 `services/jd.ts`
- `parseJd(ai, rawText): Promise<JobDescription>` — JD 原文 → 结构化(prompt: 严格 JSON,不杜撰)。
- `analyzeGap(ai, resume: StructuredResume, jd: JobDescription): Promise<GapAnalysis>` — 简历+JD → 缺口分析。

### 诊断服务升级 `services/review.ts`
- `reviewResume(ai, structured, perspective, jd?)`:
  - 无 `jd` → 现状,5 维度,prompt 用现有 review.txt。
  - 有 `jd` → 8 维度,prompt 用新增 review-with-jd.txt(把 JD 结构注入,要求额外评 jobMatch/ats/keywordCoverage)。
- 返回结构不变(Review),只是 dimensionScores 维度数不同。

### 数据层 `db/repo.ts` 新增
- `createJd(db, {title,company,rawText,structured}): number`
- `getJd(db, id): {id,title,company,structured} | undefined`
- `listJds(db): {id,title,company,createdAt}[]`
- `createReview` 扩展:接受可选 `jobDescriptionId` 和 `gap`,写入新列。
- `exportAll` 增加 `jobDescriptions` 表。

### 路由
- `POST /api/jds`(body: `{title, company?, rawText}`)→ parseJd → 入库 → 返回 `{id, structured}`。
- `GET /api/jds` → JD 列表。
- `POST /api/reviews` 扩展:body 可选 `jobDescriptionId`。
  - 无 → 现状双视角 5 维。
  - 有 → 校验 JD 存在;双视角各调一次(带 JD)8 维;再调一次 `analyzeGap`;一个事务写入两条 review(含 gap_json)。返回 `{hr, interviewer, gap}`。
  - 版本仍须 `confirmed`(沿用 409 门禁)。

### Prompt 文件(apps/server/src/prompts/)
- `jd.txt` — JD 解析:只输出符合 schema 的 JSON,不杜撰原文没有的要求。
- `gap.txt` — 缺口分析:基于简历与 JD,客观比对,不夸大匹配度。
- `review-with-jd.txt` — 带 JD 的诊断:在 5 base 维度外,新增 jobMatch/ats/keywordCoverage 三维,location 仍定位到简历字段。

## 6. 前端变更

### JD 管理(简历大师内新增轻量入口)
- 诊断页顶部新增「目标岗位(可选)」选择器:下拉选已有 JD,或「+ 添加 JD」打开一个简易表单(title/company/粘贴 JD 原文)→ 调 `POST /api/jds` 解析入库。
- 选中 JD 后点「开始诊断」→ 带 `jobDescriptionId` 调诊断。

### 诊断报告页升级
- 雷达图:绑 JD 时显示 8 维,否则 5 维(RadarChart 已按传入 scores 渲染,天然支持)。
- 绑 JD 时,报告新增「岗位匹配缺口」卡片:matchScore + missingKeywords(标签)+ weakRequirements(列表)+ coveredHighlights。
- 不绑 JD 时维持现状。

### api.ts 新增
- `createJd({title, company, rawText})`、`listJds()`
- `review(versionId, jobDescriptionId?)` 扩展可选参数。

## 7. 测试

- shared:JobDescriptionSchema / GapAnalysisSchema 校验;8 维 DimensionKey。
- 数据层:createJd/getJd/listJds round-trip;createReview 带 jobDescriptionId+gap 写入与读出。
- 服务:parseJd、analyzeGap(fake AiProvider);reviewResume 带 jd 返回 8 维。
- 路由:POST /api/jds 解析入库;POST /api/reviews 带 jobDescriptionId 返回含 gap,且未 confirmed 仍 409;不带 jobDescriptionId 维持 5 维行为(回归)。
- 前端:JD 选择器、缺口卡片渲染(jsdom)。

## 8. 向后兼容

- 所有新增列可空;旧诊断流程(不绑 JD)行为完全不变。
- DimensionKey 扩容是并集,旧的 5 维 review 数据仍合法。
- 迁移:`migrate()` 用 `CREATE TABLE IF NOT EXISTS` + 对 reviews 做 `ALTER TABLE ADD COLUMN`(若列不存在)。node:sqlite 支持 ALTER TABLE ADD COLUMN。

## 9. 不在本阶段
多岗位适配(针对 JD 自动生成适配版简历)、面试材料生成 —— 各自独立阶段。本阶段只做「分析与诊断」,不改写简历。
