import { deptBars, niceTicks, shortageTrend } from './shortageCharts'
import type { ShortageReport } from './api/shortageReport'

// Minimal report: detail rows are what the trend counts (one per item x order).
function report(groups: { code: any; dates: string[][] }[]): ShortageReport {
  return {
    productCount: 0,
    occurrenceCount: 0,
    affectedOrderCount: 0,
    groups: groups.map((g) => ({
      code: g.code,
      label: g.code,
      occurrenceCount: g.dates.reduce((n, ds) => n + ds.length, 0),
      products: g.dates.map((ds, i) => ({
        key: `${g.code}-${i}`,
        itemId: `${i}`,
        productName: `p${i}`,
        dept: g.code,
        totalQty: ds.length,
        orderCount: ds.length,
        details: ds.map((d, j) => ({
          orderId: `o${j}`,
          makroOrderNo: `PO-${j}`,
          customerNameEn: 'c',
          shipDate: d,
          qty: 1,
        })),
      })),
    })),
  }
}

test('deptBars: one bar per department, most occurrences first', () => {
  const r = report([
    { code: 'FV', dates: [['2026-09-01']] },
    { code: 'FZ', dates: [['2026-09-01', '2026-09-02'], ['2026-09-03']] },
  ])
  expect(deptBars(r)).toEqual([
    { code: 'FZ', label: 'FZ', occurrences: 3, products: 2 },
    { code: 'FV', label: 'FV', occurrences: 1, products: 1 },
  ])
})

test('trend: up to 31 days is one column per day, empty days as zero', () => {
  const r = report([{ code: 'FV', dates: [['2026-09-02', '2026-09-02'], ['2026-09-04']] }])
  const t = shortageTrend(r, '2026-09-01', '2026-09-05')
  expect(t.unit).toBe('day')
  expect(t.buckets.map((b) => [b.start, b.count])).toEqual([
    ['2026-09-01', 0],
    ['2026-09-02', 2],
    ['2026-09-03', 0],
    ['2026-09-04', 1],
    ['2026-09-05', 0],
  ])
})

test('trend: longer ranges bucket by Monday-start week; first/last weeks are clipped to the range', () => {
  // 2026-09-03 is a Thursday; 2026-10-14 a Wednesday -> 42 days
  const r = report([{ code: 'FV', dates: [['2026-09-03', '2026-09-06', '2026-09-07', '2026-10-14']] }])
  const t = shortageTrend(r, '2026-09-03', '2026-10-14')
  expect(t.unit).toBe('week')
  expect(t.buckets[0]).toEqual({ start: '2026-09-03', end: '2026-09-06', count: 2 })
  expect(t.buckets[1]).toEqual({ start: '2026-09-07', end: '2026-09-13', count: 1 })
  expect(t.buckets.at(-1)).toEqual({ start: '2026-10-12', end: '2026-10-14', count: 1 })
  expect(t.buckets.reduce((n, b) => n + b.count, 0)).toBe(4)
})

test('trend: an inverted range yields no buckets rather than looping', () => {
  expect(shortageTrend(report([]), '2026-09-10', '2026-09-01').buckets).toEqual([])
})

test('niceTicks: clean whole-number steps covering the max', () => {
  expect(niceTicks(0)).toEqual([0, 1])
  expect(niceTicks(3)).toEqual([0, 1, 2, 3])
  expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8])
  expect(niceTicks(23)).toEqual([0, 10, 20, 30])
  expect(niceTicks(100)).toEqual([0, 50, 100])
})
