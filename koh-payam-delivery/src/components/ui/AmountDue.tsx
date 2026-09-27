import { Wallet } from '@phosphor-icons/react'
import { formatTHB } from '../../lib/format'

/**
 * Money to collect on delivery, as a callout with the amount as the largest
 * thing in it -- the one figure pier staff and customers must not miss.
 * `collect` (red) is the team's "you must collect this" view; `brand` (gold)
 * is the customer's calmer "amount due".
 */
export function AmountDue({
  label,
  amount,
  note,
  tone = 'collect',
}: {
  label: string
  amount: number
  note?: string | null
  tone?: 'collect' | 'brand'
}) {
  const box = tone === 'collect' ? 'bg-danger-soft ring-danger/25' : 'bg-brand-soft ring-brand/30'
  const ink = tone === 'collect' ? 'text-danger-ink' : 'text-brand-ink'
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl px-4 py-3 ring-1 ${box}`}
    >
      <span className={`flex items-center gap-2 text-sm font-medium ${ink}`}>
        <Wallet size={18} aria-hidden="true" />
        {label}
      </span>
      <span className="flex flex-col items-end">
        <span className="text-2xl font-semibold tracking-tight text-ink">
          {formatTHB(amount)}
        </span>
        {note && <span className={`text-xs ${ink}`}>{note}</span>}
      </span>
    </div>
  )
}
