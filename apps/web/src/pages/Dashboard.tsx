export function Dashboard() {
  return <div className="grid gap-4 sm:grid-cols-2">
    <div className="rounded border border-slate-200 dark:border-slate-800 p-4">
      <h3 className="font-medium">Offer Readiness</h3>
      <p className="mt-2 text-sm text-slate-500">简历质量:已接入 · 其他能力维度待解锁(后续阶段)</p>
    </div>
    <div className="rounded border border-slate-200 dark:border-slate-800 p-4 text-sm text-slate-400">
      今日训练任务 — 待解锁</div>
  </div>
}
