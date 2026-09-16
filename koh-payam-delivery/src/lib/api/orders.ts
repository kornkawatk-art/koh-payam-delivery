import { supabase } from '../supabase'
import { getOrCreateShipDay } from './shipDays'
import { linkBackordersToDay, syncShortageBackorders } from './backorders'
import { logAction } from './audit'
import { makeLinkToken } from '../token'
import type { ParsedOrder, ParsedItem } from '../import/buildImport'
import { canTransition, type OrderStatus } from '../status'

// packedByKey carries a synced order's per-line "packed" tick forward across
// the delete+reinsert below (see commitImport) -- keyed by makro_item_id when
// present, else product_name, since order_items rows have no other stable
// identity across a re-import. Undefined (a brand-new order) means every line
// starts unpacked, same as the column's own default.
function itemRows(orderId: string, items: ParsedItem[], packedByKey?: Map<string, boolean>) {
  return items.map((it) => ({
    order_id: orderId,
    product_name: it.productName,
    qty_ordered: it.orderedQty,
    qty_shipped: it.shippedQty,
    shortage_qty: it.shortageQty,
    status: it.isShort ? 'short' : 'ok',
    makro_item_id: it.itemId,
    item_remark: it.itemRemark,
    line_no: it.lineNo,
    is_fresh: it.isFresh,
    packed: packedByKey?.get(it.itemId || it.productName) ?? false,
  }))
}

// Re-import is a non-destructive sync: brand-new orders are inserted, orders that
// already exist for this ship day get their order-level makro fields refreshed and
// their line items replaced from the file. Box counts, boat, status, timestamps,
// link token, photos and claims are left untouched. Shortage backorders DO get
// refreshed (via syncShortageBackorders) for every order, new or synced — a
// corrected shipped/shortage number from Makro must be reflected in the
// backorder list too, not just on the order's own item table. Each line's own
// "packed" tick is carried forward across the sync too (matched by
// makro_item_id, or product_name when that's blank) — see itemRows below.
export async function commitImport(
  shipDate: string,
  orders: ParsedOrder[],
): Promise<{ created: number; synced: number }> {
  const day = await getOrCreateShipDay(shipDate)
  const nos = orders.map((o) => o.makroOrderNo)
  const { data: existing } = await supabase
    .from('orders')
    .select('id,makro_order_no')
    .eq('ship_day_id', day.id)
    .in('makro_order_no', nos)
  const idByNo = new Map<string, string>(
    (existing ?? []).map((r: any) => [r.makro_order_no, r.id]),
  )

  let created = 0
  let synced = 0
  for (const o of orders) {
    const existingId = idByNo.get(o.makroOrderNo)
    if (!existingId) {
      const { data: ins, error } = await supabase
        .from('orders')
        .insert({
          ship_day_id: day.id,
          makro_order_no: o.makroOrderNo,
          customer_name_en: o.customerName,
          ship_date: shipDate,
          status: 'imported',
          link_token: makeLinkToken(),
          sub_district: o.subDistrict,
          makro_order_status: o.makroOrderStatus,
          payment_method: o.paymentMethod,
          payment_status: o.paymentStatus,
          outstanding_amount: o.outstandingAmount,
          customer_phone: o.customerPhone,
        })
        .select('id')
        .single()
      if (error) throw new Error(`สร้างออเดอร์ ${o.makroOrderNo} ไม่สำเร็จ: ${error.message}`)
      const orderId = (ins as any).id
      const { error: e2 } = await supabase.from('order_items').insert(itemRows(orderId, o.items))
      if (e2) throw new Error(`สร้างรายการของ ${o.makroOrderNo} ไม่สำเร็จ: ${e2.message}`)
      await syncShortageBackorders(orderId)
      created++
    } else {
      const { error: eU } = await supabase
        .from('orders')
        .update({
          customer_name_en: o.customerName,
          sub_district: o.subDistrict,
          makro_order_status: o.makroOrderStatus,
          payment_method: o.paymentMethod,
          payment_status: o.paymentStatus,
          outstanding_amount: o.outstandingAmount,
          customer_phone: o.customerPhone,
        })
        .eq('id', existingId)
      if (eU) throw new Error(`อัปเดตออเดอร์ ${o.makroOrderNo} ไม่สำเร็จ: ${eU.message}`)
      const { data: oldItems } = await supabase
        .from('order_items')
        .select('makro_item_id,product_name,packed')
        .eq('order_id', existingId)
      const packedByKey = new Map<string, boolean>(
        (oldItems ?? []).map((r: any) => [r.makro_item_id || r.product_name, !!r.packed]),
      )
      const { error: eD } = await supabase.from('order_items').delete().eq('order_id', existingId)
      if (eD) throw new Error(`ล้างรายการของ ${o.makroOrderNo} ไม่สำเร็จ: ${eD.message}`)
      const { error: e2 } = await supabase
        .from('order_items')
        .insert(itemRows(existingId, o.items, packedByKey))
      if (e2) throw new Error(`sync รายการของ ${o.makroOrderNo} ไม่สำเร็จ: ${e2.message}`)
      // Re-syncing an order's items can change which lines are short (Makro
      // corrects a shipped/shortage number after the fact) — refresh this
      // order's still-pending shortage backorders to match, the same way
      // savePack already does on every pack-screen save. Safe to call
      // unconditionally: it only touches this order's own still-*pending*
      // shortage rows, never a row already marked fulfilled (see its own
      // header comment in backorders.ts).
      await syncShortageBackorders(existingId)
      synced++
    }
  }

  await linkBackordersToDay(shipDate)
  await logAction('import', 'ship_day', day.id, { shipDate, created, synced })
  return { created, synced }
}

// Lookup by the Makro shipping-label QR code (plain text = makro_order_no).
// Uniqueness is only guaranteed per ship_day_id, not globally, so this can
// return zero, one, or multiple rows — the caller (QrOrderScanner) decides
// what to do with each case. No ship_date filter: searches everything the
// current user can read under RLS (all orders, for a team member).
export async function findOrdersByMakroOrderNo(
  orderNo: string,
): Promise<{ id: string; customer_name_en: string; ship_date: string }[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id,customer_name_en,ship_date')
    .eq('makro_order_no', orderNo.trim())
  if (error) throw new Error('ค้นหาออเดอร์ไม่สำเร็จ: ' + error.message)
  return (data ?? []) as { id: string; customer_name_en: string; ship_date: string }[]
}

export async function getOrder(orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), boxes(*), evidence_photos(*), claims(*)')
    .eq('id', orderId)
    .single()
  if (error) throw new Error('โหลดออเดอร์ไม่สำเร็จ: ' + error.message)
  return data
}

export async function updateOrderStatus(orderId: string, next: OrderStatus) {
  const { data: cur, error } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()
  if (error) throw new Error(error.message)
  // Re-clicking the same status button (e.g. "แพ็คเสร็จ" on an already-packed
  // order) is a harmless no-op, not an illegal transition.
  if ((cur as any).status === next) return
  if (!canTransition((cur as any).status, next))
    throw new Error(`เปลี่ยนสถานะจาก ${(cur as any).status} เป็น ${next} ไม่ได้`)
  const { error: e2 } = await supabase.from('orders').update({ status: next }).eq('id', orderId)
  if (e2) throw new Error(e2.message)
  await logAction('status_change', 'order', orderId, { from: (cur as any).status, to: next })
}

export async function setOrderBoat(orderId: string, boatId: string) {
  const { data, error } = await supabase
    .from('orders')
    .update({ boat_id: boatId, status: 'at_pier' })
    .eq('id', orderId)
    .in('status', ['packed', 'at_pier'])
    .select('id')
  if (error) throw new Error('บันทึกเรือไม่สำเร็จ: ' + error.message)
  if (!data || data.length === 0)
    throw new Error('บันทึกเรือไม่สำเร็จ (ออเดอร์อาจถูกส่งไปแล้ว)')
  await logAction('boat_set', 'order', orderId, { boatId })
}

export async function setOrderPierName(orderId: string, pierName: string): Promise<void> {
  const { data, error } = await supabase
    .from('orders')
    .update({ pier_name: pierName.trim() || null })
    .eq('id', orderId)
    .select('id')
  if (error) throw new Error('บันทึกชื่อคนลงเรือไม่สำเร็จ: ' + error.message)
  if (!data || data.length === 0)
    throw new Error('บันทึกชื่อคนลงเรือไม่สำเร็จ (ออเดอร์อาจถูกส่งไปแล้ว)')
  await logAction('pier_name_set', 'order', orderId, { pierName })
}

// Autocomplete source for the "ชื่อคนลงเรือ" field on the pier screen — distinct
// pier names already used on other orders, read straight off `orders` rather
// than a separate roster table.
export async function listDistinctPierNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('pier_name')
    .not('pier_name', 'is', null)
  if (error) return []
  const names = new Set<string>()
  for (const row of (data ?? []) as { pier_name: string | null }[]) {
    if (row.pier_name) names.add(row.pier_name)
  }
  return Array.from(names).sort()
}

export async function regenTokenLink(orderId: string): Promise<string> {
  const token = makeLinkToken()
  const { error } = await supabase.from('orders').update({ link_token: token }).eq('id', orderId)
  if (error) throw new Error('สร้างลิงก์ใหม่ไม่สำเร็จ: ' + error.message)
  await logAction('regen_link', 'order', orderId)
  return token
}

// Manager-only, one-at-a-time hard delete of a wrongly-imported/cancelled order.
// RLS's manager_delete policy is the real gate; this is just the client call.
// The 4-field snapshot is passed in by the caller because there is nothing left
// in the DB to read it back from once the row (and its cascaded children) is gone.
export async function deleteOrder(
  orderId: string,
  snapshot: {
    makroOrderNo: string
    customerNameEn: string
    status: string
    shipDate: string
  },
): Promise<void> {
  const { data, error } = await supabase.from('orders').delete().eq('id', orderId).select('id')
  if (error) throw new Error('ลบออเดอร์ไม่สำเร็จ: ' + error.message)
  if (!data || data.length === 0)
    throw new Error('ลบออเดอร์ไม่สำเร็จ (ไม่มีสิทธิ์ หรือออเดอร์ถูกลบไปแล้ว)')
  await logAction('order_deleted', 'order', orderId, snapshot)
}
