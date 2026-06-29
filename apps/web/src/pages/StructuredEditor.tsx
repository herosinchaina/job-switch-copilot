import type { StructuredResume } from '@aios/shared'
export function StructuredEditor({ value, onChange }: { value: StructuredResume; onChange: (v: StructuredResume) => void }) {
  const setBasics = (k: keyof StructuredResume['basics'], v: string) =>
    onChange({ ...value, basics: { ...value.basics, [k]: v } })
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="font-medium">基本信息</h3>
        {(['name','title','contact','summary'] as const).map(k => (
          <input key={k} aria-label={k} value={value.basics[k]} onChange={e => setBasics(k, e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1.5 text-sm" placeholder={k} />
        ))}
      </section>
      <p className="text-xs text-slate-500">工作/项目/技能等可继续在此编辑(逐分区受控);确认后才进入诊断。</p>
    </div>
  )
}
