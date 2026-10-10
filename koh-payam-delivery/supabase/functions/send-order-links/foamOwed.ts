// Foam boxes each customer still holds, for the daily LINE message
// (feature/foam-reminders). Pure -- vitest exercises it like dedup.ts. Same
// rules as the team app and order-view (_shared/foamBalance.ts).
import { customerKey } from '../_shared/customerKey.ts'
import { foamBalance, sentEvents, type FoamEvent } from '../_shared/foamBalance.ts'

type ShippedOrder = {
  customer_phone: string | null
  customer_name_en: string
  status: string
  shipped_at: string | null
  foam_box_count: number | null
}
type Move = { customer_key: string; kind: 'return' | 'set'; qty: number; created_at: string }

/** customerKey -> boxes held, from ships since `start` and the recorded moves. */
export function foamOwedByCustomer(
  orders: ShippedOrder[],
  moves: Move[],
  start: string,
): Map<string, number> {
  const events = new Map<string, FoamEvent[]>()
  const push = (key: string, e: FoamEvent[]) => events.set(key, [...(events.get(key) ?? []), ...e])
  for (const o of orders) push(customerKey(o), sentEvents([o], start))
  for (const m of moves) push(m.customer_key, [{ at: m.created_at, kind: m.kind, qty: m.qty }])
  const out = new Map<string, number>()
  for (const [key, e] of events) out.set(key, foamBalance(e).balance)
  return out
}

/** The LINE text: the order link, plus a foam box reminder when they hold any. */
export function linkMessage(site: string, token: string, foamOwed: number): string {
  const text = `ออเดอร์ของคุณพร้อมส่งแล้ว ติดตามได้ที่: ${site}/o/${token}`
  return foamOwed > 0 ? `${text}\nคุณมีลังโฟมของแม็คโครค้างอยู่ ${foamOwed} ใบ กรุณาคืนกับเรือ` : text
}
