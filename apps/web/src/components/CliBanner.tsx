import { useEffect, useState } from 'react'
import { api } from '../api'
import { AlertTriangle } from 'lucide-react'

export function CliBanner() {
  const [cli, setCli] = useState<{ ok: boolean; detail: string } | null>(null)
  useEffect(() => {
    api.health().then(r => setCli(r.cli)).catch(() => setCli({ ok: false, detail: '无法连接后端服务' }))
  }, [])
  if (!cli || cli.ok) return null
  return (
    <div className="border-b border-warn/30 bg-warn/10" role="alert">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-6 py-2.5 text-sm text-warn">
        <AlertTriangle size={16} className="shrink-0" />
        <span>{cli.detail}。请确认已安装并登录 Claude Code CLI，否则 AI 功能不可用。</span>
      </div>
    </div>
  )
}
