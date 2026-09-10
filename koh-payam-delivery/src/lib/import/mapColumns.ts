import type { RawRow } from './parseMakroFile'

export type ColumnMapping = {
  orderNo: string
  customer: string
  product: string
  qty: string
  unitPrice: string
}
export type ParsedItem = {
  productName: string
  qtyOrdered: number
  unitPrice: number
  lineNo: number
}
export type ParsedOrder = {
  makroOrderNo: string
  customerNameEn: string
  items: ParsedItem[]
  totalValue: number
}

export const DEFAULT_MAPPING: ColumnMapping = {
  orderNo: 'Order No',
  customer: 'Customer',
  product: 'Product',
  qty: 'Qty',
  unitPrice: 'Unit Price',
}

export const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  orderNo: 'เลขที่คำสั่งซื้อ',
  customer: 'ชื่อลูกค้า (อังกฤษ)',
  product: 'ชื่อสินค้า',
  qty: 'จำนวน',
  unitPrice: 'ราคาต่อหน่วย',
}

export function validateMapping(headers: string[], m: ColumnMapping): string[] {
  const set = new Set(headers)
  const problems: string[] = []
  for (const key of Object.keys(m) as (keyof ColumnMapping)[]) {
    if (!m[key]) problems.push(`ยังไม่ได้เลือกคอลัมน์สำหรับ "${FIELD_LABELS[key]}"`)
    else if (!set.has(m[key]))
      problems.push(`ไม่พบคอลัมน์ "${m[key]}" ในไฟล์ (สำหรับ ${FIELD_LABELS[key]})`)
  }
  return problems
}

function num(v: string, ctx: string): number {
  const n = Number(String(v).replace(/,/g, ''))
  if (!Number.isFinite(n)) throw new Error(`ค่าตัวเลขไม่ถูกต้องที่ ${ctx}: "${v}"`)
  return n
}
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function applyMapping(rows: RawRow[], m: ColumnMapping): ParsedOrder[] {
  const byOrder = new Map<string, ParsedOrder>()
  rows.forEach((r, i) => {
    const orderNo = r[m.orderNo]?.trim()
    if (!orderNo) return // ข้ามแถวว่าง
    const customer = r[m.customer]?.trim() ?? ''
    const qty = num(r[m.qty], `ออเดอร์ ${orderNo} แถว ${i + 1} (จำนวน)`)
    const price = num(r[m.unitPrice], `ออเดอร์ ${orderNo} แถว ${i + 1} (ราคา)`)
    let o = byOrder.get(orderNo)
    if (!o) {
      o = { makroOrderNo: orderNo, customerNameEn: customer, items: [], totalValue: 0 }
      byOrder.set(orderNo, o)
    }
    o.items.push({
      productName: r[m.product]?.trim() ?? '',
      qtyOrdered: qty,
      unitPrice: price,
      lineNo: o.items.length + 1,
    })
  })
  const orders = [...byOrder.values()]
  for (const o of orders)
    o.totalValue = round2(o.items.reduce((s, it) => s + it.qtyOrdered * it.unitPrice, 0))
  return orders
}
