import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, Button, Badge } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { Plus, Pencil, Trash2, Search, Loader2, BookMarked } from 'lucide-react'
import type { KnowledgeItem, KnowledgeItemInput, ReviewGrade } from '@aios/shared'

const SOURCE_LABEL: Record<string, string> = { interview: '模拟面试', deepdive: '项目深挖', manual: '手动' }

type Filters = { q: string; source: string; tag: string; mastery: string }
type Editing = KnowledgeItem | 'new' | null

// 掌握度 5 点
function Mastery({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`掌握度 ${level}/5`}>
      {[0, 1, 2, 3, 4].map(i => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < level ? 'bg-accent' : 'bg-surface-2 ring-1 ring-border'}`} />
      ))}
    </span>
  )
}

export function KnowledgeBase() {
  const [tab, setTab] = useState<'library' | 'review'>('library')
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <BookMarked size={20} className="shrink-0 text-accent" />
        <h1 className="text-xl font-semibold tracking-tight">知识库</h1>
      </div>
      <div className="flex gap-1">
        {(['library', 'review'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`cursor-pointer rounded-btn px-3 py-1.5 text-sm font-medium transition-colors ${tab === t ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'}`}>
            {t === 'library' ? '知识库' : '今日复习'}
          </button>
        ))}
      </div>
      {tab === 'library' ? <Library /> : <Review />}
    </div>
  )
}

function Library() {
  const [filters, setFilters] = useState<Filters>({ q: '', source: '', tag: '', mastery: '' })
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Editing>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    try {
      const list = await api.listKnowledge({
        q: filters.q || undefined,
        source: filters.source || undefined,
        tag: filters.tag || undefined,
        mastery: filters.mastery === '' ? undefined : Number(filters.mastery),
      })
      setItems(list)
    } finally { setLoading(false) }
  }
  async function refresh() { await load(); setTags(await api.listKnowledgeTags().catch(() => [])) }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [filters])
  useEffect(() => { api.listKnowledgeTags().then(setTags).catch(() => {}) }, [])

  async function remove(id: number) {
    if (!window.confirm('确定删除这条知识吗?')) return
    await api.deleteKnowledge(id)
    await refresh()
  }

  if (editing) {
    return <ItemForm item={editing === 'new' ? null : editing}
      onCancel={() => setEditing(null)}
      onSaved={async () => { setEditing(null); await refresh() }} />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input aria-label="搜索" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
            placeholder="搜索问题/答案/参考…"
            className="w-full rounded-btn border border-border bg-surface-2 py-1.5 pl-8 pr-3 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40" />
        </div>
        <select aria-label="来源" value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}
          className="rounded-btn border border-border bg-surface-2 px-2 py-1.5 text-sm text-text">
          <option value="">全部来源</option>
          <option value="interview">模拟面试</option>
          <option value="deepdive">项目深挖</option>
          <option value="manual">手动</option>
        </select>
        <select aria-label="标签" value={filters.tag} onChange={e => setFilters(f => ({ ...f, tag: e.target.value }))}
          className="rounded-btn border border-border bg-surface-2 px-2 py-1.5 text-sm text-text">
          <option value="">全部标签</option>
          {tags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select aria-label="掌握度" value={filters.mastery} onChange={e => setFilters(f => ({ ...f, mastery: e.target.value }))}
          className="rounded-btn border border-border bg-surface-2 px-2 py-1.5 text-sm text-text">
          <option value="">全部掌握度</option>
          {[0, 1, 2, 3, 4, 5].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <Button variant="primary" onClick={() => setEditing('new')}><Plus size={15} className="shrink-0" /> 新增条目</Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted"><Loader2 size={15} className="shrink-0 animate-spin" /> 加载中…</div>
      ) : items.length === 0 ? (
        <Card className="p-6 text-sm text-muted">
          还没有知识条目。去「模拟面试」或「项目深挖」做几轮,答得不好的题会自动可导入这里,或点「新增条目」手写一条。
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(it => (
            <Card key={it.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => setExpanded(e => e === it.id ? null : it.id)}
                  className="flex-1 cursor-pointer text-left">
                  <p className="text-sm font-medium text-text">{it.question}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {it.tags.map(t => <Badge key={t} tone="accent">{t}</Badge>)}
                    <Badge tone="muted">{SOURCE_LABEL[it.source] ?? it.source}</Badge>
                    <Mastery level={it.mastery} />
                    <span className="text-xs text-faint">复习 {it.reviewDue}</span>
                  </div>
                </button>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => setEditing(it)} aria-label="编辑"
                    className="grid h-7 w-7 cursor-pointer place-items-center rounded-btn text-muted hover:bg-surface-2 hover:text-text"><Pencil size={14} /></button>
                  <button onClick={() => remove(it.id)} aria-label="删除"
                    className="grid h-7 w-7 cursor-pointer place-items-center rounded-btn text-muted hover:bg-surface-2 hover:text-danger"><Trash2 size={14} /></button>
                </div>
              </div>
              {expanded === it.id && (
                <div className="mt-3 space-y-3 border-t border-border pt-3">
                  {it.answer && <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">我的答</p><Markdown>{it.answer}</Markdown></div>}
                  {it.reference && <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">参考答案</p><Markdown>{it.reference}</Markdown></div>}
                  {it.note && <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">笔记</p><Markdown>{it.note}</Markdown></div>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function ItemForm({ item, onCancel, onSaved }: { item: KnowledgeItem | null; onCancel: () => void; onSaved: () => void }) {
  const [question, setQuestion] = useState(item?.question ?? '')
  const [answer, setAnswer] = useState(item?.answer ?? '')
  const [reference, setReference] = useState(item?.reference ?? '')
  const [tagsText, setTagsText] = useState((item?.tags ?? []).join(', '))
  const [note, setNote] = useState(item?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!question.trim()) { setError('问题不能为空'); return }
    setBusy(true); setError('')
    const input: KnowledgeItemInput = {
      question: question.trim(),
      answer: answer.trim() || null,
      reference: reference.trim() || null,
      tags: tagsText.split(',').map(t => t.trim()).filter(Boolean),
      note: note.trim() || null,
    }
    try {
      if (item) await api.updateKnowledge(item.id, input)
      else await api.createKnowledge(input)
      onSaved()
    } catch (e: any) { setError(e.message); setBusy(false) }
  }

  const field = 'w-full rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40'
  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-sm font-semibold text-text">{item ? '编辑条目' : '新增条目'}</h2>
      <label className="block space-y-1"><span className="text-sm text-muted">问题</span>
        <textarea aria-label="问题" rows={2} value={question} onChange={e => setQuestion(e.target.value)} className={field} /></label>
      <label className="block space-y-1"><span className="text-sm text-muted">我的答(可选,支持 Markdown)</span>
        <textarea aria-label="答案" rows={4} value={answer} onChange={e => setAnswer(e.target.value)} className={field} /></label>
      <label className="block space-y-1"><span className="text-sm text-muted">参考答案(可选,支持 Markdown)</span>
        <textarea aria-label="参考" rows={4} value={reference} onChange={e => setReference(e.target.value)} className={field} /></label>
      <label className="block space-y-1"><span className="text-sm text-muted">标签(逗号分隔)</span>
        <input aria-label="标签输入" value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="ai, rag, 系统设计" className={field} /></label>
      <label className="block space-y-1"><span className="text-sm text-muted">笔记(可选)</span>
        <textarea aria-label="笔记" rows={2} value={note} onChange={e => setNote(e.target.value)} className={field} /></label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>取消</Button>
        <Button variant="primary" onClick={save} disabled={busy}>{busy ? <Loader2 size={15} className="shrink-0 animate-spin" /> : null} 保存</Button>
      </div>
    </Card>
  )
}

function Review() {
  const [due, setDue] = useState<KnowledgeItem[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.listDue().then(d => { setDue(d); setIdx(0); setRevealed(false); setReviewed(0) }).catch(() => setDue([])) }, [])

  async function grade(g: ReviewGrade) {
    const cur = due?.[idx]
    if (!cur) return
    setBusy(true)
    try {
      await api.reviewKnowledge(cur.id, g)
      setReviewed(n => n + 1)
      setIdx(i => i + 1)
      setRevealed(false)
    } finally { setBusy(false) }
  }

  if (due === null) return <div className="flex items-center gap-2 py-8 text-sm text-muted"><Loader2 size={15} className="shrink-0 animate-spin" /> 加载中…</div>
  if (due.length === 0) return <Card className="p-6 text-center text-sm text-muted">今天没有需要复习的条目 🎉</Card>
  if (idx >= due.length) return <Card className="p-6 text-center text-sm text-muted">本次复习了 {reviewed} 张 🎉</Card>

  const cur = due[idx]
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">今日到期 {due.length} 张 · 进度 {idx + 1}/{due.length}</p>
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {cur.tags.map(t => <Badge key={t} tone="accent">{t}</Badge>)}
          <Badge tone="muted">{SOURCE_LABEL[cur.source] ?? cur.source}</Badge>
          <Mastery level={cur.mastery} />
        </div>
        <p className="text-base font-medium text-text">{cur.question}</p>
        {!revealed ? (
          <Button variant="secondary" onClick={() => setRevealed(true)}>显示答案</Button>
        ) : (
          <div className="space-y-3 border-t border-border pt-3">
            {cur.answer && <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">我的答</p><Markdown>{cur.answer}</Markdown></div>}
            {cur.reference && <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">参考答案</p><Markdown>{cur.reference}</Markdown></div>}
            {cur.note && <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">笔记</p><Markdown>{cur.note}</Markdown></div>}
            {!cur.answer && !cur.reference && !cur.note && <p className="text-sm text-faint">这条没有记录答案,凭记忆自评即可。</p>}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => grade('forgot')} disabled={busy}>没记住</Button>
              <Button variant="success" onClick={() => grade('remembered')} disabled={busy}>记住了</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
