// @vitest-environment node
// Uses parseMakroFile on UTF-8 CSV fixtures; SheetJS needs the node environment
// (not jsdom) to decode the Thai column values correctly.
import { readFileSync } from 'node:fs'
import { parseMakroFile, type RawRow } from './parseMakroFile'
import {
  buildImport,
  isPayam,
  parseExpectedDate,
  validateMapping,
  DEFAULT_DETAIL_MAPPING,
  DEFAULT_ORDER_MAPPING,
} from './buildImport'

function ab(path: string): ArrayBuffer {
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

async function fixtures(): Promise<{ detail: RawRow[]; order: RawRow[] }> {
  const detail = await parseMakroFile(ab('src/test/fixtures/order-detail-sample.csv'))
  const order = await parseMakroFile(ab('src/test/fixtures/order-export-sample.csv'))
  return { detail, order }
}

// --- isPayam ---------------------------------------------------------------

test('isPayam: Sub District เกาะพยาม -> true', () => {
  expect(isPayam({ subDistrict: 'เกาะพยาม', shippingAddress: 'anywhere' })).toBe(true)
  expect(isPayam({ subDistrict: '  เกาะพยาม  ', shippingAddress: '' })).toBe(true)
})

test('isPayam: address มี "Tai kak" ทั้งที่ตำบลอื่น -> true', () => {
  expect(isPayam({ subDistrict: 'ปากน้ำ', shippingAddress: '88 Tai kak Khao Niwet' })).toBe(true)
  expect(isPayam({ subDistrict: 'x', shippingAddress: 'บ้านไต๋แขก' })).toBe(true)
})

test('isPayam: ที่อยู่อื่น -> false', () => {
  expect(isPayam({ subDistrict: 'บางริ้น', shippingAddress: '9 ถนนเรืองราษฎร์' })).toBe(false)
})

// Real orders missed on 2026-09-12 import: Makro's own Sub District field is
// filled in inconsistently — English spelling, or even a mainland
// sub-district with the island name only in the free-text address.
test('isPayam: Sub District สะกดอังกฤษ "Ko Phayam" -> true', () => {
  expect(
    isPayam({
      subDistrict: 'Ko Phayam',
      shippingAddress: 'moo1 aow yai  Ko Phayam,Mueang Ranong ,Ranong, 85000,Thailand',
    }),
  ).toBe(true)
  expect(isPayam({ subDistrict: 'Koh Phayam', shippingAddress: '' })).toBe(true)
})

test('isPayam: Sub District เป็นตำบลอื่น (บางนอน) แต่ที่อยู่ขึ้นต้นด้วยเกาะพยาม -> true', () => {
  expect(
    isPayam({
      subDistrict: 'บางนอน',
      shippingAddress: 'เกาะพยาม  บางนอน,เมืองระนอง ,ระนอง, 85000,Thailand',
    }),
  ).toBe(true)
})

test('isPayam: บางนอน ธรรมดา (ไม่มีชื่อเกาะในที่อยู่) ยังคงเป็น false', () => {
  // บางนอน is a real, mostly-mainland Ranong sub-district — must not become a
  // blanket match on its own, or dozens of unrelated mainland orders would
  // be misfiled as Koh Payam deliveries.
  expect(
    isPayam({
      subDistrict: 'บางนอน',
      shippingAddress: '89/165 ม.2  บางนอน,เมืองระนอง ,ระนอง, 85000,Thailand',
    }),
  ).toBe(false)
})

// --- parseExpectedDate ---------------------------------------------------------

test('parseExpectedDate takes the first date and returns ISO', () => {
  expect(parseExpectedDate('11-Sep-2026 - 11-Sep-2026')).toBe('2026-09-11')
  expect(parseExpectedDate('1-Jan-2027 - 3-Jan-2027')).toBe('2027-01-01')
  expect(parseExpectedDate('')).toBeNull()
  expect(parseExpectedDate('not a date')).toBeNull()
})

// --- validateMapping ---------------------------------------------------------

test('validateMapping: missing detail header -> Thai problem', () => {
  const problems = validateMapping(
    'detail',
    ['Order Number', 'Product Name'],
    DEFAULT_DETAIL_MAPPING,
  )
  expect(problems.length).toBeGreaterThan(0)
  expect(problems.some((p) => p.includes('จำนวนส่งจริง'))).toBe(true)
})

test('validateMapping: missing order header -> Thai problem', () => {
  const problems = validateMapping(
    'order',
    ['Order Number', 'Customer Name'],
    DEFAULT_ORDER_MAPPING,
  )
  expect(problems.some((p) => p.includes('ที่อยู่จัดส่ง'))).toBe(true)
})

test('validateMapping: full headers -> no problems', async () => {
  const { detail, order } = await fixtures()
  expect(
    validateMapping('detail', Object.keys(detail[0]), DEFAULT_DETAIL_MAPPING),
  ).toEqual([])
  expect(validateMapping('order', Object.keys(order[0]), DEFAULT_ORDER_MAPPING)).toEqual([])
})

// --- buildImport -----------------------------------------------------------

test('buildImport keeps only payam orders that have line items', async () => {
  const { detail, order } = await fixtures()
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)

  expect(r.orders.map((o) => o.makroOrderNo).sort()).toEqual(['P-001', 'P-002', 'P-003', 'P-006'])
  expect(r.skippedNoItems).toEqual(['P-005']) // payam ใน B แต่ไม่มีรายการใน A
  expect(r.skippedNotPayam).toBe(1) // P-004
  expect(r.cancelledLinesDropped).toBe(1) // P-002 line 100005
  expect(r.shippedAllZero).toBe(false)
})

test('buildImport parses order-level fields and expected date', async () => {
  const { detail, order } = await fixtures()
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const p1 = r.orders.find((o) => o.makroOrderNo === 'P-001')!
  expect(p1.customerName).toBe('PAYAM MINIMART')
  expect(p1.subDistrict).toBe('เกาะพยาม')
  expect(p1.expectedDate).toBe('2026-09-11')
  expect(p1.makroOrderStatus).toBe('Completed')
  const p2 = r.orders.find((o) => o.makroOrderNo === 'P-002')!
  expect(p2.makroOrderStatus).toBe('Partially Shipped')
})

test('buildImport drops cancelled lines and re-numbers the rest', async () => {
  const { detail, order } = await fixtures()
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const p2 = r.orders.find((o) => o.makroOrderNo === 'P-002')!
  expect(p2.items.map((i) => i.productName)).toEqual(['ไข่ไก่ เบอร์ 2', 'มะเขือเทศสด'])
  expect(p2.items.map((i) => i.lineNo)).toEqual([1, 2])
})

test('buildImport: weighed-goods tolerance -- a shortfall under 10% on a non-integer shipped qty is not a shortage', async () => {
  const { detail, order } = await fixtures()
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const p2 = r.orders.find((o) => o.makroOrderNo === 'P-002')!
  const tomato = p2.items.find((i) => i.productName === 'มะเขือเทศสด')!
  // 6 ordered, 5.43 shipped -- shippedQty isn't a whole number (weighed), and
  // the shortfall (0.57 / 6 = 9.5%) is under the 10% tolerance, so this is
  // treated as fully shipped despite the file's own non-zero shortage column.
  expect(tomato.isShort).toBe(false)
  expect(tomato.orderedQty).toBe(6)
  expect(tomato.shippedQty).toBe(5.43)
  expect(tomato.shortageQty).toBe(0)
})

test('buildImport: shipped < ordered on a counted (integer) qty -> isShort with shortageQty from the file column', async () => {
  const { detail, order } = await fixtures()
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const p6 = r.orders.find((o) => o.makroOrderNo === 'P-006')!
  const diapers = p6.items.find((i) => i.productName === 'ผ้าอ้อมเด็ก')!
  // 10 ordered, 7 shipped -- shippedQty IS a whole number (counted, not
  // weighed), so the tolerance never applies: any shortfall still counts,
  // even though 3/10 = 30% is nowhere near a small measurement variance.
  expect(diapers.isShort).toBe(true)
  expect(diapers.orderedQty).toBe(10)
  expect(diapers.shippedQty).toBe(7)
  expect(diapers.shortageQty).toBe(3)
})

test('buildImport: weighed-goods tolerance does not apply once the shortfall reaches 10%', async () => {
  const { detail, order } = await fixtures()
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const p6 = r.orders.find((o) => o.makroOrderNo === 'P-006')!
  const watermelon = p6.items.find((i) => i.productName === 'แตงโมลูก')!
  // 6 ordered, 4.8 shipped -- weighed (non-integer), but the shortfall
  // (1.2 / 6 = 20%) is well past the 10% tolerance, so it still counts as a
  // real shortage -- the tolerance only forgives small variance, not any
  // weighed shortfall regardless of size.
  expect(watermelon.isShort).toBe(true)
  expect(watermelon.shortageQty).toBeCloseTo(1.2, 5)
})

test('buildImport: a weighed shortfall right at the 10% boundary still counts as short (boundary is strict <)', () => {
  const detailRows: RawRow[] = [
    {
      'Order Number': 'P-100',
      'Item Id': '1',
      'Product Name': 'สินค้าชั่ง',
      'Order Quantity': '200',
      'Shipped Quantity': '179.8', // (200 - 179.8) / 200 = 10.1% -- at/just past the 10% line, not < 0.1
      'Shortage Quantity': '',
      'Cancelled Quantity': '0',
    },
  ]
  const orderRows: RawRow[] = [
    {
      'Order Number': 'P-100',
      'Customer Name': 'TEST SHOP',
      'Sub District': 'เกาะพยาม',
      'Shipping Address': 'test address',
    },
  ]
  const r = buildImport(detailRows, orderRows, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const item = r.orders.find((o) => o.makroOrderNo === 'P-100')!.items[0]
  expect(item.isShort).toBe(true)
  expect(item.shortageQty).toBeCloseTo(20.2, 5)
})

test('buildImport: orderedQty of 0 never triggers the weighed tolerance division', () => {
  const detailRows: RawRow[] = [
    {
      'Order Number': 'P-101',
      'Item Id': '1',
      'Product Name': 'สินค้าพิเศษ',
      'Order Quantity': '0',
      'Shipped Quantity': '0',
      'Shortage Quantity': '',
      'Cancelled Quantity': '0',
    },
  ]
  const orderRows: RawRow[] = [
    {
      'Order Number': 'P-101',
      'Customer Name': 'TEST SHOP',
      'Sub District': 'เกาะพยาม',
      'Shipping Address': 'test address',
    },
  ]
  const r = buildImport(detailRows, orderRows, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const item = r.orders.find((o) => o.makroOrderNo === 'P-101')!.items[0]
  expect(item.isShort).toBe(false)
  expect(item.shortageQty).toBe(0)
})

test('buildImport: short line with no shortage column value falls back to ordered - shipped', async () => {
  const { detail, order } = await fixtures()
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const p3 = r.orders.find((o) => o.makroOrderNo === 'P-003')!
  const oil = p3.items.find((i) => i.productName === 'น้ำมันพืช 1L')!
  expect(oil.isShort).toBe(true)
  expect(oil.shortageQty).toBe(3) // 12 - 9, column was 0
})

test('buildImport: shippedQty >= orderedQty is never short', async () => {
  const { detail, order } = await fixtures()
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const p1 = r.orders.find((o) => o.makroOrderNo === 'P-001')!
  expect(p1.items.every((i) => i.isShort === false)).toBe(true)
  expect(p1.items.every((i) => i.shortageQty === 0)).toBe(true)
})

test('buildImport: shippedAllZero true when every shipped qty is 0', () => {
  const detail: RawRow[] = [
    {
      'Order Number': 'Z-1',
      'Item Id': '1',
      'Product Name': 'a',
      'Order Quantity': '5',
      'Shipped Quantity': '0',
      'Shortage Quantity': '0',
      'Cancelled Quantity': '0',
      'Item Remark': '',
    },
    {
      'Order Number': 'Z-1',
      'Item Id': '2',
      'Product Name': 'b',
      'Order Quantity': '2',
      'Shipped Quantity': '0',
      'Shortage Quantity': '0',
      'Cancelled Quantity': '0',
      'Item Remark': '',
    },
  ]
  const order: RawRow[] = [
    {
      'Order Number': 'Z-1',
      'Customer Name': 'ZZ',
      'Sub District': 'เกาะพยาม',
      'Shipping Address': 'x',
      'Original Expected Date': '',
    },
  ]
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  expect(r.shippedAllZero).toBe(true)
  expect(r.orders[0].items.every((i) => i.isShort)).toBe(true)
})

// --- soft-optional payment columns -----------------------------------------

test('validateMapping: order file missing payment columns entirely -> no problems (soft-optional)', async () => {
  const { order } = await fixtures()
  // order-export-sample.csv has no Payment Method / Payment Status / Outstanding
  // Amount columns at all, yet the default mapping still points at them.
  expect(validateMapping('order', Object.keys(order[0]), DEFAULT_ORDER_MAPPING)).toEqual([])
})

test('buildImport: parses payment method/status/outstanding amount when present', () => {
  const detail: RawRow[] = [
    {
      'Order Number': 'PAY-1',
      'Item Id': '1',
      'Product Name': 'a',
      'Order Quantity': '5',
      'Shipped Quantity': '5',
      'Shortage Quantity': '0',
      'Cancelled Quantity': '0',
      'Item Remark': '',
    },
    {
      'Order Number': 'PAY-2',
      'Item Id': '2',
      'Product Name': 'b',
      'Order Quantity': '3',
      'Shipped Quantity': '3',
      'Shortage Quantity': '0',
      'Cancelled Quantity': '0',
      'Item Remark': '',
    },
  ]
  const order: RawRow[] = [
    {
      'Order Number': 'PAY-1',
      'Customer Name': 'Cash On Delivery Co',
      'Sub District': 'เกาะพยาม',
      'Shipping Address': 'x',
      'Original Expected Date': '',
      'Payment Method': 'Pay On Delivery',
      'Payment Status': 'Unpaid',
      'Outstanding Amount': '6172.5',
    },
    {
      'Order Number': 'PAY-2',
      'Customer Name': 'Paid Already Co',
      'Sub District': 'เกาะพยาม',
      'Shipping Address': 'x',
      'Original Expected Date': '',
      'Payment Method': 'QR_CODE',
      'Payment Status': 'Paid',
      'Outstanding Amount': '0',
    },
  ]
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const p1 = r.orders.find((o) => o.makroOrderNo === 'PAY-1')!
  expect(p1.paymentMethod).toBe('Pay On Delivery')
  expect(p1.paymentStatus).toBe('Unpaid')
  expect(p1.outstandingAmount).toBe(6172.5)
  const p2 = r.orders.find((o) => o.makroOrderNo === 'PAY-2')!
  expect(p2.paymentMethod).toBe('QR_CODE')
  expect(p2.paymentStatus).toBe('Paid')
  expect(p2.outstandingAmount).toBe(0)
})

test('buildImport: file missing payment columns -> paymentMethod/paymentStatus null, outstandingAmount 0', async () => {
  const { detail, order } = await fixtures()
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const p1 = r.orders.find((o) => o.makroOrderNo === 'P-001')!
  expect(p1.paymentMethod).toBeNull()
  expect(p1.paymentStatus).toBeNull()
  expect(p1.outstandingAmount).toBe(0)
})

// --- soft-optional customer phone -----------------------------------------

test('validateMapping: order file missing Customer Phone column entirely -> no problems (soft-optional)', () => {
  // simulate a file that lacks the Customer Phone header at all, unlike the
  // real fixture (which already has it) — the default mapping still points
  // at it and must not block import.
  const problems = validateMapping(
    'order',
    ['Order Number', 'Customer Name', 'Sub District', 'Shipping Address', 'Original Expected Date', 'Order Status'],
    DEFAULT_ORDER_MAPPING,
  )
  expect(problems).toEqual([])
})

test('buildImport: real fixture has a Customer Phone column -> parsed onto customerPhone', async () => {
  const { detail, order } = await fixtures()
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const p1 = r.orders.find((o) => o.makroOrderNo === 'P-001')!
  expect(p1.customerPhone).toBe('0800000001')
})

test('buildImport: parses a real-shaped customer phone number', () => {
  const detail: RawRow[] = [
    {
      'Order Number': 'PH-1',
      'Item Id': '1',
      'Product Name': 'a',
      'Order Quantity': '5',
      'Shipped Quantity': '5',
      'Shortage Quantity': '0',
      'Cancelled Quantity': '0',
      'Item Remark': '',
    },
  ]
  const order: RawRow[] = [
    {
      'Order Number': 'PH-1',
      'Customer Name': 'Phone Co',
      'Sub District': 'เกาะพยาม',
      'Shipping Address': 'x',
      'Original Expected Date': '',
      'Customer Phone': '0826289533',
    },
  ]
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const p1 = r.orders.find((o) => o.makroOrderNo === 'PH-1')!
  expect(p1.customerPhone).toBe('0826289533')
})

test('buildImport: order row missing Customer Phone value -> customerPhone null (not empty string)', () => {
  const detail: RawRow[] = [
    {
      'Order Number': 'PH-2',
      'Item Id': '1',
      'Product Name': 'a',
      'Order Quantity': '5',
      'Shipped Quantity': '5',
      'Shortage Quantity': '0',
      'Cancelled Quantity': '0',
      'Item Remark': '',
    },
  ]
  const order: RawRow[] = [
    {
      'Order Number': 'PH-2',
      'Customer Name': 'No Phone Co',
      'Sub District': 'เกาะพยาม',
      'Shipping Address': 'x',
      'Original Expected Date': '',
    },
  ]
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  const p1 = r.orders.find((o) => o.makroOrderNo === 'PH-2')!
  expect(p1.customerPhone).toBeNull()
})

test('buildImport: comma-grouped numbers parse, junk numbers become 0', () => {
  const detail: RawRow[] = [
    {
      'Order Number': 'C-1',
      'Item Id': '1',
      'Product Name': 'bulk',
      'Order Quantity': '1,200',
      'Shipped Quantity': '1,200',
      'Shortage Quantity': '',
      'Cancelled Quantity': 'n/a',
      'Item Remark': '',
    },
  ]
  const order: RawRow[] = [
    {
      'Order Number': 'C-1',
      'Customer Name': 'CC',
      'Sub District': 'เกาะพยาม',
      'Shipping Address': 'x',
      'Original Expected Date': '',
    },
  ]
  const r = buildImport(detail, order, DEFAULT_DETAIL_MAPPING, DEFAULT_ORDER_MAPPING)
  expect(r.orders[0].items[0].orderedQty).toBe(1200)
  expect(r.orders[0].items[0].isShort).toBe(false)
})
