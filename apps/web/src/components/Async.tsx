import type { ReactNode } from 'react'
export interface AsyncState<T> { loading?: boolean; error?: string; data?: T }
export function AsyncView<T>(
  { state, empty, loadingNode, children }:
  { state: AsyncState<T>; empty?: ReactNode; loadingNode?: ReactNode; children: (d: T) => ReactNode },
) {
  if (state.loading) return <>{loadingNode ?? <div className="text-sm text-muted">加载中…</div>}</>
  if (state.error)
    return <div className="rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">出错了：{state.error}</div>
  if (state.data === undefined || state.data === null) return <>{empty ?? <div className="text-sm text-faint">暂无数据</div>}</>
  return <>{children(state.data)}</>
}
