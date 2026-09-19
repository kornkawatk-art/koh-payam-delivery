type Groupable = {
  id: string
  makro_order_no: string
  customer_name_en: string
  customer_phone?: string | null
}

export type DayEntry<T extends Groupable> =
  | { kind: 'single'; order: T }
  | { kind: 'group'; phone: string; name: string; orders: T[] }

/**
 * Collapse one day's orders into per-customer entries: orders sharing the
 * same non-blank phone (the caller already scoped them to one ship date)
 * become one group; everything else stays a single entry. Entries keep the
 * order in which their first PO appeared; POs inside a group are sorted by
 * order number, which is also how the pack page picks its "primary" PO.
 */
export function groupByPhone<T extends Groupable>(orders: T[]): DayEntry<T>[] {
  const byPhone = new Map<string, T[]>()
  for (const o of orders) {
    const phone = (o.customer_phone ?? '').trim()
    if (!phone) continue
    byPhone.set(phone, [...(byPhone.get(phone) ?? []), o])
  }
  const entries: DayEntry<T>[] = []
  const emitted = new Set<string>()
  for (const o of orders) {
    const phone = (o.customer_phone ?? '').trim()
    const members = phone ? byPhone.get(phone)! : null
    if (!members || members.length < 2) {
      entries.push({ kind: 'single', order: o })
      continue
    }
    if (emitted.has(phone)) continue
    emitted.add(phone)
    const sorted = [...members].sort((a, b) => a.makro_order_no.localeCompare(b.makro_order_no))
    entries.push({ kind: 'group', phone, name: sorted[0].customer_name_en, orders: sorted })
  }
  return entries
}

export function entryOrders<T extends Groupable>(e: DayEntry<T>): T[] {
  return e.kind === 'single' ? [e.order] : e.orders
}

/** An entry belongs in the "ยังไม่แพ็ค" section while any of its POs is still just imported. */
export function entryHasUnpacked<T extends Groupable & { status: string }>(e: DayEntry<T>): boolean {
  return entryOrders(e).some((o) => o.status === 'imported')
}

type PrimaryCandidate = {
  id: string
  packed_with_order_id?: string | null
  paper_box_count?: number | null
  foam_box_count?: number | null
  piece_count?: number | null
  evidence_photos?: { stage: string }[] | null
}

/**
 * Which not-yet-packed PO owns the group's boxes/photos ("primary"). Prefers
 * one that already carries the group's recorded state -- another PO points at
 * it, or it has counts / pack photos -- so a PO imported later (which would
 * sort first by order number) can't take the role and orphan what was saved.
 * Falls back to the first (lowest order number, as the API sorts).
 */
export function pickPrimary<T extends PrimaryCandidate>(packable: T[]): T | null {
  if (packable.length === 0) return null
  const pointedAt = new Set(packable.map((o) => o.packed_with_order_id).filter(Boolean))
  const owns = (o: T) =>
    pointedAt.has(o.id) ||
    (o.paper_box_count ?? 0) + (o.foam_box_count ?? 0) + (o.piece_count ?? 0) > 0 ||
    (o.evidence_photos ?? []).some((p) => p.stage === 'pack')
  return packable.find(owns) ?? packable[0]
}
