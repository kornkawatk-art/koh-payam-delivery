import type { ReactNode } from 'react'
import type { Icon } from '@phosphor-icons/react'

/**
 * "Nothing here" message that reads as intentional rather than as a missing
 * page: an icon, the message itself, and optionally what to do next.
 * `compact` is for a sub-section inside a page (one line, no big icon).
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  compact,
}: {
  icon: Icon
  title: string
  hint?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  if (compact)
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-ink-soft">
        <Icon size={18} className="shrink-0 text-ink-faint" aria-hidden="true" />
        <p>{title}</p>
      </div>
    )
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center">
      <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-paper ring-1 ring-line">
        <Icon size={24} className="text-ink-faint" aria-hidden="true" />
      </span>
      <p className="font-medium text-ink">{title}</p>
      {hint && <p className="muted max-w-xs">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
