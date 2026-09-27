import type { ReactNode } from 'react'
import type { Icon } from '@phosphor-icons/react'

/**
 * One number in a summary grid: a small label above a large value, so a
 * glance finds the figure first. Render inside a `<dl>` (it emits dt/dd).
 * `emphasis` marks the headline figure of the group (e.g. the total).
 */
export function StatTile({
  label,
  value,
  emphasis,
}: {
  label: string
  value: ReactNode
  emphasis?: boolean
}) {
  return (
    <div
      className={
        'flex flex-col gap-0.5 rounded-lg px-3 py-2.5 ' +
        (emphasis ? 'bg-brand-soft ring-1 ring-brand/25' : 'bg-paper ring-1 ring-line')
      }
    >
      <dt className={'text-xs font-medium ' + (emphasis ? 'text-brand-ink' : 'text-ink-soft')}>
        {label}
      </dt>
      <dd className="text-2xl font-semibold leading-tight tracking-tight text-ink">
        {value}
      </dd>
    </div>
  )
}

/**
 * A labeled fact with an icon (who packed it, where it goes). Render inside a
 * `<dl>`. An empty value shows a faint "—" so a missing entry still reads as
 * "not yet", not as a layout gap.
 */
export function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: Icon
  label: string
  value: ReactNode
}) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-paper ring-1 ring-line">
        <Icon size={18} className="text-ink-soft" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-ink-soft">{label}</dt>
        <dd className={'truncate font-medium ' + (empty ? 'text-ink-faint' : 'text-ink')}>
          {empty ? '—' : value}
        </dd>
      </div>
    </div>
  )
}

/**
 * The running total under the pack pages' paper/foam/piece inputs. The three
 * parts are already visible in their own inputs, so only the sum is shown --
 * large, in the gold "headline figure" style of StatTile's `emphasis`.
 */
export function TotalCount({ total }: { total: number }) {
  return (
    <div
      className="flex w-fit items-center gap-3 rounded-lg bg-brand-soft px-3 py-2 ring-1 ring-brand/25"
      role="status"
      aria-label={`รวมทั้งหมด ${total} ลัง/ชิ้น`}
    >
      <span className="text-xs font-medium text-brand-ink">รวมทั้งหมด</span>
      <span className="text-2xl font-semibold leading-none text-ink">{total}</span>
      <span className="text-xs text-brand-ink">ลัง/ชิ้น</span>
    </div>
  )
}
