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

// Rebuild this order's shortage backorders: drop the pending shortage rows it
// already owns, then create one fresh pending row per still-short order item.
export async function syncShortageBackorders(orderId: string): Promise<void> {
  const { data: items, error: readErr } = await supabase
    .from('order_items')
    .select('id,product_name,qty_ordered,status')
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
  const rows = shorts.map((i: any) => ({
    source_order_id: orderId,
    reason: 'shortage',
    product_name: i.product_name,
    qty: i.qty_ordered,
    status: 'pending',
    target_ship_date: null,
  }))
  const { error } = await supabase.from('backorders').insert(rows)
  if (error) throw new Error('สร้างรายการค้างส่งไม่สำเร็จ: ' + error.message)
}

// Called by the claim resolution flow (Task 22): queue a compensating shipment
// for an approved "resend next day" claim.
export async function createResendBackorder(claimId: string): Promise<void> {
  const { data: c } = await supabase
    .from('claims')
    .select('order_id,qty,order_item_id, order_items(product_name)')
    .eq('id', claimId)
    .single()
  if (!c) throw new Error('ไม่พบเคลม')
  const product = (c as any).order_items?.product_name ?? 'ไม่ระบุสินค้า'
  const { error } = await supabase.from('backorders').insert({
    source_order_id: (c as any).order_id,
    reason: 'claim_resend',
    product_name: product,
    qty: (c as any).qty,
    status: 'pending',
    target_ship_date: null,
  })
  if (error) throw new Error('สร้างรายการส่งชดเชยไม่สำเร็จ: ' + error.message)
}

// After a ship day's orders are imported, attach any pending backorder whose
// source customer has a fresh order that day (and which is not already tied to
// a different day). Returns how many rows were linked.
export async function linkBackordersToDay(shipDate: string): Promise<number> {
  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('id,customer_name_en')
    .eq('ship_date', shipDate)
  if (ordErr) throw new Error('โหลดออเดอร์ประจำวันไม่สำเร็จ: ' + ordErr.message)
  const { data: pend, error: pendErr } = await supabase
    .from('backorders')
    .select(
      'id,source_order_id,target_ship_date, orders!backorders_source_order_id_fkey(customer_name_en)',
    )
    .eq('status', 'pending')
  if (pendErr) throw new Error('โหลดรายการค้างส่งไม่สำเร็จ: ' + pendErr.message)
  let linked = 0
  for (const b of pend ?? []) {
    if ((b as any).target_ship_date && (b as any).target_ship_date !== shipDate) continue
    const cust = (b as any).orders?.customer_name_en
    const match = (orders ?? []).find((o: any) => o.customer_name_en === cust)
    if (!match) continue
    const { error } = await supabase
      .from('backorders')
      .update({ target_order_id: (match as any).id, target_ship_date: shipDate })
      .eq('id', (b as any).id)
    if (!error) linked++
  }
  return linked
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
