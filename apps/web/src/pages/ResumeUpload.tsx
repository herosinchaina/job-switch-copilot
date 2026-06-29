import { useState } from 'react'
import { api } from '../api'
import type { StructuredResume } from '@aios/shared'
import { StructuredEditor } from './StructuredEditor'

export function ResumeUpload({ onConfirmed, onDraft }: {
  onConfirmed: (versionId: number) => void
  onDraft?: (structured: StructuredResume) => void
}) {
  const [versionId, setVersionId] = useState<number | null>(null)
  const [draft, setDraft] = useState<StructuredResume | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>('')

  async function onFile(file: File) {
    setBusy(true); setError('')
    try { const r = await api.uploadResume(file); setVersionId(r.versionId); setDraft(r.structured) }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function confirm() {
    if (!versionId || !draft) return
    setBusy(true); setError('')
    try { await api.updateVersion(versionId, draft); await api.confirmVersion(versionId); onDraft?.(draft); onConfirmed(versionId) }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4 max-w-2xl">
      <label className="block text-sm">上传简历(pdf/docx/md)
        <input type="file" accept=".pdf,.docx,.md" disabled={busy}
          onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} className="mt-2 block" /></label>
      {busy && <p className="text-sm text-slate-500">处理中…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {draft && (<>
        <p className="text-sm text-amber-600">请核对 AI 解析结果,修正后再确认 —— 确认后才能诊断。</p>
        <StructuredEditor value={draft} onChange={setDraft} />
        <button onClick={confirm} disabled={busy}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white">确认无误,进入诊断</button>
      </>)}
    </div>
  )
}
