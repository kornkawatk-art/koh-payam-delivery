import type { ShortageDeptGroup, ShortageReport } from './api/shortageReport'
import { formatDateTH } from './format'
import { islandName } from './islands'

/**
 * Quantity without a unit: weighed items are short by fractional kilos and
 * everything else by pieces, so "12 ชิ้น" would be wrong for half the
 * catalogue. At most 2 decimals, no trailing zeros ("12", "0.45").
 */
export const formatQty = (n: number) => String(Math.round(n * 100) / 100)

export const formatRangeTH = (from: string, to: string) =>
  from === to ? formatDateTH(from) : `${formatDateTH(from)} – ${formatDateTH(to)}`

/**
 * Plain-text summary of one department, ready to paste into LINE for that
 * department's owner. Lists every product (not just a top N), in the
 * report's own ranking order.
 */
export function buildLineSummary(group: ShortageDeptGroup, from: string, to: string): string {
  const lines = group.products.map((p, i) => {
    const code = p.itemId ? `[${p.itemId}] ` : ''
    return `${i + 1}. ${code}${p.productName} — ขาด ${p.orderCount} ครั้ง (รวม ${formatQty(p.totalQty)})`
  })
  return [
    `รายงานของขาด — แผนก ${group.label}`,
    `ช่วง ${formatRangeTH(from, to)}`,
    ...lines,
    `รวม ${group.products.length} รายการ`,
  ].join('\n')
}

/** Rows for the two Excel sheets: a per-product summary and every order line. */
export function buildExcelRows(report: ShortageReport) {
  const summary = report.groups.flatMap((g) =>
    g.products.map((p) => ({
      แผนก: g.label,
      รหัสสินค้า: p.itemId,
      สินค้า: p.productName,
      จำนวนครั้งที่ขาด: p.orderCount,
      จำนวนที่ขาดรวม: p.totalQty,
    })),
  )
  const details = report.groups.flatMap((g) =>
    g.products.flatMap((p) =>
      p.details.map((d) => ({
        วันที่ส่ง: d.shipDate,
        เลขออเดอร์: d.makroOrderNo,
        ลูกค้า: d.customerNameEn,
        เกาะ: islandName(d.island) ?? 'ยังไม่ระบุ',
        แผนก: g.label,
        รหัสสินค้า: p.itemId,
        สินค้า: p.productName,
        จำนวนที่ขาด: d.qty,
      })),
    ),
  )
  details.sort(
    (a, b) => a.วันที่ส่ง.localeCompare(b.วันที่ส่ง) || a.เลขออเดอร์.localeCompare(b.เลขออเดอร์),
  )
  return { summary, details }
}

/** Build and download the .xlsx. SheetJS is loaded on demand -- only when a manager exports. */
export async function downloadShortageExcel(report: ShortageReport, from: string, to: string) {
  const XLSX = await import('xlsx')
  const { summary, details } = buildExcelRows(report)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'สรุปตามสินค้า')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(details), 'รายละเอียด')
  XLSX.writeFile(wb, `รายงานของขาด_${from}_ถึง_${to}.xlsx`)
}
