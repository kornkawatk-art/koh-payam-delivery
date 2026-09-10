import type { RawRow } from './parseMakroFile'

// --- Mapping shapes -------------------------------------------------------------

export type DetailMapping = {
  orderNo: string
  product: string
  orderedQty: string
  shippedQty: string
  shortageQty: string
  cancelledQty: string
  itemRemark: string
  itemId: string
}

export type OrderMapping = {
  orderNo: string
  customer: string
  subDistrict: string
  shippingAddress: string
  expectedDate: string
}

export const DEFAULT_DETAIL_MAPPING: DetailMapping = {
  orderNo: 'Order Number',
  product: 'Product Name',
  orderedQty: 'Order Quantity',
  shippedQty: 'Shipped Quantity',
  shortageQty: 'Shortage Quantity',
  cancelledQty: 'Cancelled Quantity',
  itemRemark: 'Item Remark',
  itemId: 'Item Id',
}

export const DEFAULT_ORDER_MAPPING: OrderMapping = {
  orderNo: 'Order Number',
  customer: 'Customer Name',
  subDistrict: 'Sub District',
  shippingAddress: 'Shipping Address',
  expectedDate: 'Original Expected Date',
}

const DETAIL_LABELS: Record<keyof DetailMapping, string> = {
  orderNo: 'เลขที่ออเดอร์',
  product: 'ชื่อสินค้า',
  orderedQty: 'จำนวนสั่ง',
  shippedQty: 'จำนวนส่งจริง',
  shortageQty: 'จำนวนที่ขาด',
  cancelledQty: 'จำนวนที่ยกเลิก',
  itemRemark: 'หมายเหตุรายการ',
  itemId: 'รหัสสินค้า',
}

const ORDER_LABELS: Record<keyof OrderMapping, string> = {
  orderNo: 'เลขที่ออเดอร์',
  customer: 'ชื่อลูกค้า',
  subDistrict: 'ตำบล',
  shippingAddress: 'ที่อยู่จัดส่ง',
  expectedDate: 'วันที่คาดว่าจะได้รับ',
}

// คอลัมน์ที่ต้องมีเสมอ (ที่เหลือมี fallback ในโค้ด จึงไม่บังคับ)
const DETAIL_REQUIRED: (keyof DetailMapping)[] = [
  'orderNo',
  'product',
  'orderedQty',
  'shippedQty',
  'cancelledQty',
]
const ORDER_REQUIRED: (keyof OrderMapping)[] = [
  'orderNo',
  'customer',
  'subDistrict',
  'shippingAddress',
]

// --- Parsed shapes ------------------------------------------------------------

export type ParsedItem = {
  productName: string
  orderedQty: number
  shippedQty: number
  shortageQty: number
  itemId: string
  itemRemark: string
  lineNo: number
  isShort: boolean
}

export type ParsedOrder = {
  makroOrderNo: string
  customerName: string
  subDistrict: string
  shippingAddress: string
  expectedDate: string | null
  items: ParsedItem[]
}

export type BuildResult = {
  orders: ParsedOrder[] // เฉพาะพยาม + มีรายการ
  skippedNoItems: string[] // พยามใน B แต่ไม่มีใน A
  skippedNotPayam: number // นับ order ที่ไม่ใช่พยาม
  cancelledLinesDropped: number
  shippedAllZero: boolean // true ถ้าทุกบรรทัด shippedQty==0 -> UI เตือน
}

// --- Helpers ----------------------------------------------------------------

function toNum(v: string | undefined): number {
  const n = Number(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
}

/** "11-Sep-2026 - 11-Sep-2026" -> "2026-09-11" ; parse ไม่ได้ -> null */
export function parseExpectedDate(raw: string): string | null {
  const first = String(raw ?? '').split(' - ')[0]?.trim() ?? ''
  const m = /^(\d{1,2})-([A-Za-z]{3,})-(\d{4})$/.exec(first)
  if (!m) return null
  const mm = MONTHS[m[2].slice(0, 3).toLowerCase()]
  if (!mm) return null
  return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`
}

/** เกาะพยาม: Sub District = "เกาะพยาม" หรือ ที่อยู่มี ไต๋แขก / tai kak / taikak */
export function isPayam(o: { subDistrict: string; shippingAddress: string }): boolean {
  return (
    (o.subDistrict ?? '').trim() === 'เกาะพยาม' ||
    /ไต๋แขก|tai\s*kak|taikak/i.test(o.shippingAddress ?? '')
  )
}

export function validateMapping(
  kind: 'detail' | 'order',
  headers: string[],
  mapping: DetailMapping | OrderMapping,
): string[] {
  const set = new Set(headers.map((h) => String(h).trim()))
  const labels: Record<string, string> = kind === 'detail' ? DETAIL_LABELS : ORDER_LABELS
  const required: string[] =
    kind === 'detail' ? (DETAIL_REQUIRED as string[]) : (ORDER_REQUIRED as string[])
  const m = mapping as Record<string, string>
  const problems: string[] = []
  for (const key of Object.keys(labels)) {
    const col = (m[key] ?? '').trim()
    if (!col) {
      if (required.includes(key)) problems.push(`ยังไม่ได้เลือกคอลัมน์สำหรับ "${labels[key]}"`)
      continue
    }
    if (!set.has(col)) problems.push(`ไม่พบคอลัมน์ "${col}" ในไฟล์ (สำหรับ ${labels[key]})`)
  }
  return problems
}

// --- Build ----------------------------------------------------------------

export function buildImport(
  detailRows: RawRow[],
  orderRows: RawRow[],
  dm: DetailMapping,
  om: OrderMapping,
): BuildResult {
  // 1. index order rows by orderNo, keep only พยาม
  const payamOrders = new Map<string, ParsedOrder>()
  let skippedNotPayam = 0
  for (const r of orderRows) {
    const orderNo = (r[om.orderNo] ?? '').trim()
    if (!orderNo) continue
    const subDistrict = (r[om.subDistrict] ?? '').trim()
    const shippingAddress = (r[om.shippingAddress] ?? '').trim()
    if (!isPayam({ subDistrict, shippingAddress })) {
      skippedNotPayam++
      continue
    }
    payamOrders.set(orderNo, {
      makroOrderNo: orderNo,
      customerName: (r[om.customer] ?? '').trim(),
      subDistrict,
      shippingAddress,
      expectedDate: parseExpectedDate(om.expectedDate ? (r[om.expectedDate] ?? '') : ''),
      items: [],
    })
  }

  // 2. group detail rows by orderNo
  const itemsByOrder = new Map<string, ParsedItem[]>()
  let cancelledLinesDropped = 0
  for (const r of detailRows) {
    const orderNo = (r[dm.orderNo] ?? '').trim()
    if (!orderNo) continue
    const orderedQty = toNum(r[dm.orderedQty])
    const shippedQty = toNum(r[dm.shippedQty])
    const cancelledQty = toNum(r[dm.cancelledQty])
    if (cancelledQty > 0 && shippedQty === 0) {
      cancelledLinesDropped++
      continue
    }
    const isShort = shippedQty < orderedQty
    let shortageQty = dm.shortageQty ? toNum(r[dm.shortageQty]) : 0
    if (shortageQty <= 0 && isShort) shortageQty = Math.max(0, orderedQty - shippedQty)
    const list = itemsByOrder.get(orderNo) ?? []
    list.push({
      productName: (r[dm.product] ?? '').trim(),
      orderedQty,
      shippedQty,
      shortageQty,
      itemId: dm.itemId ? (r[dm.itemId] ?? '').trim() : '',
      itemRemark: dm.itemRemark ? (r[dm.itemRemark] ?? '').trim() : '',
      lineNo: list.length + 1,
      isShort,
    })
    itemsByOrder.set(orderNo, list)
  }

  // 3. join B -> A: attach items to each พยาม order
  const orders: ParsedOrder[] = []
  const skippedNoItems: string[] = []
  for (const [orderNo, order] of payamOrders) {
    const items = itemsByOrder.get(orderNo) ?? []
    if (items.length === 0) {
      skippedNoItems.push(orderNo)
      continue
    }
    order.items = items
    orders.push(order)
  }

  // 4. shippedAllZero -> ทุกบรรทัดของทุกออเดอร์ ส่งจริง = 0
  const shippedAllZero =
    orders.length > 0 && orders.every((o) => o.items.every((i) => i.shippedQty === 0))

  return { orders, skippedNoItems, skippedNotPayam, cancelledLinesDropped, shippedAllZero }
}
