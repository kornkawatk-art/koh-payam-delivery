import { supabase } from '../supabase'

export type BackorderRow = {
  id: string
  source_order_id: string
  reason: 'shortage' | 'claim_resend'
  product_name: string
  qty: number
  target_ship_date: string | null
  target_order_id: string | null
  status: 'pending' | 'fulfilled'
}

// A pending backorder that hasn't been tied to any destination order yet —
// shown on the manager's "unmatched backorders" view (ClaimsQueue.tsx) so it
// doesn't stay invisible until (or unless) a matching order ever shows up.
export type UnmatchedBackorderRow = {
  id: string
  customerName: string | undefined
  productName: string
  qty: number
  reason: 'shortage' | 'claim_resend'
  createdAt: string
}

// Rebuild this order's shortage backorders: drop the pending shortage rows it
// already owns, then create one fresh pending row per still-short order item.
export async function syncShortageBackorders(orderId: string): Promise<void> {
  const { data: items, error: readErr } = await supabase
    .from('order_items')
    .select('id,product_name,qty_ordered,qty_shipped,shortage_qty,status')
    .eq('order_id', orderId)
  if (readErr) throw new Error('โหลดรายการสินค้าไม่สำเร็จ: ' + readErr.message)
  // Only clear rows that are still unresolved — a shortage backorder already
  // fulfilled on the target order must survive a re-save of the source order.
  await supabase
    .from('backorders')
    .delete()
    .eq('source_order_id', orderId)
    .eq('reason', 'shortage')
    .eq('status', 'pending')
  const shorts = (items ?? []).filter((i: any) => i.status === 'short')
  if (!shorts.length) return
  const rows = shorts.map((i: any) => {
    // The backorder covers only what was actually short — the makro shortage_qty,
    // falling back to ordered - shipped when that column is 0/absent.
    const shortage = Number(i.shortage_qty) || 0
    const qty = shortage > 0 ? shortage : Math.max(0, Number(i.qty_ordered) - Number(i.qty_shipped))
    return {
      source_order_id: orderId,
      reason: 'shortage',
      product_name: i.product_name,
      qty,
      status: 'pending',
      target_ship_date: null,
    }
  })
  const { error } = await supabase.from('backorders').insert(rows)
  if (error) throw new Error('สร้างรายการค้างส่งไม่สำเร็จ: ' + error.message)
}

// Called by the claim resolution flow (Task 22): queue a compensating shipment
// for an approved "resend next day" claim — one backorder row per item the
// claim references (a missing_in_box claim can reference several products;
// damaged always has exactly one; box_lost has none).
export async function createResendBackorder(claimId: string): Promise<void> {
  const { data: c } = await supabase
    .from('claims')
    .select('order_id, claim_items(qty,order_items(product_name))')
    .eq('id', claimId)
    .single()
  if (!c) throw new Error('ไม่พบเคลม')
  const orderId = (c as any).order_id
  const items = ((c as any).claim_items ?? []) as Array<{
    qty: number
    order_items: { product_name?: string } | null
  }>
  // A box_lost claim (or any claim that somehow has zero claim_items) has
  // nothing to loop over — silently succeeding here would report the claim
  // resolved while queuing no compensating shipment at all. Fail loudly
  // instead so resolveClaim's existing catch surfaces it to the manager.
  if (!items.length) throw new Error('เคลมนี้ไม่มีรายการสินค้า จึงสร้างรายการส่งชดเชยไม่ได้')
  const rows = items.map((it) => ({
    source_order_id: orderId,
    reason: 'claim_resend',
    product_name: it.order_items?.product_name ?? 'ไม่ระบุสินค้า',
    qty: it.qty,
    status: 'pending',
    target_ship_date: null,
  }))
  const { error } = await supabase.from('backorders').insert(rows)
  if (error) throw new Error('สร้างรายการส่งชดเชยไม่สำเร็จ: ' + error.message)
}

// After a ship day's orders are imported, attach any pending backorder whose
// source customer has a fresh order that day (and which is not already tied to
// a different day). Returns how many rows were linked.
export async function linkBackordersToDay(shipDate: string): Promise<number> {
  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('id,customer_name_en,customer_phone')
    .eq('ship_date', shipDate)
  if (ordErr) throw new Error('โหลดออเดอร์ประจำวันไม่สำเร็จ: ' + ordErr.message)
  const { data: pend, error: pendErr } = await supabase
    .from('backorders')
    .select(
      'id,source_order_id,target_ship_date, orders!backorders_source_order_id_fkey(customer_name_en,customer_phone)',
    )
    .eq('status', 'pending')
  if (pendErr) throw new Error('โหลดรายการค้างส่งไม่สำเร็จ: ' + pendErr.message)
  let linked = 0
  for (const b of pend ?? []) {
    if ((b as any).target_ship_date && (b as any).target_ship_date !== shipDate) continue
    const custPhone = (b as any).orders?.customer_phone
    const custName = (b as any).orders?.customer_name_en
    // Phone first: same-day order sharing the source order's phone number.
    // Fall back to the exact name match when the phone doesn't apply (empty
    // source phone) or didn't find anything among that day's orders.
    let match = custPhone
      ? (orders ?? []).find((o: any) => o.customer_phone === custPhone)
      : undefined
    if (!match) match = (orders ?? []).find((o: any) => o.customer_name_en === custName)
    if (!match) continue
    const { error } = await supabase
      .from('backorders')
      .update({ target_order_id: (match as any).id, target_ship_date: shipDate })
      .eq('id', (b as any).id)
    if (!error) linked++
  }
  return linked
}

// Every pending-or-not backorder that has never been matched to a destination
// order — invisible everywhere else until (or unless) linkBackordersToDay
// finds it a home. Surfaced read-only on the manager's ClaimsQueue page.
export async function listUnmatchedBackorders(): Promise<UnmatchedBackorderRow[]> {
  const { data, error } = await supabase
    .from('backorders')
    .select(
      'id,reason,product_name,qty,created_at,orders!backorders_source_order_id_fkey(customer_name_en)',
    )
    .is('target_order_id', null)
    .order('created_at', { ascending: true })
  if (error) throw new Error('โหลดรายการค้างส่งที่ยังจับคู่ไม่สำเร็จ: ' + error.message)
  return (data ?? []).map((b: any) => ({
    id: b.id,
    customerName: b.orders?.customer_name_en,
    productName: b.product_name,
    qty: b.qty,
    reason: b.reason,
    createdAt: b.created_at,
  }))
}

export async function listBackordersForDay(shipDate: string): Promise<BackorderRow[]> {
  const { data, error } = await supabase
    .from('backorders')
    .select(
      'id,source_order_id,reason,product_name,qty,target_ship_date,target_order_id,status',
    )
    .eq('target_ship_date', shipDate)
    .eq('status', 'pending')
  if (error) throw new Error('โหลดรายการค้างส่งไม่สำเร็จ: ' + error.message)
  return (data ?? []) as BackorderRow[]
}

// Pending backorders that have been tied to a specific destination order —
// shown on that order's pack screen as "carry-over from a previous order".
export async function listPendingBackordersForOrder(orderId: string): Promise<BackorderRow[]> {
  const { data, error } = await supabase
    .from('backorders')
    .select(
      'id,source_order_id,reason,product_name,qty,target_ship_date,target_order_id,status',
    )
    .eq('target_order_id', orderId)
    .eq('status', 'pending')
  if (error) throw new Error('โหลดรายการค้างส่งไม่สำเร็จ: ' + error.message)
  return (data ?? []) as BackorderRow[]
}

// Every backorder that touches this order — whether it originated here
// (source_order_id) or is being delivered here (target_order_id). Shown on the
// order detail page regardless of pending/fulfilled status.
export async function listRelatedBackordersForOrder(orderId: string): Promise<BackorderRow[]> {
  const { data, error } = await supabase
    .from('backorders')
    .select(
      'id,source_order_id,reason,product_name,qty,target_ship_date,target_order_id,status',
    )
    .or(`source_order_id.eq.${orderId},target_order_id.eq.${orderId}`)
  if (error) throw new Error('โหลดรายการค้างส่งไม่สำเร็จ: ' + error.message)
  return (data ?? []) as BackorderRow[]
}

export async function markBackorderFulfilled(id: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('backorders')
    .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString(), fulfilled_by: u.user?.id })
    .eq('id', id)
  if (error) throw new Error('อัปเดตรายการค้างส่งไม่สำเร็จ: ' + error.message)
}
