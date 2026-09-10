import type { PropsWithChildren } from 'react'

type Tone = 'info' | 'ok' | 'warn' | 'danger'

const TONE: Record<Tone, string> = {
  info: 'alert-info',
  ok: 'alert-ok',
  warn: 'alert-warn',
  danger: 'alert-danger',
}

export function Alert({
  tone = 'info',
  className,
  children,
}: PropsWithChildren<{ tone?: Tone; className?: string }>) {
  return <div className={`alert ${TONE[tone]} ${className ?? ''}`}>{children}</div>
}
