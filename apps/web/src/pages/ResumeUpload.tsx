import { useState } from 'react'
import { api } from '../api'
import type { StructuredResume } from '@aios/shared'
import { StructuredEditor } from './StructuredEditor'
import { Card, Button } from '../components/ui'
import { UploadCloud, FileText, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'

export function ResumeUpload({ onConfirmed, onDraft }: {
  onConfirmed: (versionId: number) => void
  onDraft?: (structured: StructuredResume) => void
}) {
  const [versionId, setVersionId] = useState<number | null>(null)
  const [draft, setDraft] = useState<StructuredResume | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>('')
  const [fileName, setFileName] = useState<string>('')

  async function onFile(file: File) {
    setBusy(true); setError(''); setFileName(file.name)
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">简历大师</h1>
        <p className="mt-1 text-sm text-muted">上传简历，AI 解析为结构化内容 → 你校对确认 → HR / 面试官双视角诊断 → 一键生成优化版。</p>
      </div>

      {!draft && (
        <Card className="p-1">
          <label
            htmlFor="resume-file"
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[0.75rem] border-2 border-dashed border-border px-6 py-14 text-center transition-colors hover:border-accent/60 hover:bg-surface-2 ${busy ? 'pointer-events-none opacity-60' : ''}`}
          >
            <div className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
              {busy ? <Loader2 size={22} className="animate-spin" /> : <UploadCloud size={22} />}
            </div>
            <div>
              <p className="text-sm font-medium text-text">{busy ? 'AI 解析中，请稍候…' : '点击上传简历'}</p>
              <p className="mt-1 text-xs text-muted">支持 PDF / Word / Markdown，最大 10MB</p>
            </div>
            <input
              id="resume-file"
              type="file"
              accept=".pdf,.docx,.md"
              disabled={busy}
              aria-label="上传简历（pdf/docx/md）"
              onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
              className="sr-only"
            />
          </label>
        </Card>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {draft && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 rounded-card border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
            <ShieldCheck size={16} className="shrink-0" />
            请核对 AI 解析结果，修正后再确认 —— 确认后才能进入诊断。
          </div>
          {fileName && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <FileText size={14} /> {fileName}
            </div>
          )}
          <Card className="p-5">
            <StructuredEditor value={draft} onChange={setDraft} />
          </Card>
          <div className="flex justify-end">
            <Button onClick={confirm} disabled={busy} variant="primary">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
              确认无误，进入诊断
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
