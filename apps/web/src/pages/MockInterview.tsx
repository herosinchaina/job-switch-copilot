import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { JdSelector } from './JdSelector'
import { Card, Button } from '../components/ui'
import { ChevronLeft, Loader2 } from 'lucide-react'
import type { RoundType, TurnFeedback, InterviewReport } from '@aios/shared'

type Msg = { role: 'ai' | 'me'; text: string; feedback?: TurnFeedback }
type SessionSummary = { id:number; role:string; roundType:RoundType; status:'active'|'finished'; overallScore:number|null; createdAt:string }

export function MockInterview({ versionId, onBack }: { versionId: number; onBack: () => void }) {
  const [phase, setPhase] = useState<'config' | 'chat' | 'done' | 'review'>('config')
  const [roundType, setRoundType] = useState<RoundType>('tech')
  const [jdId, setJdId] = useState<number | null>(null)
  const [maxRounds, setMaxRounds] = useState(6)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<InterviewReport | null>(null)
  const [history, setHistory] = useState<SessionSummary[]>([])
  const [reviewMsgs, setReviewMsgs] = useState<Msg[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  // 进入配置页时加载历史面试列表
  useEffect(() => {
    if (phase !== 'config') return
    api.listInterviews().then(setHistory).catch(() => {})
  }, [phase])

  // 对话更新后自动滚到底部(遵守 prefers-reduced-motion)
  useEffect(() => {
    if (phase !== 'chat') return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
  }, [msgs, busy, phase])

  async function openReview(id: number) {
    setBusy(true); setError('')
    try {
      const r = await api.getInterview(id)
      // 把 turns 还原为对话气泡:每轮 = AI 问题 + 我的回答(带评分)
      const msgs: Msg[] = []
      for (const t of r.turns) {
        msgs.push({ role: 'ai', text: t.question })
        if (t.answer != null) msgs.push({ role: 'me', text: t.answer, feedback: t.feedback ?? undefined })
      }
      setReviewMsgs(msgs)
      setReport(r.session.report ?? null)
      setPhase('review')
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  async function start() {
    setBusy(true); setError('')
    try {
      const r = await api.startInterview({ versionId, jobDescriptionId: jdId ?? undefined, roundType, maxRounds })
      setSessionId(r.sessionId); setMsgs([{ role:'ai', text:r.question }]); setPhase('chat')
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function submit() {
    if (!sessionId || !input.trim()) return
    const myAnswer = input
    setMsgs(m => [...m, { role:'me', text: myAnswer }]); setInput(''); setBusy(true); setError('')
    try {
      const r = await api.answerInterview(sessionId, myAnswer)
      setMsgs(m => {
        const copy = [...m]
        for (let i = copy.length - 1; i >= 0; i--) if (copy[i].role === 'me') { copy[i] = { ...copy[i], feedback: r.feedback ?? undefined }; break }
        return copy
      })
      if (r.finished && r.report) { setReport(r.report); setPhase('done') }
      else if (r.nextQuestion) setMsgs(m => [...m, { role:'ai', text: r.nextQuestion! }])
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter 提交,Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!busy) submit()
    }
  }

  const Back = () => (
    <button onClick={onBack} className="flex cursor-pointer items-center gap-1 text-sm text-muted hover:text-text">
      <ChevronLeft size={15} /> 返回
    </button>
  )

  if (phase === 'config') {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Back />
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-text">配置模拟面试</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">轮次类型</span>
            {(['tech','hr'] as const).map(t => (
              <button key={t} onClick={() => setRoundType(t)}
                className={`cursor-pointer rounded-btn px-3 py-1.5 text-sm ${roundType===t?'bg-accent text-white':'bg-surface-2 text-muted hover:text-text'}`}>
                {t==='tech'?'技术面':'HR 面'}
              </button>))}
          </div>
          <JdSelector value={jdId} onChange={setJdId} />
          <label className="flex items-center gap-2 text-sm text-muted">轮次上限
            <input type="number" min={3} max={12} value={maxRounds} onChange={e => setMaxRounds(Number(e.target.value)||6)}
              className="w-20 rounded-btn border border-border bg-surface-2 px-2 py-1 text-text" />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end">
            <Button variant="primary" onClick={start} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : null} 开始面试</Button>
          </div>
        </Card>

        {history.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-text">历史面试</h2>
            <div className="space-y-2">
              {history.map(h => (
                <button key={h.id} onClick={() => openReview(h.id)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-card border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-2">
                  <div>
                    <span className="text-sm font-medium text-text">{h.role} · {h.roundType === 'tech' ? '技术面' : 'HR 面'}</span>
                    <span className="ml-2 text-xs text-faint">{h.createdAt}</span>
                  </div>
                  <span className="text-sm text-muted">
                    {h.status === 'finished' ? `${h.overallScore} 分` : '进行中'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if ((phase === 'done' || phase === 'review') && (report || phase === 'review')) {
    const isReview = phase === 'review'
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <button onClick={() => isReview ? setPhase('config') : onBack()} className="flex cursor-pointer items-center gap-1 text-sm text-muted hover:text-text">
          <ChevronLeft size={15} /> 返回
        </button>
        <h1 className="text-xl font-semibold tracking-tight">{isReview ? '面试回看' : '面试报告'}</h1>

        {isReview && reviewMsgs.length > 0 && (
          <div className="space-y-3">
            {reviewMsgs.map((m, i) => (
              <div key={i} className={m.role==='ai' ? '' : 'flex flex-col items-end'}>
                <div className={`max-w-[85%] rounded-card px-4 py-2.5 text-sm ${m.role==='ai' ? 'bg-surface-2 text-text' : 'bg-accent text-white'}`}>{m.text}</div>
                {m.feedback && (
                  <div className="mt-1 max-w-[85%] rounded-card border border-border bg-surface p-3 text-xs text-muted">
                    <span className="font-medium text-text">本轮评分 {m.feedback.score}</span>
                    {m.feedback.gaps.length > 0 && <p className="mt-1">待改进：{m.feedback.gaps.join('；')}</p>}
                    {m.feedback.better && <p className="mt-1">更优答法：{m.feedback.better}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {report ? (<>
          <Card className="p-5">
            <div className="text-3xl font-semibold text-accent">{report.overallScore}<span className="text-sm text-muted"> / 100</span></div>
            <div className="mt-4 space-y-2">
              {report.dimensions.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm"><span className="text-text">{d.name}</span><span className="text-muted">{d.score} · {d.comment}</span></div>
              ))}
            </div>
          </Card>
          {report.weaknesses.length > 0 && (
            <Card className="p-5"><h3 className="mb-2 text-sm font-semibold text-text">暴露的短板</h3>
              <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted">{report.weaknesses.map((w,i)=><li key={i}>{w}</li>)}</ul></Card>
          )}
          {report.nextSteps.length > 0 && (
            <Card className="p-5"><h3 className="mb-2 text-sm font-semibold text-text">下一步训练建议</h3>
              <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted">{report.nextSteps.map((s,i)=><li key={i}>{s}</li>)}</ul></Card>
          )}
        </>) : (
          <p className="text-sm text-muted">这场面试尚未完成,暂无报告。</p>
        )}
      </div>
    )
  }

  // chat
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Back />
      <div className="space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role==='ai' ? '' : 'flex flex-col items-end'}>
            <div className={`max-w-[85%] rounded-card px-4 py-2.5 text-sm ${m.role==='ai' ? 'bg-surface-2 text-text' : 'bg-accent text-white'}`}>
              {m.text}
            </div>
            {m.feedback && (
              <div className="mt-1 max-w-[85%] rounded-card border border-border bg-surface p-3 text-xs text-muted">
                <span className="font-medium text-text">本轮评分 {m.feedback.score}</span>
                {m.feedback.gaps.length > 0 && <p className="mt-1">待改进：{m.feedback.gaps.join('；')}</p>}
                {m.feedback.better && <p className="mt-1">更优答法：{m.feedback.better}</p>}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> 面试官思考中…</div>}
        <div ref={endRef} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <textarea aria-label="你的回答" rows={3} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onInputKeyDown} disabled={busy}
          className="flex-1 rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
          placeholder="输入你的回答…（Enter 提交，Shift+Enter 换行）" />
        <Button variant="primary" onClick={submit} disabled={busy}>提交回答</Button>
      </div>
    </div>
  )
}
