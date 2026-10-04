import { Storefront } from '@phosphor-icons/react'

/**
 * Makro Order Type "Pick up at store": the customer collects at the branch,
 * nothing goes on a boat. Kept in the app as a record, flagged so nobody
 * packs or ships it by mistake.
 */
export function PickupBadge({ show, className = '' }: { show: unknown; className?: string }) {
  if (!show) return null
  return (
    <span className={`badge badge-brand ${className}`} title="Pick up at store — ลูกค้ามารับเองที่สาขา ไม่ต้องส่งลงเรือ">
      <Storefront size={12} weight="fill" aria-hidden="true" />
      รับเองที่สาขา
    </span>
  )
}
