import type { ButtonHTMLAttributes, ReactNode } from 'react'

/** Shared button. variants stay on-style; focus ring always visible. */
type Variant = 'primary' | 'secondary' | 'ghost' | 'success'
const base =
  'inline-flex items-center justify-center gap-2 rounded-btn text-sm font-medium ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 ' +
  'disabled:pointer-events-none cursor-pointer'
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'bg-surface-2 text-text hover:bg-border/60 border border-border',
  ghost: 'text-muted hover:text-text hover:bg-surface-2',
  success: 'bg-success text-white hover:opacity-90',
}
export function Button(
  { variant = 'primary', className = '', children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode },
) {
  return (
    <button className={`${base} ${variants[variant]} px-4 py-2 ${className}`} {...rest}>
      {children}
    </button>
  )
}

/** Surface card. */
export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-card border border-border bg-surface shadow-card ${className}`}>
      {children}
    </div>
  )
}

/** Pill badge for severity / status. */
export function Badge({ tone = 'muted', children }: { tone?: 'danger' | 'warn' | 'muted' | 'accent'; children: ReactNode }) {
  const tones = {
    danger: 'bg-danger/10 text-danger',
    warn: 'bg-warn/10 text-warn',
    accent: 'bg-accent-soft text-accent',
    muted: 'bg-surface-2 text-muted',
  } as const
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}
