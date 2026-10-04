import type { RawRow } from './parseMakroFile'
import type { Island } from '../islands'

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
  dept: string
}

export type OrderMapping = {
  orderNo: string
  customer: string
  subDistrict: string
  shippingAddress: string
  expectedDate: string
  orderStatus: string
  paymentMethod: string
  paymentStatus: string
  outstandingAmount: string
  customerPhone: string
  orderType: string
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
  dept: 'Dept',
}

export const DEFAULT_ORDER_MAPPING: OrderMapping = {
  orderNo: 'Order Number',
  customer: 'Customer Name',
  subDistrict: 'Sub District',
  shippingAddress: 'Shipping Address',
  expectedDate: 'Original Expected Date',
  orderStatus: 'Order Status',
  paymentMethod: 'Payment Method',
  paymentStatus: 'Payment Status',
  outstandingAmount: 'Outstanding Amount',
  customerPhone: 'Customer Phone',
  orderType: 'Order Type',
}

export const FIELD_LABELS_DETAIL: Record<keyof DetailMapping, string> = {
  orderNo: 'เลขที่ออเดอร์',
  product: 'ชื่อสินค้า',
  orderedQty: 'จำนวนสั่ง',
  shippedQty: 'จำนวนส่งจริง',
  shortageQty: 'จำนวนที่ขาด',
  cancelledQty: 'จำนวนที่ยกเลิก',
  itemRemark: 'หมายเหตุรายการ',
  itemId: 'รหัสสินค้า',
  dept: 'แผนก (Dept)',
}

export const FIELD_LABELS_ORDER: Record<keyof OrderMapping, string> = {
  orderNo: 'เลขที่ออเดอร์',
  customer: 'ชื่อลูกค้า',
  subDistrict: 'ตำบล',
  shippingAddress: 'ที่อยู่จัดส่ง',
  expectedDate: 'วันที่คาดว่าจะได้รับ',
  orderStatus: 'สถานะแม็คโคร',
  paymentMethod: 'วิธีชำระเงิน',
  paymentStatus: 'สถานะการชำระเงิน',
  outstandingAmount: 'ยอดค้างชำระ',
  customerPhone: 'เบอร์โทรลูกค้า',
  orderType: 'ประเภทออเดอร์ (ส่ง/รับเอง)',
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
// คอลัมน์ "soft-optional": มีในไฟล์จริง (Makro OrderExport) แต่ไม่บังคับต้องมี —
// ห้ามบล็อกการนำเข้าไม่ว่าจะเว้นว่างหรือแมปไปยังคอลัมน์ที่ไม่พบในไฟล์
const ORDER_SOFT: (keyof OrderMapping)[] = [
  'paymentMethod',
  'paymentStatus',
  'outstandingAmount',
  'customerPhone',
  'orderType',
]
// Dept exists in the real Makro OrderDetailExport but must never block import
// if a future/older file variant lacks it -- an unclassified line just
// defaults to dry (see the isFresh computation below), it never blocks.
const DETAIL_SOFT: (keyof DetailMapping)[] = ['dept']

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
  isFresh: boolean
  // Raw Makro "Dept" number as text ('' when the file has none); grouped
  // into department owners by src/lib/departments.ts for the shortage report.
  dept: string
}

export type ParsedOrder = {
  makroOrderNo: string
  customerName: string
  subDistrict: string
  shippingAddress: string
  expectedDate: string | null
  makroOrderStatus: string | null
  paymentMethod: string | null
  paymentStatus: string | null
  outstandingAmount: number
  customerPhone: string | null
  // null = the address only names the shared Paknam pier; a manager picks.
  island: Island | null
  // Makro Order Type "Pick up at store": the customer collects at the branch.
  isPickup: boolean
  items: ParsedItem[]
}

export type BuildResult = {
  orders: ParsedOrder[] // เฉพาะออเดอร์เกาะ + มีรายการ
  skippedNoItems: string[] // ออเดอร์เกาะใน B แต่ไม่มีใน A
  skippedNotDirect: string[] // เลข PO ลงท้าย B = ไม่ได้ส่งจากแม็คโครโดยตรง
  skippedNotIsland: number // นับ order ที่ไม่ใช่ส่งเกาะ
  cancelledLinesDropped: number
  shippedAllZero: boolean // true ถ้าทุกบรรทัด shippedQty==0 -> UI เตือน
}

// --- Helpers ----------------------------------------------------------------

/**
 * A Makro order number ending in "B" is not a delivery Makro makes directly
 * (confirmed by the team), so it never becomes an order here. Other suffixes
 * (A, C, ...) are ordinary orders.
 */
export const isNotMakroDirect = (orderNo: string) => /b$/i.test(orderNo.trim())

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

// Sub District is inconsistently filled in by Makro's own staff — seen so far:
// "เกาะพยาม" (Thai), "Ko Phayam" / "Koh Phayam" (English, any spacing/case).
// Some orders are even filed under a mainland sub-district ("บางนอน" — a real,
// mostly-mainland Ranong sub-district covering dozens of unrelated addresses)
// with "เกาะพยาม" only appearing as free text at the start of the shipping
// address. So the address check must also recognise the island's own name,
// not just the Taikak-pier landmark it originally covered.
const PAYAM_NAME = /เกาะพยาม|ko\s*h?\s*phayam/i

/** เกาะพยาม: Sub District = เกาะพยาม/Ko(h) Phayam, หรือที่อยู่มีชื่อเกาะ/ไต๋แขก/tai kak/taikak */
export function isPayam(o: { subDistrict: string; shippingAddress: string }): boolean {
  return (
    PAYAM_NAME.test((o.subDistrict ?? '').trim()) ||
    /ไต๋แขก|tai\s*kak|taikak/i.test(o.shippingAddress ?? '') ||
    PAYAM_NAME.test(o.shippingAddress ?? '')
  )
}

// Koh Chang (Ranong) sits in ตำบลปากน้ำ alongside plenty of mainland
// addresses, so -- like Payam's บางนอน case -- only the island's name in the
// address is trusted, never the sub-district.
const CHANG_NAME = /เกาะช้าง|ko\s*h?\s*chang/i
// Boats to BOTH islands leave from the Paknam municipal pier, so an address
// that names only the pier can't say which island (and might even be a
// mainland customer near it): import it untagged for a manager to decide.
const PAKNAM_PIER = /ท่าเรือ\s*เทศบาล\s*(?:ตำบล\s*)?ปากน้ำ/

/**
 * Which island an order goes to: an island, 'unknown' (pier only -- import
 * it, a manager picks), or null (not an island order -- skip). Payam is
 * checked first, so an address naming Payam always wins.
 */
export function classifyIsland(o: {
  subDistrict: string
  shippingAddress: string
}): Island | 'unknown' | null {
  if (isPayam(o)) return 'payam'
  const text = `${o.subDistrict ?? ''} ${o.shippingAddress ?? ''}`
  if (CHANG_NAME.test(text)) return 'chang'
  if (PAKNAM_PIER.test(text)) return 'unknown'
  return null
}

export function validateMapping(
  kind: 'detail' | 'order',
  headers: string[],
  mapping: DetailMapping | OrderMapping,
): string[] {
  const set = new Set(headers.map((h) => String(h).trim()))
  const labels: Record<string, string> = kind === 'detail' ? FIELD_LABELS_DETAIL : FIELD_LABELS_ORDER
  const required: string[] =
    kind === 'detail' ? (DETAIL_REQUIRED as string[]) : (ORDER_REQUIRED as string[])
  const m = mapping as Record<string, string>
  const problems: string[] = []
  for (const key of Object.keys(labels)) {
    if (kind === 'order' && (ORDER_SOFT as string[]).includes(key)) continue
    if (kind === 'detail' && (DETAIL_SOFT as string[]).includes(key)) continue
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
  // 1. index order rows by orderNo, keep only island orders
  const payamOrders = new Map<string, ParsedOrder>()
  let skippedNotIsland = 0
  for (const r of orderRows) {
    const orderNo = (r[om.orderNo] ?? '').trim()
    if (!orderNo) continue
    const subDistrict = (r[om.subDistrict] ?? '').trim()
    const shippingAddress = (r[om.shippingAddress] ?? '').trim()
    const island = classifyIsland({ subDistrict, shippingAddress })
    if (!island) {
      skippedNotIsland++
      continue
    }
    const makroOrderStatus = om.orderStatus ? (r[om.orderStatus] ?? '').trim() : ''
    const paymentMethod = om.paymentMethod ? (r[om.paymentMethod] ?? '').trim() : ''
    const paymentStatus = om.paymentStatus ? (r[om.paymentStatus] ?? '').trim() : ''
    const customerPhone = om.customerPhone ? (r[om.customerPhone] ?? '').trim() : ''
    const orderType = om.orderType ? (r[om.orderType] ?? '').trim() : ''
    payamOrders.set(orderNo, {
      makroOrderNo: orderNo,
      customerName: (r[om.customer] ?? '').trim(),
      subDistrict,
      shippingAddress,
      expectedDate: parseExpectedDate(om.expectedDate ? (r[om.expectedDate] ?? '') : ''),
      makroOrderStatus: makroOrderStatus || null,
      paymentMethod: paymentMethod || null,
      paymentStatus: paymentStatus || null,
      outstandingAmount: om.outstandingAmount ? toNum(r[om.outstandingAmount]) : 0,
      customerPhone: customerPhone || null,
      island: island === 'unknown' ? null : island,
      isPickup: /pick\s*-?\s*up/i.test(orderType),
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
    const rawShort = shippedQty < orderedQty
    // Weighed-goods tolerance: Makro's export carries no unit/UOM column, so
    // the only reliable signal that a line is sold by weight (as opposed to
    // counted pieces) is that its actual shipped quantity isn't a whole
    // number (e.g. 9.2 kg vs 9 ชิ้น) -- confirmed against the real file
    // format, not guessed. A weighed line's shortfall under 10% of what was
    // ordered is normal scale/measurement variance, not a real shortage; a
    // counted line (always a whole number) gets no such tolerance -- any
    // shortfall there still counts, however small.
    const isWeighed = !Number.isInteger(shippedQty)
    const shortfallPct = orderedQty > 0 ? (orderedQty - shippedQty) / orderedQty : 0
    const withinWeighedTolerance = isWeighed && shortfallPct < 0.1
    const isShort = rawShort && !withinWeighedTolerance
    // A line that is not short carries no shortage, regardless of the file column.
    let shortageQty = 0
    if (isShort) {
      shortageQty = dm.shortageQty ? toNum(r[dm.shortageQty]) : 0
      if (shortageQty <= 0) shortageQty = Math.max(0, orderedQty - shippedQty)
    }
    // Fresh/dry: Makro's OrderDetailExport carries a "Dept" column (not
    // previously mapped) that reliably says which department a line came
    // from -- verified against a real export file: Dept 1-5 are fruit,
    // meat, seafood, bakery, and dairy/frozen/noodles (all fresh); Dept 6+
    // (snacks, dry grocery, drinks, household, pet food, appliances, ...)
    // are dry. A blank or unparseable Dept (e.g. an appliance line with no
    // department at all) defaults to dry, not "unknown" -- this is purely
    // a display grouping, so a safe default beats a third UI state.
    const deptRaw = dm.dept ? (r[dm.dept] ?? '').trim() : ''
    const deptNum = deptRaw ? Number(deptRaw) : NaN
    const isFresh = Number.isInteger(deptNum) && deptNum >= 1 && deptNum <= 5
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
      isFresh,
      dept: deptRaw,
    })
    itemsByOrder.set(orderNo, list)
  }

  // 3. join B -> A: attach items to each พยาม order
  const orders: ParsedOrder[] = []
  const skippedNoItems: string[] = []
  const skippedNotDirect: string[] = []
  for (const [orderNo, order] of payamOrders) {
    if (isNotMakroDirect(orderNo)) {
      skippedNotDirect.push(orderNo)
      continue
    }
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

  return {
    orders,
    skippedNoItems,
    skippedNotDirect,
    skippedNotIsland,
    cancelledLinesDropped,
    shippedAllZero,
  }
}
