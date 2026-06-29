import type { StructuredResume, Review, JobDescription } from '@aios/shared'
async function j<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
  return res.json()
}
const json = (body: unknown): RequestInit => ({ method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
export const api = {
  health: () => j<{cli:{ok:boolean;detail:string}}>('/api/health'),
  listResumes: () => j<{id:number;title:string;createdAt:string}[]>('/api/resumes'),
  uploadResume: (file: File) => { const fd = new FormData(); fd.append('file', file)
    return j<{resumeId:number;versionId:number;structured:StructuredResume}>('/api/resumes', { method:'POST', body: fd }) },
  updateVersion: (id: number, structured: StructuredResume) =>
    j<{ok:true}>(`/api/resumes/versions/${id}`, { ...json({ structured }), method:'PUT' }),
  confirmVersion: (id: number) => j<{ok:true}>(`/api/resumes/versions/${id}/confirm`, { method:'POST' }),
  listJds: () => j<{id:number;title:string;company:string;createdAt:string}[]>('/api/jds'),
  createJd: (input: { title:string; company?:string; rawText:string }) =>
    j<{id:number; structured:JobDescription}>('/api/jds', json(input)),
  review: (versionId: number, jobDescriptionId?: number) =>
    j<{hr:Review;interviewer:Review;gap?:import('@aios/shared').GapAnalysis}>(
      '/api/reviews', json(jobDescriptionId == null ? { versionId } : { versionId, jobDescriptionId })),
  optimize: (versionId: number, suggestions: Review['suggestions']) =>
    j<{versionId:number;structured:StructuredResume}>('/api/optimize', json({ versionId, suggestions })),
}
