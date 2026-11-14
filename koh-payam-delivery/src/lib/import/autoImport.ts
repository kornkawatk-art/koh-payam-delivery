// The hourly import the AO bot triggers (Edge Function auto-import, bundled from this file by
// scripts/build-auto-import.mjs). Same rules as the นำเข้าออเดอร์ screen, with the choices a person
// makes there fixed:
// - the default column mapping (the AO export's own headers);
// - each order goes to its own delivery date -- Makro's moved date when it moved the delivery
//   ("New Expected Delivery Date"), else the original one -- and only today's and tomorrow's are
//   imported: the export spans 8 days, and earlier days are already done;
// - a PO Makro postponed (it sits on an earlier day in the app, Makro now says this day) moves here
//   by itself when it hasn't gone to the pier yet -- with its packing, photos, boxes and link, the same
//   move as the manager's tick on the import screen; one already at the pier stays for a manager, and
//   is only reported (postponed);
// - every other order in the export (the earlier days) still gets Makro's latest payment facts, the same
//   refresh as the "อัปเดตสถานะการจ่ายเงินอย่างเดียว" card: a bill paid after its delivery must stop
//   locking the customer without anyone re-importing by hand;
// - a manager's paid mark is never cleared here (Makro records cash payments late): only a Makro "Paid"
//   or the manager takes it off; a person importing by hand still clears it, as before.
import type { RawRow } from './parseMakroFile'
import {
  buildImport,
  buildPaymentRefresh,
  parseExpectedDate,
  validateMapping,
  DEFAULT_DETAIL_MAPPING,
  DEFAULT_ORDER_MAPPING,
} from './buildImport'
import { applyVoided, commitImport, listOrdersOnOtherDays } from '../api/orders'
import { recordImport } from '../api/dataImports'
import { refreshPayments } from '../api/paymentRefresh'
import { listBoxLabelMap } from '../api/boxLabels'
import { movableNos, nextDayISO } from '../postponed'

export type AutoImportDay = { shipDate: string; orders: number; created: number; synced: number; skipped: number; moved: number; postponed: string[] }
/** Makro's column for a delivery it moved to another day (blank when it did not) */
export const MOVED_DATE_COLUMN = 'New Expected Delivery Date'

export type AutoImportReport = { days: AutoImportDay[]; notIsland: number; paymentsRefreshed: number; voidedDropped: string[] }

export async function autoImport(detailRows: RawRow[], orderRows: RawRow[], today: string): Promise<AutoImportReport> {
  const problems = [
    ...validateMapping('detail', Object.keys(detailRows[0] ?? {}), DEFAULT_DETAIL_MAPPING),
    ...validateMapping('order', Object.keys(orderRows[0] ?? {}), DEFAULT_ORDER_MAPPING),
  ]
  if (problems.length) throw new Error('ไฟล์จาก AO ไม่ตรงรูปแบบ: ' + problems.join(' · '))

  // POs sale named in O2O Desk come in too, as Myanmar-bound orders (0039)
  const r = buildImport(detailRows, orderRows, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING, await listBoxLabelMap())
  const moved = new Map<string, string>()
  for (const row of orderRows) {
    const d = parseExpectedDate(row[MOVED_DATE_COLUMN] ?? '')
    if (d) moved.set(String(row[DEFAULT_ORDER_MAPPING.orderNo] ?? '').trim(), d)
  }
  const deliveryDate = (o: { makroOrderNo: string; expectedDate: string | null }) => moved.get(o.makroOrderNo) ?? o.expectedDate
  const days: AutoImportDay[] = []
  let voided = r.skippedVoid ?? []
  const voidedDropped: string[] = []
  for (const shipDate of [today, nextDayISO(today)]) {
    const orders = r.orders.filter((o) => deliveryDate(o) === shipDate)
    if (orders.length === 0) continue
    const others = await listOrdersOnOtherDays(
      orders.map((o) => o.makroOrderNo),
      shipDate,
    )
    // Makro moved these to this day; not yet at the pier -> follow Makro (at the pier: a manager decides)
    const movable = movableNos(others, shipDate)
    const atPier = new Set(others.filter((o) => o.status === 'at_pier').map((o) => o.makro_order_no))
    const move = [...movable].filter((no) => !atPier.has(no))
    // void labels go on whatever day the PO sits; once is enough
    const c = await commitImport(shipDate, orders, voided, move, { keepPaidMark: true })
    voidedDropped.push(...c.dropped)
    voided = []
    days.push({
      shipDate,
      orders: orders.length,
      created: c.created,
      synced: c.synced,
      skipped: c.skipped.length,
      moved: c.moved,
      postponed: [...movable].filter((no) => atPier.has(no)),
    })
  }
  // nothing island-bound today or tomorrow still counts as an up-to-date import
  if (days.length === 0) await recordImport(0, 0)
  // canceled POs still need clearing out even when no day was imported
  if (voided.length) voidedDropped.push(...(await applyVoided(voided)).dropped)

  // the earlier (and later) days' POs already in the app: payment facts only (today's and tomorrow's were synced above)
  const imported = new Set(r.orders.filter((o) => [today, nextDayISO(today)].includes(deliveryDate(o) ?? '')).map((o) => o.makroOrderNo))
  const rest = buildPaymentRefresh(orderRows, DEFAULT_ORDER_MAPPING).filter((p) => !imported.has(p.makroOrderNo))
  const { refreshed } = rest.length ? await refreshPayments(rest, { keepPaidMark: true }) : { refreshed: 0 }
  return { days, notIsland: r.skippedNotIsland, paymentsRefreshed: refreshed, voidedDropped }
}
