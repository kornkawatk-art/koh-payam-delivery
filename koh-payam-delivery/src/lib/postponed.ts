export type OtherDayOrder = { id: string; makro_order_no: string; ship_date: string; status: string }

/** Not gone out yet (not shipped / picked up): the order can still move to another ship day. */
export const canMoveShipDay = (status: string) => !['shipped', 'picked_up'].includes(status)

// A PO Makro postponed (yesterday -> today) is still in the system on the old day. The importer
// can tick it to move it to the day being imported (`shipDate`). Only a PO on exactly one EARLIER
// day that has not gone out yet can move -- a delivered one is just re-listed, and one the team
// postponed to a later day (เลื่อนวันส่ง) must not be offered back when the old day is re-imported.
export function movableNos(rows: OtherDayOrder[], shipDate: string): Set<string> {
  const byNo = new Map<string, OtherDayOrder[]>()
  for (const r of rows) byNo.set(r.makro_order_no, [...(byNo.get(r.makro_order_no) ?? []), r])
  const out = new Set<string>()
  for (const [no, rs] of byNo)
    if (rs.length === 1 && rs[0].ship_date < shipDate && canMoveShipDay(rs[0].status)) out.add(no)
  return out
}

/** "2026-10-31" -> "2026-11-01" */
export function nextDayISO(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Why `to` can't be the new ship day for an order now on `from`, or null when it can: the team
 * postpones forward only (tomorrow or later, e.g. until a customer pays), never onto the same day.
 */
export function shipDayTargetError(to: string, from: string, today: string): string | null {
  if (!to) return 'เลือกวันส่งใหม่'
  if (to <= today) return 'เลือกได้ตั้งแต่พรุ่งนี้เป็นต้นไป'
  if (to === from) return 'ออเดอร์อยู่วันนี้อยู่แล้ว'
  return null
}
