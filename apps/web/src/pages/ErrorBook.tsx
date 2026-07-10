import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, Button, Badge } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { Target, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import type { KnowledgeItem, KnowledgeAttemptFeedback } from '@aios/shared'

const SOURCE_LABEL: Record<string, string> = { interview: '模拟面试', deepdive: '项目深挖' }
type BookItem = KnowledgeItem & { attemptCount: number }
type Tab = 'pending' | 'conquered' | 'insight'

export function ErrorBook() {
  const [tab, setTab] = useState<Tab>('pending')
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <Target size={20} className="text-accent" />
        <h1 className="text-xl font-semibold tracking-tight">错题本</h1>
      </div>
      <div className="flex gap-1">
        {(['pending', 'conquered', 'insight'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`cursor-pointer rounded-btn px-3 py-1.5 text-sm font-medium transition-colors ${tab === t ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'}`}>
            {t === 'pending' ? '待攻克' : t === 'conquered' ? '已攻克' : '洞察'}
          </button>
        ))}
      </div>
      {tab === 'insight' ? <Insight /> : <List key={tab} status={tab} />}
    </div>
  )
}

function List({ status }: { status: 'pending' | 'conquered' }) {
  const [items, setItems] = useState<BookItem[] | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  async function load() { setItems(await api.listErrorBook({ status }).catch(() => [])) }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [status])

  if (items === null) return <div className="flex items-center gap-2 py-8 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> 加载中…</div>
  if (items.length === 0) return <Card className="p-6 text-sm text-muted">{status === 'pending' ? '没有待攻克的错题。去「模拟面试」或「项目深挖」答错的题,存入知识库后会出现在这里。' : '还没有攻克任何错题,加油!'}</Card>

  return (
    <div className="space-y-2">
      {items.map(it => (
        <Card key={it.id} className="p-4">
          <button onClick={() => setExpanded(e => e === it.id ? null : it.id)} className="w-full cursor-pointer text-left">
            <p className="text-sm font-medium text-text">{it.question}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {it.tags.map(t => <Badge key={t} tone="accent">{t}</Badge>)}
              <Badge tone="muted">{SOURCE_LABEL[it.source] ?? it.source}</Badge>
              {it.conqueredAt && <Badge tone="accent">已攻克 🎉</Badge>}
              <span className="text-xs text-faint">重做 {it.attemptCount} 次</span>
            </div>
          </button>
          {expanded === it.id && <Redo item={it} onConquered={load} />}
        </Card>
      ))}
    </div>
  )
}

function Redo({ item, onConquered }: { item: BookItem; onConquered: () => void }) {
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState<KnowledgeAttemptFeedback | null>(null)
  const [error, setError] = useState('')

  async function submit() {
    if (!answer.trim()) { setError('答案不能为空'); return }
    setBusy(true); setError('')
    try {
      const res = await api.submitAttempt(item.id, answer.trim())
      setFb(res.feedback)
      if (res.conquered) onConquered()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  const field = 'w-full rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40'
  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {item.reference && <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">参考答案</p><Markdown>{item.reference}</Markdown></div>}
      <label className="block space-y-1"><span className="text-sm text-muted">重做答案(支持 Markdown)</span>
        <textarea aria-label="重做答案" rows={4} value={answer} onChange={e => setAnswer(e.target.value)} className={field} /></label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button variant="primary" onClick={submit} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : null} 让 AI 评分</Button>
      {fb && (
        <div className="space-y-2 rounded-card border border-border bg-surface-2 p-3">
          <div className="flex items-center gap-2">
            {fb.verdict === 'pass' ? <CheckCircle2 size={16} className="text-success" /> : <XCircle size={16} className="text-danger" />}
            <span className="text-sm font-medium">{fb.verdict === 'pass' ? '通过' : '未通过'} · {fb.score} 分</span>
          </div>
          <Markdown>{fb.comment}</Markdown>
          {fb.gaps.length > 0 && (
            <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">仍需补强</p>
              <ul className="list-disc pl-5 text-sm text-muted">{fb.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>
          )}
        </div>
      )}
    </div>
  )
}

function Insight() {
  const [s, setS] = useState<Awaited<ReturnType<typeof api.errorBookStats>> | null>(null)
  useEffect(() => { api.errorBookStats().then(setS).catch(() => {}) }, [])
  if (!s) return <div className="flex items-center gap-2 py-8 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> 加载中…</div>

  const metrics = [
    { label: '总错题', value: s.total }, { label: '待攻克', value: s.pending },
    { label: '已攻克', value: s.conquered }, { label: '近 7 天攻克', value: s.conqueredLast7Days },
  ]
  const maxTag = Math.max(1, ...s.byTag.map(t => t.count))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map(m => (
          <Card key={m.label} className="p-4"><p className="text-2xl font-semibold text-text">{m.value}</p><p className="text-xs text-muted">{m.label}</p></Card>
        ))}
      </div>
      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold text-text">按来源</p>
        {s.bySource.map(b => <div key={b.source} className="flex justify-between text-sm"><span className="text-muted">{SOURCE_LABEL[b.source] ?? b.source}</span><span className="text-text">{b.count}</span></div>)}
      </Card>
      <Card className="space-y-2 p-4">
        <p className="text-sm font-semibold text-text">薄弱知识点(未攻克)</p>
        {s.byTag.length === 0 ? <p className="text-sm text-muted">暂无标签数据</p> : s.byTag.map(t => (
          <div key={t.tag} className="space-y-1">
            <div className="flex justify-between text-xs"><span className="text-muted">{t.tag}</span><span className="text-faint">{t.count}</span></div>
            <div className="h-1.5 w-full rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${(t.count / maxTag) * 100}%` }} /></div>
          </div>
        ))}
      </Card>
    </div>
  )
}
