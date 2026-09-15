import { getShortageReport } from './shortageReport'

const calls: any[] = []
let rows: any[] = []
let queryError: any = null

function get(obj: any, path: string) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

// A minimal stand-in for supabase-js's thenable query builder that actually
// *applies* eq/gte/lte the way PostgREST would (including the dot-notation
// filter on the embedded `orders.ship_date` column), rather than just
// recording the calls. This means a test asserting that an out-of-range row
// is excluded genuinely exercises the filtering -- if getShortageReport ever
// stopped calling .gte()/.lte() on 'orders.ship_date', that row would leak
// back into `data` here and the assertion would fail for real.
function makeBuilder() {
  let filtered = rows
  const builder: any = {
    select: (sel: string) => {
      calls.push(['select', sel])
      return builder
    },
    eq: (col: string, val: any) => {
      calls.push(['eq', col, val])
      filtered = filtered.filter((r) => get(r, col) === val)
      return builder
    },
    gte: (col: string, val: any) => {
      calls.push(['gte', col, val])
      filtered = filtered.filter((r) => get(r, col) >= val)
      return builder
    },
    lte: (col: string, val: any) => {
      calls.push(['lte', col, val])
      filtered = filtered.filter((r) => get(r, col) <= val)
      return builder
    },
    then: (resolve: any, reject: any) =>
      Promise.resolve(
        queryError ? { data: null, error: queryError } : { data: filtered, error: null },
      ).then(resolve, reject),
  }
  return builder
}

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.push(['from', table])
      if (table !== 'order_items') throw new Error('unexpected table ' + table)
      return makeBuilder()
    },
  },
}))

beforeEach(() => {
  calls.length = 0
  rows = []
  queryError = null
})

test('query shape: selects the right columns via an inner join, filters status=short, and filters the date range on orders.ship_date', async () => {
  await getShortageReport('2026-09-01', '2026-09-10')
  const sel = calls.find((c) => c[0] === 'select')
  expect(sel[1]).toBe(
    'product_name, qty_ordered, qty_shipped, shortage_qty, order_id, orders!inner(makro_order_no, customer_name_en, ship_date)',
  )
  expect(calls).toContainEqual(['eq', 'status', 'short'])
  expect(calls).toContainEqual(['gte', 'orders.ship_date', '2026-09-01'])
  expect(calls).toContainEqual(['lte', 'orders.ship_date', '2026-09-10'])
})

test('throws the Thai error on a query failure', async () => {
  queryError = { message: 'boom' }
  await expect(getShortageReport('2026-09-01', '2026-09-10')).rejects.toThrow(
    'โหลดรายงานของขาดไม่สำเร็จ: boom',
  )
})

test('returns an empty array when nothing matches', async () => {
  rows = []
  const report = await getShortageReport('2026-09-01', '2026-09-10')
  expect(report).toEqual([])
})

test('qty fallback: uses shortage_qty when positive, else ordered - shipped clamped at 0', async () => {
  rows = [
    {
      product_name: 'มะพร้าว',
      qty_ordered: 10,
      qty_shipped: 3,
      shortage_qty: 5,
      order_id: 'o1',
      status: 'short',
      orders: { makro_order_no: 'PO-1', customer_name_en: 'Alice', ship_date: '2026-09-05' },
    },
    {
      product_name: 'มะพร้าว',
      qty_ordered: 10,
      qty_shipped: 7,
      shortage_qty: 0,
      order_id: 'o2',
      status: 'short',
      orders: { makro_order_no: 'PO-2', customer_name_en: 'Bob', ship_date: '2026-09-02' },
    },
  ]
  const report = await getShortageReport('2026-09-01', '2026-09-10')
  expect(report).toHaveLength(1)
  expect(report[0].totalQty).toBe(5 + 3) // real shortage_qty=5, fallback 10-7=3
})

test('aggregation: groups by product, sums qty, counts distinct orders, sorts products desc by totalQty and each product\'s details asc by shipDate', async () => {
  rows = [
    // order A contributes to two different products
    {
      product_name: 'มะพร้าว',
      qty_ordered: 10,
      qty_shipped: 5,
      shortage_qty: 5,
      order_id: 'o-a',
      status: 'short',
      orders: { makro_order_no: 'PO-A', customer_name_en: 'Alice', ship_date: '2026-09-05' },
    },
    {
      product_name: 'มะม่วง',
      qty_ordered: 4,
      qty_shipped: 2,
      shortage_qty: 2,
      order_id: 'o-a',
      status: 'short',
      orders: { makro_order_no: 'PO-A', customer_name_en: 'Alice', ship_date: '2026-09-05' },
    },
    // มะพร้าว also short on order B, an earlier ship date than order A
    {
      product_name: 'มะพร้าว',
      qty_ordered: 10,
      qty_shipped: 7,
      shortage_qty: 0,
      order_id: 'o-b',
      status: 'short',
      orders: { makro_order_no: 'PO-B', customer_name_en: 'Bob', ship_date: '2026-09-02' },
    },
  ]
  const report = await getShortageReport('2026-09-01', '2026-09-10')
  expect(report).toEqual([
    {
      productName: 'มะพร้าว',
      totalQty: 8, // 5 (order A) + 3 (order B fallback)
      orderCount: 2,
      details: [
        {
          orderId: 'o-b',
          makroOrderNo: 'PO-B',
          customerNameEn: 'Bob',
          shipDate: '2026-09-02',
          qty: 3,
        },
        {
          orderId: 'o-a',
          makroOrderNo: 'PO-A',
          customerNameEn: 'Alice',
          shipDate: '2026-09-05',
          qty: 5,
        },
      ],
    },
    {
      productName: 'มะม่วง',
      totalQty: 2,
      orderCount: 1,
      details: [
        {
          orderId: 'o-a',
          makroOrderNo: 'PO-A',
          customerNameEn: 'Alice',
          shipDate: '2026-09-05',
          qty: 2,
        },
      ],
    },
  ])
})

test('a row whose order falls outside the requested date range is excluded', async () => {
  rows = [
    {
      product_name: 'มะพร้าว',
      qty_ordered: 10,
      qty_shipped: 5,
      shortage_qty: 5,
      order_id: 'o-in',
      status: 'short',
      orders: { makro_order_no: 'PO-IN', customer_name_en: 'Alice', ship_date: '2026-09-05' },
    },
    // Same product, but this order shipped before the requested range.
    {
      product_name: 'มะพร้าว',
      qty_ordered: 20,
      qty_shipped: 0,
      shortage_qty: 20,
      order_id: 'o-out-before',
      status: 'short',
      orders: { makro_order_no: 'PO-OUT-1', customer_name_en: 'Old', ship_date: '2026-08-20' },
    },
    // ...and this one shipped after it.
    {
      product_name: 'มะพร้าว',
      qty_ordered: 20,
      qty_shipped: 0,
      shortage_qty: 20,
      order_id: 'o-out-after',
      status: 'short',
      orders: { makro_order_no: 'PO-OUT-2', customer_name_en: 'Future', ship_date: '2026-09-20' },
    },
  ]
  const report = await getShortageReport('2026-09-01', '2026-09-10')
  expect(report).toHaveLength(1)
  expect(report[0].totalQty).toBe(5)
  expect(report[0].orderCount).toBe(1)
  expect(report[0].details.map((d) => d.orderId)).toEqual(['o-in'])
})

test('two item rows for the same product on the same order are combined into a single detail row, not duplicated', async () => {
  rows = [
    {
      product_name: 'มะพร้าว',
      qty_ordered: 5,
      qty_shipped: 3,
      shortage_qty: 2,
      order_id: 'o1',
      status: 'short',
      orders: { makro_order_no: 'PO-1', customer_name_en: 'Alice', ship_date: '2026-09-05' },
    },
    {
      product_name: 'มะพร้าว',
      qty_ordered: 5,
      qty_shipped: 4,
      shortage_qty: 1,
      order_id: 'o1',
      status: 'short',
      orders: { makro_order_no: 'PO-1', customer_name_en: 'Alice', ship_date: '2026-09-05' },
    },
  ]
  const report = await getShortageReport('2026-09-01', '2026-09-10')
  expect(report).toHaveLength(1)
  expect(report[0].orderCount).toBe(1)
  expect(report[0].totalQty).toBe(3)
  expect(report[0].details).toHaveLength(1)
  expect(report[0].details[0].qty).toBe(3)
})
