import { useEffect, useState } from 'react'
import { api } from '../api'
export function CliBanner() {
  const [cli, setCli] = useState<{ok:boolean;detail:string}|null>(null)
  useEffect(() => { api.health().then(r => setCli(r.cli)).catch(() => setCli({ok:false,detail:'无法连接后端'})) }, [])
  if (!cli || cli.ok) return null
  return <div className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-sm px-4 py-2">
    ⚠️ {cli.detail}。请确认已安装并登录 Claude Code CLI,否则 AI 功能不可用。</div>
}
