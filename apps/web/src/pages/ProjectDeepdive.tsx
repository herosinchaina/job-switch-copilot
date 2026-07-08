import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Card, Button } from '../components/ui'
import { ChevronLeft, Loader2 } from 'lucide-react'
import type { StructuredResume, DeepdiveFeedback, ProjectMap } from '@aios/shared'

type Msg = { role: 'ai' | 'me'; text: string; feedback?: DeepdiveFeedback }
const DIM_LABEL: Record<keyof DeepdiveFeedback['scores'], string> = {
  techDepth:'技术深度', implementationClarity:'实现清晰度', architectureAwareness:'架构工程', metricsAwareness:'指标评估', expression:'表达质量',
}

export function ProjectDeepdive({ versionId, structured, onBack }: { versionId: number; structured: StructuredResume; onBack: () => void }) {
  const [phase, setPhase] = useState<'select'|'chat'|'done'>('select')
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [map, setMap] = useState<ProjectMap | null>(null)
  const [weakTurns, setWeakTurns] = useState<{ question:string; total:number; betterAnswer:string }[]>([])
  const [importMsg, setImportMsg] = useState('')
  const [importing, setImporting] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (phase !== 'chat') return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
  }, [msgs, busy, phase])

  async function start(projectName: string) {
    setBusy(true); setError('')
    try {
      const r = await api.startDeepdive({ versionId, projectName })
      setSessionId(r.sessionId); setMsgs([{ role:'ai', text:r.question }]); setPhase('chat')
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function submit() {
    if (!sessionId || !input.trim()) return
    const mine = input
    setMsgs(m => [...m, { role:'me', text: mine }]); setInput(''); setBusy(true); setError('')
    try {
      const r = await api.answerDeepdive(sessionId, mine)
      setMsgs(m => { const c = [...m]; for (let i=c.length-1;i>=0;i--) if (c[i].role==='me'){ c[i]={...c[i],feedback:r.feedback??undefined}; break } return c })
      if (r.finished && r.map) {
        setMap(r.map)
        try {
          const got = await api.getDeepdive(sessionId)
          setWeakTurns(got.turns.filter((t:any)=>t.isWeak).map((t:any)=>({ question:t.question, total:t.score, betterAnswer:t.feedback?.betterAnswer ?? '' })))
        } catch { /* map already shown; weak turns are best-effort */ }
        setPhase('done')
      } else if (r.nextQuestion) setMsgs(m => [...m, { role:'ai', text: r.nextQuestion! }])
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) { if (e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); if(!busy) submit() } }

  async function doImport() {
    if (sessionId == null) return
    setImporting(true); setImportMsg('')
    try {
      const r = await api.importKnowledge({ from: 'deepdive', sessionId })
      setImportMsg(`已存入 ${r.imported} 条${r.skipped ? `(${r.skipped} 条已存在)` : ''}`)
    } catch (e: any) { setImportMsg(`导入失败:${e.message}`) } finally { setImporting(false) }
  }

  const Back = () => (
    <button onClick={onBack} className="flex cursor-pointer items-center gap-1 text-sm text-muted hover:text-text"><ChevronLeft size={15} /> 返回</button>
  )

  if (phase === 'select') {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Back />
        <div><h1 className="text-xl font-semibold tracking-tight">项目深挖</h1>
          <p className="mt-1 text-sm text-muted">选一个简历项目,AI 面试官会围绕它连续追问技术细节并打分,最后生成项目知识地图。</p></div>
        {structured.projects.length === 0 ? (
          <Card className="p-5 text-sm text-muted">未检测到项目,请回「简历大师」补充并确认项目后再来。</Card>
        ) : (
          <div className="space-y-2">
            {structured.projects.map((p, i) => (
              <button key={i} onClick={() => start(p.name)} disabled={busy}
                className="flex w-full cursor-pointer items-center justify-between rounded-card border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-2">
                <div><span className="text-sm font-medium text-text">{p.name}</span>
                  <span className="ml-2 text-xs text-faint">{p.role}{p.stack.length ? ` · ${p.stack.slice(0,3).join('/')}` : ''}</span></div>
                {busy ? <Loader2 size={15} className="animate-spin text-muted" /> : <span className="text-xs text-accent">深挖 →</span>}
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    )
  }

  if (phase === 'done' && map) {
    const Section = ({ t, children }: { t:string; children:React.ReactNode }) => (
      <div className="space-y-1"><h4 className="text-xs font-semibold uppercase tracking-wide text-faint">{t}</h4>{children}</div>
    )
    const List = ({ items }: { items:string[] }) => items.length
      ? <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted">{items.map((x,i)=><li key={i}>{x}</li>)}</ul>
      : <p className="text-sm text-faint">—</p>
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Back />
        <h1 className="text-xl font-semibold tracking-tight">项目知识地图 · {map.projectName}</h1>
        <Card className="space-y-4 p-5">
          <Section t="项目背景"><p className="text-sm text-muted">{map.background}</p></Section>
          <Section t="业务目标"><p className="text-sm text-muted">{map.businessGoal}</p></Section>
          <Section t="技术方案"><p className="text-sm text-muted">{map.techApproach}</p></Section>
          <Section t="个人贡献"><p className="text-sm text-muted">{map.personalContribution}</p></Section>
          <Section t="核心难点"><List items={map.coreChallenges} /></Section>
          <Section t="替代方案"><List items={map.alternatives} /></Section>
          <Section t="效果评估"><p className="text-sm text-muted">{map.evaluation}</p></Section>
          <Section t="风险与排查"><List items={map.risks} /></Section>
          <Section t="可优化方向"><List items={map.optimizations} /></Section>
          <Section t="面试高频追问"><List items={map.hotQuestions} /></Section>
          <Section t="暴露的盲区"><List items={map.blindSpots} /></Section>
        </Card>
        {weakTurns.length > 0 && (
          <Card className="space-y-3 p-5">
            <h3 className="text-sm font-semibold text-text">本次薄弱问题</h3>
            {weakTurns.map((w, i) => (
              <div key={i} className="rounded-btn border border-border bg-surface-2 p-3 text-sm">
                <p className="font-medium text-text">{w.question} <span className="text-xs text-danger">({w.total}/50)</span></p>
                {w.betterAnswer && <p className="mt-1 text-muted">更优答法:{w.betterAnswer}</p>}
              </div>
            ))}
          </Card>
        )}
        {sessionId != null && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={doImport} disabled={importing}>
              {importing ? <Loader2 size={15} className="animate-spin" /> : null} 存入知识库
            </Button>
            {importMsg && <p className="text-sm text-muted">{importMsg}</p>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Back />
      <div className="space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role==='ai' ? '' : 'flex flex-col items-end'}>
            <div className={`max-w-[85%] whitespace-pre-line rounded-card px-4 py-2.5 text-sm ${m.role==='ai'?'bg-surface-2 text-text':'bg-accent text-white'}`}>{m.text}</div>
            {m.feedback && (
              <div className="mt-1 w-full max-w-[85%] space-y-2 rounded-card border border-border bg-surface p-3 text-xs">
                <div className="flex items-center justify-between"><span className="font-medium text-text">本轮 {m.feedback.total}/50</span></div>
                {(Object.keys(DIM_LABEL) as (keyof DeepdiveFeedback['scores'])[]).map(k => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-muted">{DIM_LABEL[k]}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-accent" style={{ width: `${m.feedback!.scores[k]*10}%` }} /></div>
                    <span className="w-6 text-right text-muted">{m.feedback!.scores[k]}</span>
                  </div>
                ))}
                {m.feedback.vague.length>0 && <p className="text-muted">空泛:{m.feedback.vague.join('；')}</p>}
                {m.feedback.betterAnswer && <p className="text-muted">更优答法:{m.feedback.betterAnswer}</p>}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> 面试官思考中…</div>}
        <div ref={endRef} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <textarea aria-label="你的回答" rows={3} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onKeyDown} disabled={busy}
          className="flex-1 rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
          placeholder="回答技术追问…（Enter 提交，Shift+Enter 换行）" />
        <Button variant="primary" onClick={submit} disabled={busy}>提交</Button>
      </div>
    </div>
  )
}
