import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// 受控 Markdown:仅 remark-gfm,不启用 rehype-raw → 原始 HTML 不透传,防 XSS。
export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`prose-sm max-w-none break-words text-sm text-muted [&_a]:text-accent [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_ul]:list-disc [&_ul]:pl-4 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
