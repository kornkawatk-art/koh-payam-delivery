// The hourly import the AO bot triggers (Edge Function auto-import, bundled from this file by
// scripts/build-auto-import.mjs). Same rules as the นำเข้าออเดอร์ screen, with the choices a person
// makes there fixed:
// - the default column mapping (the AO export's own headers);
// - each order goes to its own delivery date -- Makro's moved date when it moved the delivery
//   ("New Expected Delivery Date"), else the original one -- and only today's and tomorrow's are
//   imported: the export spans 8 days, and earlier days are already done;
// - postponed orders are never moved (that stays a manager's tick); they are only counted.
import type { RawRow } from './parseMakroFile'
import {
  buildImport,
  parseExpectedDate,
  validateMapping,
  DEFAULT_DETAIL_MAPPING,
  DEFAULT_ORDER_MAPPING,
} from './buildImport'
import { commitImport, listOrdersOnOtherDays } from '../api/orders'
import { recordImport } from '../api/dataImports'
import { movableNos, nextDayISO } from '../postponed'

export type AutoImportDay = { shipDate: string; orders: number; created: number; synced: number; skipped: number; postponed: string[] }
/** Makro's column for a delivery it moved to another day (blank when it did not) */
export const MOVED_DATE_COLUMN = 'New Expected Delivery Date'

export type AutoImportReport = { days: AutoImportDay[]; notIsland: number }

export async function autoImport(detailRows: RawRow[], orderRows: RawRow[], today: string): Promise<AutoImportReport> {
  const problems = [
    ...validateMapping('detail', Object.keys(detailRows[0] ?? {}), DEFAULT_DETAIL_MAPPING),
    ...validateMapping('order', Object.keys(orderRows[0] ?? {}), DEFAULT_ORDER_MAPPING),
  ]
  if (problems.length) throw new Error('ไฟล์จาก AO ไม่ตรงรูปแบบ: ' + problems.join(' · '))

  const r = buildImport(detailRows, orderRows, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const moved = new Map<string, string>()
  for (const row of orderRows) {
    const d = parseExpectedDate(row[MOVED_DATE_COLUMN] ?? '')
    if (d) moved.set(String(row[DEFAULT_ORDER_MAPPING.orderNo] ?? '').trim(), d)
  }
  const deliveryDate = (o: { makroOrderNo: string; expectedDate: string | null }) => moved.get(o.makroOrderNo) ?? o.expectedDate
  const days: AutoImportDay[] = []
  let voided = r.skippedVoid ?? []
  for (const shipDate of [today, nextDayISO(today)]) {
    const orders = r.orders.filter((o) => deliveryDate(o) === shipDate)
    if (orders.length === 0) continue
    const others = await listOrdersOnOtherDays(
      orders.map((o) => o.makroOrderNo),
      shipDate,
    )
    // void labels go on whatever day the PO sits; once is enough
    const c = await commitImport(shipDate, orders, voided, [])
    voided = []
    days.push({
      shipDate,
      orders: orders.length,
      created: c.created,
      synced: c.synced,
      skipped: c.skipped.length,
      postponed: [...movableNos(others, shipDate)],
    })
  }
  // nothing island-bound today or tomorrow still counts as an up-to-date import
  if (days.length === 0) await recordImport(0, 0)
  return { days, notIsland: r.skippedNotIsland }
}
