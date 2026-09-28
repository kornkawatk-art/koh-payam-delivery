import { Leaf, Package } from '@phosphor-icons/react'

/**
 * The "ของสด (N)" / "ของแห้ง (N)" row that splits an item table: tinted
 * (fresh green, dry gold -- see .item-group-* in index.css) with an icon, so
 * the split stays visible while scrolling a long list.
 */
export function ItemGroupHeader({
  fresh,
  label,
  count,
  colSpan,
}: {
  fresh: boolean
  label: string
  count: number
  colSpan: number
}) {
  const Icon = fresh ? Leaf : Package
  return (
    <tr className={`row-divider item-group ${fresh ? 'item-group-fresh' : 'item-group-dry'}`}>
      <td colSpan={colSpan} className="py-2 text-xs font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <Icon size={15} weight="bold" aria-hidden="true" />
          {label} ({count})
        </span>
      </td>
    </tr>
  )
}

/**
 * Table rows for an item list: fresh then dry, each under its ItemGroupHeader
 * (when the order has fresh/dry data), and a running line number that
 * continues across both groups -- so "which line am I on" survives scrolling.
 */
export function groupedItemRows<T>({
  split,
  fresh,
  dry,
  all,
  colSpan,
  labels = { fresh: 'ของสด', dry: 'ของแห้ง' },
  row,
}: {
  split: boolean
  fresh: T[]
  dry: T[]
  all: T[]
  colSpan: number
  labels?: { fresh: string; dry: string }
  row: (item: T, no: number) => JSX.Element
}): JSX.Element[] {
  if (!split) return all.map((it, i) => row(it, i + 1))
  const out: JSX.Element[] = []
  if (fresh.length)
    out.push(<ItemGroupHeader key="grp-fresh" fresh label={labels.fresh} count={fresh.length} colSpan={colSpan} />)
  fresh.forEach((it, i) => out.push(row(it, i + 1)))
  if (dry.length)
    out.push(<ItemGroupHeader key="grp-dry" fresh={false} label={labels.dry} count={dry.length} colSpan={colSpan} />)
  dry.forEach((it, i) => out.push(row(it, fresh.length + i + 1)))
  return out
}
