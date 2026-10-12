import { customerKey } from '../../supabase/functions/_shared/customerKey'
import { makroVoid } from './makroStatus'

// Payment lock (spec docs/superpowers/specs/2026-10-12-payment-lock-design.md).
// A cash-on-delivery customer who still owes a bill from an EARLIER delivery
// is locked: not packed, not shipped, unless a manager releases that delivery.

export type Bill = {
  id: string
  makro_order_no: string
  customer_name_en: string
  customer_phone: string | null
  ship_date: string
  outstanding_amount: number | null
  payment_method: string | null
  payment_status: string | null
  paid_marked_at?: string | null
  is_pickup?: boolean | null
  makro_order_status?: string | null
}

const isCod = (m: string | null | undefined) => /pay on delivery/i.test(m ?? '')
const isPaid = (s: string | null | undefined) => (s ?? '').trim().toLowerCase() === 'paid'

export function isUnpaidBill(b: Bill): boolean {
  return (
    isCod(b.payment_method) &&
    Number(b.outstanding_amount) > 0 &&
    !isPaid(b.payment_status) &&
    !b.paid_marked_at &&
    !b.is_pickup &&
    !makroVoid(b.makro_order_status)
  )
}

/** Whole calendar days from a delivery date to today (both YYYY-MM-DD). */
export function daysOwed(shipDate: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(shipDate)) / 86_400_000))
}

export type Lock = {
  locked: boolean
  released: boolean
  priorBills: Bill[]
  total: number
  oldestDays: number
}

/** `releasedKeys`: customer keys released for `shipDate` (payment_releases). */
export function lockFor(
  ref: { customer_phone?: string | null; customer_name_en?: string | null },
  shipDate: string,
  bills: Bill[],
  releasedKeys: Set<string>,
  today: string,
): Lock {
  const key = customerKey(ref)
  const priorBills = bills
    .filter((b) => isUnpaidBill(b) && b.ship_date < shipDate && customerKey(b) === key)
    .sort((a, b) => a.ship_date.localeCompare(b.ship_date))
  const owing = priorBills.length > 0
  const released = owing && releasedKeys.has(key)
  return {
    locked: owing && !released,
    released,
    priorBills,
    total: priorBills.reduce((n, b) => n + Number(b.outstanding_amount || 0), 0),
    oldestDays: owing ? daysOwed(priorBills[0].ship_date, today) : 0,
  }
}

export type CustomerDebt = {
  key: string
  name: string
  phone: string | null
  bills: Bill[]
  total: number
  oldestDays: number
  // has a bill from before today -> locked for a delivery today
  lockedToday: boolean
}

export function customerDebts(bills: Bill[], today: string): CustomerDebt[] {
  const byKey = new Map<string, CustomerDebt>()
  for (const b of bills) {
    if (!isUnpaidBill(b)) continue
    const key = customerKey(b)
    const d =
      byKey.get(key) ??
      ({
        key,
        name: b.customer_name_en,
        phone: b.customer_phone,
        bills: [],
        total: 0,
        oldestDays: 0,
        lockedToday: false,
      } as CustomerDebt)
    d.bills.push(b)
    d.total += Number(b.outstanding_amount || 0)
    byKey.set(key, d)
  }
  for (const d of byKey.values()) {
    d.bills.sort((a, b) => a.ship_date.localeCompare(b.ship_date))
    d.oldestDays = daysOwed(d.bills[0].ship_date, today)
    d.lockedToday = d.bills.some((b) => b.ship_date < today)
  }
  return [...byKey.values()].sort((a, b) => b.oldestDays - a.oldestDays || a.name.localeCompare(b.name))
}

/** Makro's payment facts for an order row; Makro "not paid" clears a manager mark. */
export function paymentPatch(p: {
  paymentMethod: string | null
  paymentStatus: string | null
  outstandingAmount: number
  makroOrderStatus: string | null
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    payment_method: p.paymentMethod,
    payment_status: p.paymentStatus,
    outstanding_amount: p.outstandingAmount,
    makro_order_status: p.makroOrderStatus,
  }
  if (!isPaid(p.paymentStatus) && p.outstandingAmount > 0) {
    patch.paid_marked_at = null
    patch.paid_marked_by = null
  }
  return patch
}
