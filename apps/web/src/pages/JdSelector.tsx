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
