import { useEffect, useState } from 'react'
import { api } from '../api'
import type { StructuredResume, Review } from '@aios/shared'
import { Card, Badge } from '../components/ui'
import { CheckCircle2 } from 'lucide-react'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-faint">{title}</h4>
      {children}
    </div>
  )
}

function ResumeBody({ r }: { r: StructuredResume }) {
  return (
    <div className="space-y-4">
      <Section title="基本信息">
        <p className="text-sm font-semibold text-text">{r.basics.name} · {r.basics.title}</p>
        {r.basics.contact && <p className="text-xs text-muted">{r.basics.contact}</p>}
        {r.basics.summary && <p className="mt-1 whitespace-pre-line text-sm text-muted">{r.basics.summary}</p>}
      </Section>
      {r.work.length > 0 && (
        <Section title="工作经历">
          {r.work.map((w, i) => (
            <div key={i} className="text-sm">
              <p className="font-medium text-text">{w.company} · {w.role} <span className="text-xs font-normal text-faint">{w.period}</span></p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">{w.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
            </div>
          ))}
        </Section>
      )}
      {r.projects.length > 0 && (
        <Section title="项目经历">
          {r.projects.map((p, i) => (
            <div key={i} className="text-sm">
              <p className="font-medium text-text">{p.name} <span className="text-xs font-normal text-faint">{p.role}</span></p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">{p.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
            </div>
          ))}
        </Section>
      )}
    </div>
  )
}

function PaneSkeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-5 w-1/2 rounded" />
      <div className="skeleton h-20 w-full rounded-card" />
      <div className="skeleton h-32 w-full rounded-card" />
    </div>
  )
}

export function ResumeCompare({ baseVersionId, base, suggestions, onSaved }: {
  baseVersionId: number; base: StructuredResume; suggestions: Review['suggestions']; onSaved: (versionId: number, structured: StructuredResume) => void
}) {
  const [opt, setOpt] = useState<StructuredResume | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.optimize(baseVersionId, suggestions).then(r => { setOpt(r.structured); onSaved(r.versionId, r.structured) }).catch(e => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseVersionId])

  if (error)
    return <div className="rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">优化失败：{error}</div>

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">优化前后对比</h1>
        <p className="mt-1 text-sm text-muted">AI 在保持内容真实的前提下优化表达，已自动保存为新版本。</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Badge tone="muted">原版</Badge>
          </div>
          <ResumeBody r={base} />
        </Card>
        <Card className="border-success/30 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Badge tone="accent">优化版</Badge>
            {opt && <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 size={13} /> 已保存</span>}
          </div>
          {opt ? <ResumeBody r={opt} /> : <PaneSkeleton />}
        </Card>
      </div>
      {!opt && <p className="text-center text-sm text-muted">优化版生成中，约需 1 分钟…</p>}
    </div>
  )
}
