import { supabase } from '../supabase'
import { getOrCreateShipDay } from './shipDays'
import { linkBackordersToDay } from './backorders'
import { logAction } from './audit'
import { makeLinkToken } from '../token'
import type { ParsedOrder } from '../import/mapColumns'
import { canTransition, type OrderStatus } from '../status'

export async function commitImport(
  shipDate: string,
  orders: ParsedOrder[],
  opts: { force?: boolean } = {},
): Promise<{ created: number; overwrites: string[] }> {
  const day = await getOrCreateShipDay(shipDate)
  const nos = orders.map((o) => o.makroOrderNo)
  const { data: existing } = await supabase
    .from('orders')
    .select('id,makro_order_no')
    .eq('ship_day_id', day.id)
    .in('makro_order_no', nos)
  const dupNos = (existing ?? []).map((r: any) => r.makro_order_no)

  if (dupNos.length && !opts.force) return { created: 0, overwrites: dupNos }
  if (dupNos.length && opts.force) {
    await supabase
      .from('orders')
      .delete()
      .in(
        'id',
        (existing ?? []).map((r: any) => r.id),
      )
  }

  let created = 0
  for (const o of orders) {
    const { data: ins, error } = await supabase
      .from('orders')
      .insert({
        ship_day_id: day.id,
        makro_order_no: o.makroOrderNo,
        customer_name_en: o.customerNameEn,
        ship_date: shipDate,
        link_token: makeLinkToken(),
        total_value_cached: o.totalValue,
      })
      .select('id')
      .single()
    if (error) throw new Error(`สร้างออเดอร์ ${o.makroOrderNo} ไม่สำเร็จ: ${error.message}`)
    const orderId = (ins as any).id
    const items = o.items.map((it) => ({
      order_id: orderId,
      product_name: it.productName,
      qty_ordered: it.qtyOrdered,
      unit_price: it.unitPrice,
      line_no: it.lineNo,
    }))
    const { error: e2 } = await supabase.from('order_items').insert(items)
    if (e2) throw new Error(`สร้างรายการของ ${o.makroOrderNo} ไม่สำเร็จ: ${e2.message}`)
    created++
  }

  await linkBackordersToDay(shipDate)
  await logAction('import', 'ship_day', day.id, { shipDate, created })
  return { created, overwrites: opts.force ? dupNos : [] }
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

export async function regenTokenLink(orderId: string): Promise<string> {
  const token = makeLinkToken()
  const { error } = await supabase.from('orders').update({ link_token: token }).eq('id', orderId)
  if (error) throw new Error('สร้างลิงก์ใหม่ไม่สำเร็จ: ' + error.message)
  await logAction('regen_link', 'order', orderId)
  return token
}
