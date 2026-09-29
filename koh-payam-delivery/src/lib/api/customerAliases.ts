import { supabase } from '../supabase'
import { normCustomerName } from '../groupOrders'

/**
 * Short names for box stickers ("JJ Payam" -> "JJ"), one per customer.
 * A customer is identified the way the app groups a customer's POs: phone
 * AND name -- one owner (one phone) can run several shops, each its own
 * Makro account name and its own sticker name. Phone is digits only ("082-628
 * 9533" == "0826289533"); name is normalized (normCustomerName). No phone:
 * name alone. Must match the key rewrite in 0025_customer_per_shop.sql.
 */
export type CustomerRef = { customer_phone?: string | null; customer_name_en?: string | null }

export function customerKey(o: CustomerRef): string {
  const digits = (o.customer_phone ?? '').replace(/\D/g, '')
  const name = normCustomerName(o.customer_name_en)
  return digits ? `phone:${digits}|name:${name}` : `name:${name}`
}

/** A first guess when no short name is saved yet: the name's first word. */
export function suggestShortName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? ''
}

export async function getShortName(ref: CustomerRef): Promise<string | null> {
  const { data, error } = await supabase
    .from('customer_aliases')
    .select('short_name')
    .eq('customer_key', customerKey(ref))
  if (error) throw new Error('โหลดชื่อย่อไม่สำเร็จ: ' + error.message)
  return (data?.[0] as { short_name: string } | undefined)?.short_name ?? null
}

export async function saveShortName(ref: CustomerRef, shortName: string): Promise<void> {
  const name = shortName.trim()
  if (!name) throw new Error('ชื่อย่อว่างไม่ได้')
  const { error } = await supabase.from('customer_aliases').upsert({
    customer_key: customerKey(ref),
    short_name: name,
    customer_name: ref.customer_name_en ?? null,
    customer_phone: ref.customer_phone ?? null,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error('บันทึกชื่อย่อไม่สำเร็จ: ' + error.message)
}

export type CustomerAliasRow = {
  key: string
  name: string
  phone: string | null
  shortName: string | null
  lastShipDate: string
}

/**
 * Every customer that has had an order, newest first, with their saved short
 * name (null = not set yet) -- for the manager's list page.
 */
export async function listCustomerAliases(): Promise<CustomerAliasRow[]> {
  const [orders, aliases] = await Promise.all([
    supabase.from('orders').select('customer_name_en,customer_phone,ship_date'),
    supabase.from('customer_aliases').select('customer_key,short_name'),
  ])
  if (orders.error) throw new Error('โหลดรายชื่อลูกค้าไม่สำเร็จ: ' + orders.error.message)
  if (aliases.error) throw new Error('โหลดชื่อย่อไม่สำเร็จ: ' + aliases.error.message)

  const shortByKey = new Map(
    (aliases.data ?? []).map((a: any) => [a.customer_key as string, a.short_name as string]),
  )
  const byKey = new Map<string, CustomerAliasRow>()
  for (const o of (orders.data ?? []) as any[]) {
    const key = customerKey(o)
    const seen = byKey.get(key)
    // Keep the most recent order's name/phone as the display values.
    if (!seen || o.ship_date > seen.lastShipDate)
      byKey.set(key, {
        key,
        name: o.customer_name_en ?? '',
        phone: o.customer_phone ?? null,
        shortName: shortByKey.get(key) ?? null,
        lastShipDate: o.ship_date,
      })
  }
  return [...byKey.values()].sort((a, b) => b.lastShipDate.localeCompare(a.lastShipDate))
}
