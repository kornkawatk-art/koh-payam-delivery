import { Link } from 'react-router-dom'
import { CaretLeft } from '@phosphor-icons/react'

const CLS =
  '-ml-1.5 inline-flex min-h-[2.75rem] w-fit items-center gap-1 rounded-lg pl-1 pr-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink'

/**
 * "‹ งานวันนี้"-style way back from a drill-down page, so a phone user never
 * has to rely on the browser's own back gesture. A route (`to`) when the
 * parent is a real page; `onClick` when "back" just closes an in-page view
 * (the pier pages' selected-order panel). 44px tall for touch.
 */
export function BackLink({
  label,
  to,
  onClick,
}: { label: string } & ({ to: string; onClick?: never } | { onClick: () => void; to?: never })) {
  const body = (
    <>
      <CaretLeft size={16} weight="bold" aria-hidden="true" />
      {label}
    </>
  )
  return to !== undefined ? (
    <Link className={CLS} to={to}>
      {body}
    </Link>
  ) : (
    <button type="button" className={CLS} onClick={onClick}>
      {body}
    </button>
  )
}
