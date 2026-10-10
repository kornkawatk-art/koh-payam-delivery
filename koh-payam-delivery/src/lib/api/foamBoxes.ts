import { supabase } from '../supabase'
import { logAction } from './audit'
import { fetchAll } from './fetchAll'
import type { CustomerRef } from './customerAliases'
import { customerKey } from '../../../supabase/functions/_shared/customerKey'
import {
  foamBalance,
  sentEvents,
  sortFoamEvents,
  type FoamEvent,
} from '../../../supabase/functions/_shared/foamBalance'

// Foam box tracking (spec docs/superpowers/specs/2026-10-10-foam-box-tracking-design.md).
// Sent boxes come from shipped orders; foam_box_moves holds only returns and
// set-balance. Every read fails soft: before migration 0031 runs the tables
// don't exist, and nothing here may break the page that asked.

export type FoamCustomer = {
  key: string
  name: string
  phone: string | null
  balance: number
  lastSentAt: string | null
  events: FoamEvent[]
}

type MoveRow = {
  customer_key: string
  kind: 'return' | 'set'
  qty: number
  note: string | null
  created_at: string
}
type OrderRow = {
  makro_order_no: string
  customer_name_en: string
  customer_phone: string | null
  status: string
  shipped_at: string | null
  foam_box_count: number | null
}
const ORDER_COLS = 'makro_order_no,customer_name_en,customer_phone,status,shipped_at,foam_box_count'
const MOVE_COLS = 'customer_key,kind,qty,note,created_at'

const moveEvent = (m: MoveRow): FoamEvent => ({
  at: m.created_at,
  kind: m.kind,
  qty: m.qty,
  ...(m.note ? { label: m.note } : {}),
})

/** When "sent" starts counting; null = tracking not enabled (or unreadable). */
export async function getFoamTrackingStart(): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('foam_tracking_start')
    .maybeSingle()
  if (error || !data) return null
  return (data as { foam_tracking_start: string }).foam_tracking_start ?? null
}

/** Every customer who has had an order, with their balance; null = not enabled. */
export async function listFoamCustomers(): Promise<FoamCustomer[] | null> {
  const start = await getFoamTrackingStart()
  if (!start) return null
  let orders: OrderRow[]
  let moves: MoveRow[]
  try {
    ;[orders, moves] = await Promise.all([
      fetchAll<OrderRow>((from, to) =>
        supabase.from('orders').select(ORDER_COLS).order('id').range(from, to),
      ),
      fetchAll<MoveRow>((from, to) =>
        supabase.from('foam_box_moves').select(MOVE_COLS).order('created_at').range(from, to),
      ),
    ])
  } catch {
    return null
  }

  const byKey = new Map<
    string,
    { name: string; phone: string | null; orders: OrderRow[]; moves: MoveRow[] }
  >()
  for (const o of orders) {
    const key = customerKey(o)
    const c = byKey.get(key) ?? {
      name: o.customer_name_en,
      phone: o.customer_phone,
      orders: [],
      moves: [],
    }
    c.orders.push(o)
    byKey.set(key, c)
  }
  for (const m of moves) byKey.get(m.customer_key)?.moves.push(m)

  const out: FoamCustomer[] = []
  for (const [key, c] of byKey) {
    const events = sortFoamEvents([...sentEvents(c.orders, start), ...c.moves.map(moveEvent)])
    const { balance, lastSentAt } = foamBalance(events)
    out.push({ key, name: c.name, phone: c.phone, balance, lastSentAt, events })
  }
  return out.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name))
}

/** One customer's balance (pier pages). 0 on any failure. */
export async function getCustomerFoamBalance(ref: CustomerRef): Promise<number> {
  try {
    const start = await getFoamTrackingStart()
    if (!start) return 0
    const key = customerKey(ref)
    let q = supabase
      .from('orders')
      .select(ORDER_COLS)
      .eq('status', 'shipped')
      .gte('shipped_at', start)
    q = ref.customer_phone
      ? q.eq('customer_phone', ref.customer_phone)
      : q.eq('customer_name_en', ref.customer_name_en ?? '')
    const [{ data: orders, error: oErr }, { data: moves, error: mErr }] = await Promise.all([
      q,
      supabase.from('foam_box_moves').select(MOVE_COLS).eq('customer_key', key),
    ])
    if (oErr || mErr) return 0
    const mine = ((orders ?? []) as OrderRow[]).filter((o) => customerKey(o) === key)
    return foamBalance([
      ...sentEvents(mine, start),
      ...((moves ?? []) as MoveRow[]).map(moveEvent),
    ]).balance
  } catch {
    return 0
  }
}

async function insertMove(
  kind: 'return' | 'set',
  c: { key: string; name: string },
  qty: number,
  note?: string,
): Promise<void> {
  const min = kind === 'return' ? 1 : 0
  if (!Number.isInteger(qty) || qty < min || qty > 9999) throw new Error('จำนวนลังไม่ถูกต้อง')
  const { error } = await supabase.from('foam_box_moves').insert({
    customer_key: c.key,
    customer_name: c.name,
    kind,
    qty,
    note: note?.trim() || null,
  })
  if (error) throw new Error('บันทึกลังโฟมไม่สำเร็จ: ' + error.message)
  await logAction(kind === 'return' ? 'foam_return' : 'foam_set', 'customer', c.key, {
    name: c.name,
    qty,
  })
}

export const recordFoamReturn = (c: { key: string; name: string }, qty: number, note?: string) =>
  insertMove('return', c, qty, note)

/** Managers only (RLS enforces it): "this customer holds exactly `qty` now". */
export const setFoamBalance = (c: { key: string; name: string }, qty: number, note?: string) =>
  insertMove('set', c, qty, note)
