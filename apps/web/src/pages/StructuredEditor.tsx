import type { StructuredResume } from '@aios/shared'

const FIELD_LABELS: Record<keyof StructuredResume['basics'], string> = {
  name: '姓名', title: '求职意向 / 头衔', contact: '联系方式', summary: '个人简介',
}

export function StructuredEditor({ value, onChange }: { value: StructuredResume; onChange: (v: StructuredResume) => void }) {
  const setBasics = (k: keyof StructuredResume['basics'], v: string) =>
    onChange({ ...value, basics: { ...value.basics, [k]: v } })

  const inputCls =
    'w-full rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm text-text ' +
    'placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40'

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-text">基本信息</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['name', 'title', 'contact'] as const).map(k => (
            <label key={k} className="block space-y-1">
              <span className="text-xs font-medium text-muted">{FIELD_LABELS[k]}</span>
              <input aria-label={k} value={value.basics[k]} onChange={e => setBasics(k, e.target.value)}
                className={inputCls} placeholder={FIELD_LABELS[k]} />
            </label>
          ))}
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">{FIELD_LABELS.summary}</span>
          <textarea aria-label="summary" rows={4} value={value.basics.summary}
            onChange={e => setBasics('summary', e.target.value)} className={inputCls} placeholder={FIELD_LABELS.summary} />
        </label>
      </section>

      {value.projects.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-text">已解析的项目 <span className="text-xs font-normal text-faint">（{value.projects.length} 项，诊断时一并分析）</span></h3>
          <ul className="space-y-1.5">
            {value.projects.map((p, i) => (
              <li key={i} className="rounded-btn border border-border bg-surface-2 px-3 py-2 text-sm">
                <span className="font-medium text-text">{p.name || '未命名项目'}</span>
                {p.role && <span className="ml-2 text-xs text-muted">{p.role}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-faint">提示：基本信息可直接编辑修正；工作、项目、技能等已解析内容会一并进入诊断。</p>
    </div>
  )
}
