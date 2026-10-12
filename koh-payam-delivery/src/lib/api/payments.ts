import { supabase } from '../supabase'
import { logAction } from './audit'
import { fetchAll } from './fetchAll'
import { todayLocalISO } from '../format'
import type { CustomerRef } from './customerAliases'
import { customerKey } from '../../../supabase/functions/_shared/customerKey'
import {
  customerDebts,
  isUnpaidBill,
  lockFor,
  type Bill,
  type CustomerDebt,
  type Lock,
} from '../payments'

// Payment lock data (spec docs/superpowers/specs/2026-10-12-payment-lock-design.md).

const BILL_COLS =
  'id,makro_order_no,customer_name_en,customer_phone,ship_date,outstanding_amount,payment_method,payment_status,paid_marked_at,is_pickup,makro_order_status'

const UNLOCKED: Lock = { locked: false, released: false, priorBills: [], total: 0, oldestDays: 0 }

// Cash-on-delivery, owing, not marked paid, not a store pickup -- the DB side
// of isUnpaidBill (which finishes the job: Paid status, Makro-voided).
const billQuery = () =>
  supabase
    .from('orders')
    .select(BILL_COLS)
    .ilike('payment_method', '%pay on delivery%')
    .gt('outstanding_amount', 0)
    .is('paid_marked_at', null)
    .eq('is_pickup', false)

/** Every unpaid cash-on-delivery bill (all dates). */
export async function listUnpaidBills(): Promise<Bill[]> {
  const rows = await fetchAll<Bill>((from, to) => billQuery().order('id').range(from, to))
  return rows.filter(isUnpaidBill)
}

/** Customer keys a manager released for this delivery date. */
export async function listReleasedKeys(shipDate: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('payment_releases')
    .select('customer_key')
    .eq('ship_date', shipDate)
  if (error) throw new Error('โหลดการปลดล็อกไม่สำเร็จ: ' + error.message)
  return new Set(((data ?? []) as { customer_key: string }[]).map((r) => r.customer_key))
}

/** Locks for the customers of one delivery date, keyed by customerKey. */
export async function getDayLocks(shipDate: string, customers: CustomerRef[]): Promise<Map<string, Lock>> {
  const [bills, released] = await Promise.all([listUnpaidBills(), listReleasedKeys(shipDate)])
  const today = todayLocalISO()
  const out = new Map<string, Lock>()
  for (const c of customers) {
    const key = customerKey(c)
    if (!out.has(key)) out.set(key, lockFor(c, shipDate, bills, released, today))
  }
  return out
}

/** One customer's lock for a delivery (pack / pier pages). Unlocked on any failure. */
export async function getCustomerLock(ref: CustomerRef, shipDate: string): Promise<Lock> {
  try {
    const digits = (ref.customer_phone ?? '').replace(/\D/g, '')
    const key = customerKey(ref)
    const [{ data: bills, error: bErr }, { data: rel, error: rErr }] = await Promise.all([
      billQuery().eq('customer_phone_digits', digits).lt('ship_date', shipDate),
      supabase
        .from('payment_releases')
        .select('customer_key')
        .eq('ship_date', shipDate)
        .eq('customer_key', key),
    ])
    if (bErr || rErr) return UNLOCKED
    const released = new Set(((rel ?? []) as { customer_key: string }[]).map((r) => r.customer_key))
    return lockFor(ref, shipDate, (bills ?? []) as Bill[], released, todayLocalISO())
  } catch {
    return UNLOCKED
  }
}

/** Manager: let a locked customer be packed and shipped for this delivery only. */
export async function releaseCustomer(ref: CustomerRef, shipDate: string, reason: string): Promise<void> {
  const why = reason.trim()
  if (!why) throw new Error('ใส่เหตุผลก่อนปลดให้แพ็ค')
  const key = customerKey(ref)
  const name = ref.customer_name_en ?? ''
  const { error } = await supabase
    .from('payment_releases')
    .insert({ customer_key: key, customer_name: name, ship_date: shipDate, reason: why })
  if (error) throw new Error('ปลดให้แพ็คไม่สำเร็จ: ' + error.message)
  await logAction('payment_released', 'customer', key, { name, shipDate, reason: why })
}

/** Manager: the bill was paid (holds until a Makro import says otherwise). */
export async function markBillPaid(orderId: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('orders')
    .update({ paid_marked_at: new Date().toISOString(), paid_marked_by: u.user?.id ?? null })
    .eq('id', orderId)
  if (error) throw new Error('บันทึกรับเงินไม่สำเร็จ: ' + error.message)
  await logAction('payment_marked', 'order', orderId, undefined)
}

/** Every customer with an unpaid bill, oldest first (the ยอดค้างชำระ page). */
export async function listCustomerDebts(): Promise<CustomerDebt[]> {
  return customerDebts(await listUnpaidBills(), todayLocalISO())
}

/** Menu badge: locked, unreleased customers that have an order today. 0 on failure. */
export async function countLockedToday(today: string): Promise<number> {
  try {
    const [{ data: orders, error }, bills, released] = await Promise.all([
      supabase
        .from('orders')
        .select('customer_name_en,customer_phone')
        .eq('ship_date', today)
        .eq('is_pickup', false),
      listUnpaidBills(),
      listReleasedKeys(today),
    ])
    if (error) return 0
    const locked = new Set<string>()
    for (const o of (orders ?? []) as CustomerRef[])
      if (lockFor(o, today, bills, released, today).locked) locked.add(customerKey(o))
    return locked.size
  } catch {
    return 0
  }
}
