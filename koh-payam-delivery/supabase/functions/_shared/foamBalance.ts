// How many of the shop's foam boxes a customer is holding (feature/foam-boxes).
// Dependency-free: shared by the team app and the order-view edge function so
// both show the same number.
//
// Events in time order: a ship adds its foam boxes; a return subtracts but the
// balance never goes below 0 (an over-return is old boxes, not credit); a set
// makes the balance exactly that number (opening balance or correction).

export type FoamEvent = {
  at: string
  kind: 'sent' | 'return' | 'set'
  qty: number
  label?: string // PO number for a ship, the note for a return/set
  by?: string // who recorded a return/set
}

export type FoamOrder = {
  status: string
  shipped_at: string | null
  foam_box_count: number | null
  makro_order_no?: string
}

// At the same instant a ship is applied first -- a box can't come back before it left.
const RANK: Record<FoamEvent['kind'], number> = { sent: 0, return: 1, set: 2 }

export function sortFoamEvents(events: FoamEvent[]): FoamEvent[] {
  return [...events].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || RANK[a.kind] - RANK[b.kind],
  )
}

/** Ships that count: shipped, with foam boxes, at or after the tracking start. */
export function sentEvents(orders: FoamOrder[], start: string): FoamEvent[] {
  const from = Date.parse(start)
  const out: FoamEvent[] = []
  for (const o of orders) {
    const n = Number(o.foam_box_count) || 0
    if (o.status !== 'shipped' || !o.shipped_at || n <= 0) continue
    if (Date.parse(o.shipped_at) < from) continue
    out.push({
      at: o.shipped_at,
      kind: 'sent',
      qty: n,
      ...(o.makro_order_no ? { label: o.makro_order_no } : {}),
    })
  }
  return out
}

export function foamBalance(events: FoamEvent[]): { balance: number; lastSentAt: string | null } {
  let balance = 0
  let lastSentAt: string | null = null
  for (const e of sortFoamEvents(events)) {
    if (e.kind === 'sent') {
      balance += e.qty
      lastSentAt = e.at
    } else if (e.kind === 'return') balance = Math.max(0, balance - e.qty)
    else balance = e.qty
  }
  return { balance, lastSentAt }
}
