import type { ReactNode } from 'react'
export interface AsyncState<T> { loading?: boolean; error?: string; data?: T }
export function AsyncView<T>({ state, empty, children }: { state: AsyncState<T>; empty?: ReactNode; children: (d: T) => ReactNode }) {
  if (state.loading) return <div className="text-sm text-slate-500">加载中…</div>
  if (state.error) return <div className="text-sm text-red-500">出错了:{state.error}</div>
  if (state.data === undefined || state.data === null) return <>{empty ?? <div className="text-sm text-slate-400">暂无数据</div>}</>
  return <>{children(state.data)}</>
}
