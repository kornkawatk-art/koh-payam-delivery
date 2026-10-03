import { buildExcelRows, buildLineSummary, formatQty } from './shortageExport'
import type { ShortageReport } from './api/shortageReport'

const report: ShortageReport = {
  productCount: 2,
  occurrenceCount: 3,
  affectedOrderCount: 2,
  groups: [
    {
      code: 'FZ',
      label: 'FZ',
      occurrenceCount: 3,
      products: [
        {
          key: '100001',
          itemId: '100001',
          productName: 'Fish sauce 700ml',
          dept: 'FZ',
          totalQty: 12,
          orderCount: 2,
          details: [
            { orderId: 'a', makroOrderNo: 'PO-A', customerNameEn: 'Alice', shipDate: '2026-09-02', qty: 5 },
            { orderId: 'b', makroOrderNo: 'PO-B', customerNameEn: 'Bob', shipDate: '2026-09-01', qty: 7 },
          ],
        },
        {
          key: 'name:Loose pork',
          itemId: '',
          productName: 'Loose pork',
          dept: 'FZ',
          totalQty: 0.45,
          orderCount: 1,
          details: [
            { orderId: 'a', makroOrderNo: 'PO-A', customerNameEn: 'Alice', shipDate: '2026-09-02', qty: 0.45 },
          ],
        },
      ],
    },
  ],
}

test('formatQty: no unit, at most 2 decimals, no trailing zeros', () => {
  expect(formatQty(12)).toBe('12')
  expect(formatQty(0.45)).toBe('0.45')
  expect(formatQty(0.1 + 0.2)).toBe('0.3') // float noise from summing weighed items
  expect(formatQty(2.5)).toBe('2.5')
})

test('LINE summary: department heading, range, every product ranked with code, count and total', () => {
  const text = buildLineSummary(report.groups[0], '2026-09-01', '2026-09-30')
  const lines = text.split('\n')
  expect(lines[0]).toBe('รายงานของขาด — แผนก FZ')
  expect(lines[1]).toMatch(/^ช่วง .+ – .+$/)
  expect(lines[2]).toBe('1. [100001] Fish sauce 700ml — ขาด 2 ครั้ง (รวม 12)')
  // no item code -> no empty brackets
  expect(lines[3]).toBe('2. Loose pork — ขาด 1 ครั้ง (รวม 0.45)')
  expect(lines[4]).toBe('รวม 2 รายการ')
})

test('Excel rows: one summary row per product, one detail row per order line sorted by date', () => {
  const { summary, details } = buildExcelRows(report)
  expect(summary).toEqual([
    { แผนก: 'FZ', รหัสสินค้า: '100001', สินค้า: 'Fish sauce 700ml', จำนวนครั้งที่ขาด: 2, จำนวนที่ขาดรวม: 12 },
    { แผนก: 'FZ', รหัสสินค้า: '', สินค้า: 'Loose pork', จำนวนครั้งที่ขาด: 1, จำนวนที่ขาดรวม: 0.45 },
  ])
  expect(details.map((d) => [d.วันที่ส่ง, d.เลขออเดอร์, d.สินค้า])).toEqual([
    ['2026-09-01', 'PO-B', 'Fish sauce 700ml'],
    ['2026-09-02', 'PO-A', 'Fish sauce 700ml'],
    ['2026-09-02', 'PO-A', 'Loose pork'],
  ])
})

test('the details sheet has an island column ("ยังไม่ระบุ" while unpicked)', () => {
  const withIsland: ShortageReport = {
    ...report,
    groups: report.groups.map((g) => ({
      ...g,
      products: g.products.map((p) => ({
        ...p,
        details: p.details.map((d, i) => ({ ...d, island: i === 0 ? 'chang' : null })),
      })),
    })),
  }
  const { details } = buildExcelRows(withIsland)
  expect(new Set(details.map((d) => d.เกาะ))).toEqual(new Set(['เกาะช้าง', 'ยังไม่ระบุ']))
})
