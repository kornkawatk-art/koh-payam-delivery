// Rough unit prices for the shortage report's "มูลค่าที่ขาด" (migration 0043). Makro's files carry no
// price per item, so a lead uploads a sheet of item code + price; the value is quantity short x that
// price -- today's price from the sheet, not what the customer paid that day.
import type { ShortageDeptGroup, ShortageProductRow, ShortageReport } from './api/shortageReport'

export type PriceRow = { itemId: string; price: number; productName: string | null }
export type ParsedPrices = { rows: PriceRow[]; skipped: number }

const ITEM_HEADER = /item\s*(id|code|no)|article|sku|รหัส/i
const PRICE_HEADER = /ราคา|price|unit\s*cost/i
const NAME_HEADER = /^สินค้า$|ชื่อ|product|description|item\s*name/i

const norm = (v: unknown) => String(v ?? '').trim()
/** "1,250.50", "฿99", 99 -> number; anything else -> NaN */
const toPrice = (v: unknown) =>
  typeof v === 'number' ? v : Number(norm(v).replace(/[฿,\s]|บาท/g, '') || NaN)
/** Excel turns codes like 100516 into numbers (sometimes 100516.0) */
const toItemId = (v: unknown) => (typeof v === 'number' ? String(Math.trunc(v)) : norm(v))

/**
 * The price rows of a sheet given as arrays of cells. The header row is found in the first 10 rows:
 * a column for the item code and one for the price (an item-name column is optional). The report's
 * own Excel export works as the template -- its summary sheet has รหัสสินค้า and a ราคาต่อหน่วย column.
 * Rows without a code or a valid price are skipped (counted); a code listed twice keeps the last price.
 */
export function parsePriceSheet(cells: unknown[][]): ParsedPrices {
  let head = -1
  let itemCol = -1
  let priceCol = -1
  let nameCol = -1
  for (let r = 0; r < Math.min(10, cells.length) && head < 0; r++) {
    const row = (cells[r] ?? []).map(norm)
    const i = row.findIndex((h) => ITEM_HEADER.test(h))
    const p = row.findIndex((h, k) => k !== i && PRICE_HEADER.test(h))
    if (i >= 0 && p >= 0) {
      head = r
      itemCol = i
      priceCol = p
      nameCol = row.findIndex((h, k) => k !== i && k !== p && NAME_HEADER.test(h))
    }
  }
  if (head < 0) throw new Error('ไม่เจอหัวคอลัมน์ "รหัสสินค้า" และ "ราคา" ในไฟล์ (ดูใน 10 แถวแรก)')

  const byId = new Map<string, PriceRow>()
  let skipped = 0
  for (const row of cells.slice(head + 1)) {
    if (!row || row.every((c) => norm(c) === '')) continue
    const itemId = toItemId(row[itemCol])
    const price = toPrice(row[priceCol])
    if (!itemId || !Number.isFinite(price) || price < 0) {
      skipped++
      continue
    }
    const name = nameCol >= 0 ? norm(row[nameCol]) : ''
    byId.set(itemId, { itemId, price: Math.round(price * 100) / 100, productName: name || null })
  }
  return { rows: [...byId.values()], skipped }
}

export type PricedProduct = ShortageProductRow & { unitPrice: number | null; value: number | null }
export type PricedGroup = Omit<ShortageDeptGroup, 'products'> & { products: PricedProduct[]; value: number }
export type PricedReport = Omit<ShortageReport, 'groups'> & {
  groups: PricedGroup[]
  /** sum over the products that have a price */
  value: number
  pricedProducts: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** The report with each product's rough value (quantity short x price); products without a price stay null */
export function withValues(report: ShortageReport, prices: Map<string, number>): PricedReport {
  let value = 0
  let pricedProducts = 0
  const groups = report.groups.map((g) => {
    let gv = 0
    const products = g.products.map((p) => {
      const unitPrice = p.itemId ? (prices.get(p.itemId) ?? null) : null
      const v = unitPrice == null ? null : round2(p.totalQty * unitPrice)
      if (v != null) {
        gv += v
        pricedProducts++
      }
      return { ...p, unitPrice, value: v }
    })
    value += gv
    return { ...g, products, value: round2(gv) }
  })
  return { ...report, groups, value: round2(value), pricedProducts }
}

/** "฿12,345" -- whole baht; the prices are rough anyway */
export const formatBaht = (n: number) => '฿' + Math.round(n).toLocaleString('en-US')
