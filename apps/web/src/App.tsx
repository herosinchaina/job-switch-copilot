import { useState } from 'react'
import { useTheme } from './theme'
export default function App() {
  const { dark, toggle } = useTheme()
  const [route] = useState<'dashboard'|'resume'>('resume')
  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-3">
        <span className="font-semibold">AI 求职操作系统</span>
        <button onClick={toggle} className="text-sm">{dark ? '☀️' : '🌙'}</button>
      </header>
      <main className="p-6">{/* Task 9-11 在此挂载页面;route=' + route + ' */}</main>
    </div>
  )
}
