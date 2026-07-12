import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Button } from '../components/ui'
import { ChevronLeft, ExternalLink, Loader2 } from 'lucide-react'
import type { ProgressStatus } from '@aios/shared'

type Msg = { role: 'ai' | 'me'; text: string }

export function LcGuide({ leetcodeId, onBack }: { leetcodeId: number; onBack: () => void }) {
  const [problem, setProblem] = useState<{ title:string; url:string; topic:string } | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    api.lcProblems().then(ps => { const p = ps.find(x => x.leetcodeId === leetcodeId); if (alive && p) setProblem({ title:p.title, url:p.url, topic:p.topic }) }).catch(()=>{})
    setBusy(true)
    api.startGuide(leetcodeId)
      .then(r => { if (!alive) return; setSessionId(r.sessionId); setMsgs([{ role:'ai', text:r.guidance }]) })
      .catch(e => { if (alive) setError(e.message) }).finally(() => { if (alive) setBusy(false) })
    return () => { alive = false }
  }, [leetcodeId])

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
  }, [msgs, busy])

  async function submit() {
    if (!sessionId || !input.trim() || done) return
    const mine = input
    setMsgs(m => [...m, { role:'me', text: mine }]); setInput(''); setBusy(true); setError('')
    try {
      const r = await api.stepGuide(sessionId, mine)
      setMsgs(m => [...m, { role:'ai', text: r.guidance }])
      if (r.done) setDone(true)
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) submit() }
  }
  function mark(status: ProgressStatus) { api.setLcProgress(leetcodeId, status).catch(()=>{}) }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <button onClick={onBack} className="flex cursor-pointer items-center gap-1 text-sm text-muted hover:text-text"><ChevronLeft size={15} className="shrink-0" /> 返回题库</button>
      {problem && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface p-4">
          <div>
            <span className="text-sm font-semibold text-text">{problem.title}</span>
            <span className="ml-2 text-xs text-faint">{problem.topic}</span>
            <a href={problem.url} target="_blank" rel="noreferrer" className="ml-3 inline-flex items-center gap-1 text-xs text-accent hover:underline">去 LeetCode 做题 <ExternalLink size={12} className="shrink-0" /></a>
          </div>
          <div className="flex items-center gap-1">
            {(['learning','mastered'] as const).map(s => (
              <button key={s} onClick={() => mark(s)} className="cursor-pointer rounded-btn bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-text">
                标记{s==='learning'?'学习中':'已掌握'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role==='ai' ? '' : 'flex flex-col items-end'}>
            <div className={`max-w-[85%] whitespace-pre-line rounded-card px-4 py-2.5 text-sm ${m.role==='ai' ? 'bg-surface-2 text-text' : 'bg-accent text-white'}`}>{m.text}</div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> 老师思考中…</div>}
        {done && <p className="text-center text-sm text-success">本题引导完成,记得动手在 LeetCode 上写一遍!</p>}
        <div ref={endRef} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!done && (
        <div className="flex gap-2">
          <textarea aria-label="你的思考" rows={3} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKeyDown} disabled={busy}
            className="flex-1 rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
            placeholder="写下你的思路…（Enter 提交，Shift+Enter 换行）" />
          <Button variant="primary" onClick={submit} disabled={busy}>提交</Button>
        </div>
      )}
    </div>
  )
}
