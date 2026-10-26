import { supabase } from '../supabase'
import { getOrCreateShipDay } from './shipDays'
import { logAction } from './audit'
import { todayLocalISO } from '../format'
import { canMoveShipDay, shipDayTargetError } from '../postponed'

export type MovableOrder = { id: string; makro_order_no: string; ship_date: string; status: string }

/**
 * เลื่อนวันส่ง (manager / online team): move orders to a later ship day, e.g. a customer locked for
 * an unpaid bill, sent once they pay. Same move as a postponed PO at import (commitImport): packing,
 * photos, boxes and link go along; the boat is cleared (boats belong to a day) and an order at the
 * pier goes back to packed. A claim resend waiting on these orders follows them. A payment release
 * belongs to the old day, so a customer still owing is locked again on the new one.
 * Returns how many orders moved.
 */
export async function moveOrdersToDay(
  orders: MovableOrder[],
  toDate: string,
  reason: string,
  today = todayLocalISO(),
): Promise<number> {
  const why = reason.trim()
  if (!why) throw new Error('ใส่เหตุผลที่เลื่อนวันส่ง')
  const gone = orders.find((o) => !canMoveShipDay(o.status))
  if (gone) throw new Error(`ออเดอร์ ${gone.makro_order_no} ส่งออกไปแล้ว เลื่อนวันส่งไม่ได้`)
  for (const o of orders) {
    const bad = shipDayTargetError(toDate, o.ship_date, today)
    if (bad) throw new Error(bad)
  }
  if (orders.length === 0) return 0

  const day = await getOrCreateShipDay(toDate)
  for (const o of orders) {
    const status = o.status === 'at_pier' ? 'packed' : o.status
    const { error } = await supabase
      .from('orders')
      .update({ ship_day_id: day.id, ship_date: toDate, boat_id: null, status })
      .eq('id', o.id)
    if (error) throw new Error(`เลื่อนวันส่งออเดอร์ ${o.makro_order_no} ไม่สำเร็จ: ${error.message}`)
    await logAction('move_ship_day', 'order', o.id, {
      makroOrderNo: o.makro_order_no,
      from: o.ship_date,
      to: toDate,
      reason: why,
    })
  }
  // best-effort: the orders moved; a resend left on the old day still shows on the order itself
  const { error: eB } = await supabase
    .from('backorders')
    .update({ target_ship_date: toDate })
    .in('target_order_id', orders.map((o) => o.id))
    .eq('status', 'pending')
  if (eB) console.warn('moving claim resends with the orders failed', eB)
  return orders.length
}
