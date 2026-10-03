import { ISLAND_LIST, ISLANDS, isIsland, type Island } from '../../lib/islands'

/**
 * Which island an order goes to. An order the importer couldn't place (its
 * address only names the shared Paknam pier) shows a yellow "เลือกเกาะ" so a
 * manager notices and picks one on the order page.
 */
export function IslandBadge({ island, className = '' }: { island: unknown; className?: string }) {
  if (isIsland(island))
    return <span className={`badge badge-neutral ${className}`}>{ISLANDS[island].th}</span>
  return (
    <span className={`badge badge-warn ${className}`} title="ยังไม่ระบุเกาะ — หัวหน้าเลือกได้ในหน้าออเดอร์">
      เลือกเกาะ
    </span>
  )
}

export type IslandFilterValue = 'all' | Island

/**
 * Untagged orders pass every filter: they could be either island, and hiding
 * them is how one gets forgotten.
 */
export const matchesIsland = (island: unknown, f: IslandFilterValue) =>
  f === 'all' || !isIsland(island) || island === f

/** True when a day's orders span more than one island (or have an untagged one). */
export const needsIslandFilter = (islands: unknown[]) =>
  islands.some((i) => !isIsland(i)) || new Set(islands).size > 1

/** "ทั้งหมด / เกาะพยาม / เกาะช้าง" chips. */
export function IslandFilter({
  value,
  onChange,
}: {
  value: IslandFilterValue
  onChange: (v: IslandFilterValue) => void
}) {
  const opts: { v: IslandFilterValue; label: string }[] = [
    { v: 'all', label: 'ทั้งหมด' },
    ...ISLAND_LIST.map((i) => ({ v: i, label: ISLANDS[i].th })),
  ]
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="กรองตามเกาะ">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          className={`btn btn-sm ${value === o.v ? 'btn-primary' : 'btn-secondary'}`}
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
