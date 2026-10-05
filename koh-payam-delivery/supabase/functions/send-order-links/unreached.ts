// Pure helper for send-order-links: which of the day's customers did NOT get
// a LINE message, and why -- shown to the team as a popup so they can copy
// those links by hand (OrderDetail's "คัดลอก"). Dependency-free like dedup.ts
// so plain vitest can exercise it.
//
// One entry per customer (normalized phone, same grouping as the send), with
// every PO they have that day. Orders with no usable phone can never match a
// LINE registration, so each is its own entry. Store pickups are left out:
// they collect at the branch, nobody waits on a delivery link.
import { normalizePhone } from '../_shared/phone.ts'

export type UnreachedReason = 'no_phone' | 'not_registered' | 'push_failed'

export type UnreachedCustomer = {
  customerName: string
  phone: string | null
  reason: UnreachedReason
  orders: { id: string; makroOrderNo: string }[]
}

type DayOrder = {
  id: string
  makro_order_no: string
  customer_name_en: string
  customer_phone: string | null
  is_pickup?: boolean | null
}

export function unreachedCustomers(
  orders: DayOrder[],
  registeredPhones: Set<string>,
  failedPhones: Set<string> = new Set(),
): UnreachedCustomer[] {
  const out: UnreachedCustomer[] = []
  const byPhone = new Map<string, UnreachedCustomer>()
  for (const o of orders) {
    if (o.is_pickup) continue
    const ref = { id: o.id, makroOrderNo: o.makro_order_no }
    const phone = normalizePhone(o.customer_phone ?? '')
    if (!phone) {
      out.push({ customerName: o.customer_name_en, phone: null, reason: 'no_phone', orders: [ref] })
      continue
    }
    const reason: UnreachedReason | null = failedPhones.has(phone)
      ? 'push_failed'
      : registeredPhones.has(phone)
        ? null
        : 'not_registered'
    if (!reason) continue
    const seen = byPhone.get(phone)
    if (seen) seen.orders.push(ref)
    else {
      const entry = { customerName: o.customer_name_en, phone, reason, orders: [ref] }
      byPhone.set(phone, entry)
      out.push(entry)
    }
  }
  return out.sort((a, b) => a.customerName.localeCompare(b.customerName))
}
