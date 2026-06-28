import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AiProvider } from '../ai/provider'
import { completeJson } from '../ai/claude-cli'
import { StructuredResumeSchema, type StructuredResume } from '@aios/shared'

const PROMPT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../prompts/parse.txt'), 'utf8')

export async function extractText(buf: Buffer, format: 'pdf'|'docx'|'md'): Promise<string> {
  if (format === 'md') return buf.toString('utf8')
  if (format === 'pdf') { const pdf = (await import('pdf-parse')).default; return (await pdf(buf)).text }
  const mammoth = await import('mammoth'); return (await mammoth.extractRawText({ buffer: buf })).value
}

export async function parseResume(ai: AiProvider, rawText: string): Promise<StructuredResume> {
  return completeJson(ai, StructuredResumeSchema, { system: PROMPT, prompt: rawText })
}
