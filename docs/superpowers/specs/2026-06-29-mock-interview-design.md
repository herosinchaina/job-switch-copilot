# 模块四设计:AI 模拟面试中心(最小闭环)

- 日期:2026-06-29
- 状态:待评审
- 范围:新模块。一场有上下文的多轮模拟面试:配置 → AI 连续追问 → 逐轮评分 → 面试报告 → 差题沉淀。

## 1. 定位

AI 扮演真实面试官(非聊天机器人),基于简历(可选绑 JD)进行**连续追问式**模拟面试,逐轮评分,结束生成面试报告,并把答得差的问题打标沉淀(供后续模块六错题本 / 模块三知识库消费)。

复用现有地基:结构化简历、JD、AI 适配层、confirmed 门禁、prompt 模式。

## 2. 关键技术决策(已与用户确认)

**多轮上下文用 Claude CLI 会话(方案 B 为主),但权威数据存自己的 DB,CLI 会话失败时降级到方案 A。**

- AiProvider 新增可选「会话」能力:`startSession()` 生成 uuid;`continueSession(sessionId, {system?, prompt})` 续接。`ClaudeCliProvider` 用 `--session-id <uuid>`(首轮)/ `--resume <uuid>`(续轮)实现(已实测:跨进程上下文保持有效)。
- CLI 会话只当「AI 的工作记忆」(省 prompt 拼接);**我们的 SQLite 存每轮完整 Q&A,是权威数据源**(报告/沉淀/导出全靠它)。
- **降级**:若 `--resume` 调用失败(会话丢失/过期),自动改用方案 A —— 用 DB 里的历史 Q&A 拼进 prompt 无状态调用。保证稳定性不受 CLI 会话生命周期影响。
- 将来切 API Key provider:因上下文在我们 DB 里,可直接用降级路径(方案 A),零障碍。

## 3. 顶层约束(沿用)

- AI 调用经 `AiProvider`;返回 JSON 一律 zod 校验,失败重试一次再降级报错(`completeJson`)。
- SQLite 全程参数化;多步写用 `transaction`。
- 后端只绑 127.0.0.1;AI 输出当不可信数据,前端不用 `dangerouslySetInnerHTML`。
- 简历 version 必须 `confirmed` 才能开面试(沿用 409 门禁)。
- 轮次上限(默认 6)防止无限对话与失控成本;每次 AI 调用有超时(沿用)。
- TypeScript 严格模式;不破坏现有 57 个测试。
- node:sqlite;`CREATE TABLE IF NOT EXISTS` 迁移。

## 4. 数据模型(SQLite)

```
interview_sessions
  id INTEGER PK
  resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id)
  job_description_id INTEGER            -- 可空
  cli_session_id TEXT                   -- CLI 会话 uuid;降级时可为 NULL
  role TEXT NOT NULL                    -- 岗位(取自 JD 或用户填)
  round_type TEXT NOT NULL              -- 'tech' | 'hr'
  max_rounds INTEGER NOT NULL DEFAULT 6
  status TEXT NOT NULL DEFAULT 'active' -- 'active' | 'finished'
  report_json TEXT                      -- 结束后写入
  created_at TEXT DEFAULT (datetime('now'))

interview_turns
  id INTEGER PK
  session_id INTEGER NOT NULL REFERENCES interview_sessions(id)
  turn_index INTEGER NOT NULL           -- 0 起
  question TEXT NOT NULL
  answer TEXT                           -- 出题时为空,作答后回填
  score INTEGER                         -- 本轮 0-100,作答评分后回填
  feedback_json TEXT                    -- {highlights[],gaps[],better:string}
  is_weak INTEGER DEFAULT 0             -- 0/1;score < 阈值(60)→1
  created_at TEXT DEFAULT (datetime('now'))
```
> 纯新增表,向后兼容。

## 5. 共享数据模型(packages/shared)

新增 `interview.ts`:
```ts
RoundType = 'tech' | 'hr'

// 单轮评分反馈
TurnFeedbackSchema = {
  score: number            // 0-100
  highlights: string[]     // 回答亮点
  gaps: string[]           // 遗漏/缺陷
  better: string           // 更优回答方式(简述)
}

// AI 每次响应:对上一轮的评分(首轮无)+ 下一个问题(或结束信号)
InterviewStepSchema = {
  feedback: TurnFeedbackSchema | null  // 首轮为 null
  nextQuestion: string | null          // null = 面试结束
}

// 面试报告
InterviewReportSchema = {
  overallScore: number                 // 0-100
  dimensions: Array<{ name: string; score: number; comment: string }>  // 专业性/逻辑/表达/技术深度
  bestTurn: { question: string; why: string } | null
  worstTurn: { question: string; why: string } | null
  weaknesses: string[]                 // 暴露的知识短板
  nextSteps: string[]                  // 建议训练方向
}
```
- 导出类型 + `index.ts` 导出 `./interview`

## 6. AI 适配层扩展

`AiProvider` 接口新增(都可选,默认 provider 实现;不破坏现有 complete/stream):
```ts
startSession(): string                                   // 返回新 uuid(纯本地生成,不调 AI)
continueSession(sessionId: string, o: { system?: string; prompt: string }): Promise<string>
```
`ClaudeCliProvider`:
- `startSession()` → `crypto.randomUUID()`
- `continueSession(sid, o)` → spawn `claude -p --resume <sid> --output-format text`(首轮用 `--session-id <sid>`);经队列+超时;失败抛错(由 service 捕获降级)。
- 新增 `completeJsonSession(provider, schema, sessionId, o)` 助手:在会话上调用 + zod 校验 + 重试(类比现有 `completeJson`)。

## 7. 后端服务 `services/interview.ts`

- `startInterview(ai, db-less inputs): { cliSessionId, firstQuestion }`
  - 生成 cliSessionId;首轮 prompt 注入:面试官人设 + round_type + 简历 + 可选 JD + 「出第一个问题」;返回首问。
- `answerTurn(ai, ctx): InterviewStep`
  - ctx = { cliSessionId, roundType, history(降级用), answer, turnIndex, maxRounds, resume, jd? }
  - 优先 `continueSession`(B);**捕获失败 → 降级**用 `completeJson` + 拼 history(A)。
  - prompt:给出考生本轮回答 → 要求 AI 输出 `InterviewStep`(评本轮 + 下一问;若 turnIndex+1 >= maxRounds 则 nextQuestion=null 结束)。
- `generateReport(ai, session, turns): InterviewReport`
  - 把全部 Q&A + 逐轮分喂给 AI,产出报告(非流式整包 JSON)。

prompts:`interview-system.txt`(面试官人设+轮次风格)、`interview-step.txt`(评分+追问的 JSON 约束)、`interview-report.txt`(报告 JSON 约束)。约束:真实面试官口吻、基于简历不杜撰、只输出 JSON。

## 8. 后端路由 `routes/interviews.ts`

- `POST /api/interviews`(body `{versionId, jobDescriptionId?, roundType, maxRounds?}`)
  - version 必须 confirmed(否则 409);JD 若给须存在(否则 404)。
  - startInterview → 建 session(status=active,存 cli_session_id)+ 建 turn 0(question=首问,answer 空)。
  - 返回 `{ sessionId, turnIndex:0, question }`。
- `POST /api/interviews/:id/answer`(body `{answer}`)
  - session 须 active;取最新未答 turn,回填 answer。
  - answerTurn → 写本轮 score/feedback/is_weak;若有 nextQuestion → 建下一 turn;若 null → session 置 finished 并 generateReport 写 report_json。
  - 返回 `{ feedback, nextQuestion, turnIndex, finished, report? }`。
- `GET /api/interviews/:id` → session + turns(回看/报告页用)。
- `exportAll` 增加 interviewSessions + interviewTurns。
- 挂载 interviewsRouter。

## 9. 前端

api.ts:
- `startInterview({versionId, jobDescriptionId?, roundType, maxRounds?})`
- `answerInterview(sessionId, answer)`
- `getInterview(sessionId)`

新页 `pages/MockInterview.tsx`:
- **配置区**:轮次类型(技术面/HR 面)+ 可选 JD 选择器(复用 JdSelector)+ 轮次上限 → 「开始面试」。
- **对话区**:聊天式 UI —— AI 问题气泡 / 你的回答输入框;提交后展示本轮评分+点评(可折叠),AI 出下一问。流式感用骨架/loading。
- **结束**:展示面试报告(整体分 + 维度 + 最佳/最差 + 短板 + 下一步)。
- 纯文本渲染。入口:顶部导航新增「模拟面试」;App 状态机加该视图。

## 10. 测试

- shared:TurnFeedback/InterviewStep/InterviewReport schema 校验。
- 适配层:`continueSession` 用注入 fakeSpawn 验证首轮 `--session-id`、续轮 `--resume`、shell:false;`completeJsonSession` 校验+重试;失败抛错。
- 数据层:session/turns round-trip;is_weak 阈值;exportAll 含新表。
- 服务:startInterview 出首问;answerTurn 正常走会话 + **会话失败降级到拼 history**(关键用例);到达 maxRounds → nextQuestion null;generateReport 产出合法报告。
- 路由:开面试 409(未 confirmed)/ 404(未知 JD);answer 流转(评分→下一问→结束出报告);非 active session answer 报错。
- 前端:配置→开始→答一轮→看到评分与下一问;结束→报告渲染(jsdom)。

## 11. 向后兼容
纯新增表/服务/路由/页面;现有 57 测试与所有现有流程不变。AiProvider 新增方法为可选扩展,现有 complete/stream 不动。

## 12. 不在本阶段
- Leader 面/终面/项目深挖面/公司类型分化 —— 后续。
- 错题本管理、知识库、艾宾浩斯复习(消费 is_weak 数据)—— 模块六/三。
- 能力模型反向更新 —— 模块九。
