import type { ShortageReport } from './api/shortageReport'
import type { DeptGroupCode } from './departments'

export type DeptBar = { code: DeptGroupCode; label: string; occurrences: number; products: number }

/** One bar per department that had shortages, most occurrences first. */
export function deptBars(report: ShortageReport): DeptBar[] {
  return report.groups
    .map((g) => ({
      code: g.code,
      label: g.label,
      occurrences: g.occurrenceCount,
      products: g.products.length,
    }))
    .sort((a, b) => b.occurrences - a.occurrences)
}

export type TrendBucket = {
  start: string // ISO date, inclusive
  end: string // ISO date, inclusive
  count: number // short occurrences (item x order) shipped in the bucket
}

export type Trend = { unit: 'day' | 'week'; buckets: TrendBucket[] }

// Ranges up to this many days plot one column per day; longer ones one per
// week, so a phone never has to fit 90 hair-thin columns.
export const DAILY_MAX_DAYS = 31

const toDate = (iso: string) => new Date(`${iso}T00:00:00`)
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/**
 * Short occurrences per ship day (or per Monday-start week) across the whole
 * chosen range -- empty days included as zero, so gaps read as "no
 * shortages", not as missing data.
 */
export function shortageTrend(report: ShortageReport, from: string, to: string): Trend {
  const counts = new Map<string, number>()
  for (const g of report.groups)
    for (const p of g.products)
      for (const d of p.details) counts.set(d.shipDate, (counts.get(d.shipDate) ?? 0) + 1)

  const start = toDate(from)
  const end = toDate(to)
  if (!(start <= end)) return { unit: 'day', buckets: [] }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1

  if (days <= DAILY_MAX_DAYS) {
    const buckets: TrendBucket[] = []
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const iso = toISO(d)
      buckets.push({ start: iso, end: iso, count: counts.get(iso) ?? 0 })
    }
    return { unit: 'day', buckets }
  }

  const buckets: TrendBucket[] = []
  // First bucket starts on `from`, then each later one on a Monday.
  let cur = start
  while (cur <= end) {
    const toSunday = (7 - cur.getDay()) % 7 // Sunday closes a Monday-start week
    let last = addDays(cur, toSunday)
    if (last > end) last = end
    let count = 0
    for (let d = cur; d <= last; d = addDays(d, 1)) count += counts.get(toISO(d)) ?? 0
    buckets.push({ start: toISO(cur), end: toISO(last), count })
    cur = addDays(last, 1)
  }
  return { unit: 'week', buckets }
}

/** A clean axis maximum and its ticks (0 included): steps of 1/2/5 x 10^n, at most 4 intervals. */
export function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  const stepInt = Math.max(1, Math.round(step)) // counts are whole numbers
  const top = Math.ceil(max / stepInt) * stepInt
  const ticks: number[] = []
  for (let v = 0; v <= top; v += stepInt) ticks.push(v)
  return ticks
}
