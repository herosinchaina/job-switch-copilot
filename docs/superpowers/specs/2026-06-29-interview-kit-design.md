# 简历模块·阶段三设计:面试材料生成(讲述型)

- 日期:2026-06-29
- 状态:待评审
- 范围:在简历大师 + JD 分析之上,新增「面试材料生成」——基于结构化简历(可选绑 JD)生成讲述型材料:自我介绍 + 项目讲解模板。

## 1. 背景与边界

简历闭环(阶段一)与 JD 分析(阶段二)已完成。本阶段补简历模块最后一块:面试材料。

**关键边界(已与用户确认):本阶段只做「讲述型」材料,不做「问题集/对练」。**
- 做:自我介绍(30 秒 / 1-2 分钟两版)、每个项目的 STAR 讲解模板。
- 不做:HR 高频 Q&A、技术高频 Q&A、项目追问/深挖问题 —— 这些与后续模块四(AI 模拟面试)、模块五(项目深挖)在"问题"层面重叠,归属那里(有连续追问 + 评分 + 错题闭环)。
- 讲述型与对练型互补:本阶段是"你该怎么讲",后续模块是"面试官怎么拷问你"。

## 2. 顶层约束(沿用)

- AI 调用经 `AiProvider` 适配层;返回 JSON 一律 zod 校验,失败重试一次再降级报错(沿用 `completeJson`)。
- 材料包一次 AI 调用产出整包 JSON(**非流式**,避免残缺);前端骨架屏。
- 真实性约束:不编造简历中没有的经历;项目讲解严格基于简历已有内容。
- SQLite 全程参数化;后端只绑 127.0.0.1;AI 输出当不可信数据,前端不使用 `dangerouslySetInnerHTML`。
- 简历 version 必须 `status === 'confirmed'` 才能生成材料,否则 409(沿用门禁)。
- TypeScript 严格模式;不破坏现有 45 个测试。
- node:sqlite:`CREATE TABLE IF NOT EXISTS` 迁移。

## 3. 数据模型变更

### 新增表 `interview_kits`
```
interview_kits
  id INTEGER PK
  resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id)
  job_description_id INTEGER          -- 可空;绑定的 JD(岗位定制)
  kit_json TEXT NOT NULL              -- 完整材料包(见 §4)
  created_at TEXT DEFAULT (datetime('now'))
```
> 不改动现有表;纯新增,完全向后兼容。

## 4. 共享数据模型(packages/shared)

新增 `kit.ts`:
```ts
InterviewKitSchema = {
  selfIntro: {
    short: string      // 30 秒版自我介绍
    standard: string   // 1-2 分钟版自我介绍
  }
  projectPitches: Array<{
    projectName: string
    situation: string  // S
    task: string       // T
    action: string     // A
    result: string     // R
  }>
}
```
- 类型 `InterviewKit = z.infer<typeof InterviewKitSchema>`
- `index.ts` 导出 `./kit`

## 5. 后端变更

### 新服务 `services/kit.ts`
- `generateKit(ai, resume: StructuredResume, jd?: JobDescription): Promise<InterviewKit>`
  - 无 jd → 通用版(prompt: kit.txt)
  - 有 jd → 岗位定制版(prompt: kit-with-jd.txt;自我介绍突出 JD 关键能力,项目讲解侧重与 JD 相关的项目/技术)
  - 经 `completeJson(ai, InterviewKitSchema, ...)`,zod 校验 + 重试。

### Prompt 文件(apps/server/src/prompts/)
- `kit.txt` — 通用:基于结构化简历生成自我介绍(两版)+ 每个项目的 STAR 讲解。只输出 JSON,不编造经历。
- `kit-with-jd.txt` — 岗位定制:同上,但结合 JD,自我介绍突出与岗位匹配的能力,项目讲解强调与 JD 相关的技术与成果。

### 数据层 `db/repo.ts`
- `createKit(db, {resumeVersionId, jobDescriptionId, kit}): number`
- `getKit(db, id): { id, resumeVersionId, jobDescriptionId, kit:InterviewKit } | undefined`(读回 zod 校验)
- `exportAll` 增加 `interviewKits`。

### 路由 `routes/kits.ts`
- `POST /api/kits`(body `{versionId, jobDescriptionId?}`):
  - version 必须存在且 confirmed,否则 404 / 409(沿用)。
  - 有 jobDescriptionId → 校验 JD 存在(否则 404),取其 structured 传给 generateKit。
  - 调 generateKit → createKit 入库 → 返回 `{ id, kit }`。
- 挂载到 `index.ts` 的 createApp。

## 6. 前端变更

### api.ts
- `generateKit(versionId, jobDescriptionId?): Promise<{id, kit:InterviewKit}>`

### 诊断报告页(ResumeReview.tsx)
- 在诊断结果区底部(优化按钮旁)新增「生成面试材料」按钮。点击 → 进入材料页(或弹出区域)。
- 若当前诊断绑定了 JD,生成材料时复用同一 jobDescriptionId(岗位定制);否则通用版。

### 新页 `pages/InterviewKit.tsx`
- 调 `api.generateKit(versionId, jdId?)`,生成中骨架屏。
- 展示:
  - 自我介绍:两个卡片(30 秒 / 1-2 分钟),每个带「复制」按钮。
  - 项目讲解:每个项目一张卡片,STAR 四段分区展示(情境/任务/行动/结果),带「复制」。
- 纯文本渲染(无 dangerouslySetInnerHTML)。

> 入口与流转沿用现有 App.tsx 的状态机模式(类似 optimize 流程:ResumeReview 触发 → 渲染 InterviewKit)。

## 7. 测试

- shared:InterviewKitSchema 校验(合法包通过;缺字段抛错)。
- 数据层:createKit/getKit round-trip(含可空 jobDescriptionId);exportAll 含 interviewKits。
- 服务:generateKit(fake AiProvider)无 jd / 有 jd 均返回合法 kit;prompt 选择正确(捕获 system 验证 kit-with-jd.txt 被选)。
- 路由:POST /api/kits 未 confirmed → 409;version 不存在 → 404;未知 jobDescriptionId → 404;正常 → 返回 {id, kit}。
- 前端:InterviewKit 页骨架屏 → 渲染自我介绍与项目讲解(jsdom);复制按钮存在。

## 8. 向后兼容
- 纯新增表与新路由;现有 45 个测试与所有现有流程行为不变。

## 9. 不在本阶段
- HR/技术 Q&A、项目追问、连续对练、评分 —— 归模块四(模拟面试)/模块五(项目深挖)。
- 多岗位适配(自动改写简历)—— 独立阶段。
