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

// One short order_items row, as PostgREST returns it with the orders embed.
function row(o: {
  name: string
  item?: string | null
  dept?: string | null
  ordered?: number
  shipped?: number
  shortage?: number | null
  order: string
  date?: string
}) {
  return {
    product_name: o.name,
    makro_item_id: o.item ?? null,
    dept: o.dept ?? null,
    qty_ordered: o.ordered ?? 2,
    qty_shipped: o.shipped ?? 1,
    shortage_qty: o.shortage ?? null,
    order_id: o.order,
    status: 'short',
    orders: {
      makro_order_no: `PO-${o.order}`,
      customer_name_en: `C-${o.order}`,
      ship_date: o.date ?? '2026-09-05',
    },
  }
}

test('query shape: selects item code + dept via an inner join, filters status=short and the ship_date range', async () => {
  await getShortageReport('2026-09-01', '2026-09-10')
  const sel = calls.find((c) => c[0] === 'select')
  expect(sel[1]).toBe(
    'product_name, makro_item_id, dept, qty_ordered, qty_shipped, shortage_qty, order_id, orders!inner(makro_order_no, customer_name_en, ship_date)',
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

test('an empty range yields no groups and zero totals', async () => {
  expect(await getShortageReport('2026-09-01', '2026-09-10')).toEqual({
    groups: [],
    productCount: 0,
    occurrenceCount: 0,
    affectedOrderCount: 0,
  })
})

test('qty fallback: shortage_qty when positive, else ordered - shipped clamped at 0', async () => {
  rows = [
    row({ name: 'coconut', item: '100', dept: '1', ordered: 10, shipped: 3, shortage: 5, order: 'o1' }),
    row({ name: 'coconut', item: '100', dept: '1', ordered: 10, shipped: 7, shortage: 0, order: 'o2' }),
  ]
  const r = await getShortageReport('2026-09-01', '2026-09-10')
  expect(r.groups[0].products[0].totalQty).toBe(5 + 3)
})

test('groups by department in the fixed FV..NF order, unknown last, and only non-empty groups', async () => {
  rows = [
    row({ name: 'soap', item: '9', dept: '45', order: 'o1' }), // NF
    row({ name: 'fish', item: '5', dept: '3', order: 'o2' }), // FS
    row({ name: 'old', item: '7', dept: null, order: 'o3' }), // unknown
    row({ name: 'chips', item: '8', dept: '8', order: 'o4' }), // DF1
  ]
  const r = await getShortageReport('2026-09-01', '2026-09-10')
  expect(r.groups.map((g) => g.code)).toEqual(['FS', 'DF1', 'NF', 'UNKNOWN'])
  expect(r.groups.at(-1)!.label).toBe('ไม่ทราบแผนก')
})

test('within a department, products rank by how many orders were short, then by quantity', async () => {
  rows = [
    row({ name: 'water', item: 'W', dept: '9', shortage: 24, order: 'o1' }),
    row({ name: 'sauce', item: 'S', dept: '9', shortage: 1, order: 'o1' }),
    row({ name: 'sauce', item: 'S', dept: '9', shortage: 1, order: 'o2' }),
    row({ name: 'sauce', item: 'S', dept: '9', shortage: 1, order: 'o3' }),
  ]
  const r = await getShortageReport('2026-09-01', '2026-09-10')
  const ps = r.groups[0].products
  expect(ps.map((p) => [p.productName, p.orderCount, p.totalQty])).toEqual([
    ['sauce', 3, 3],
    ['water', 1, 24],
  ])
  expect(r.groups[0].occurrenceCount).toBe(4)
  expect(r).toMatchObject({ productCount: 2, occurrenceCount: 4, affectedOrderCount: 3 })
})

test('products are keyed by item code: same name with different codes stays separate; no code falls back to the name', async () => {
  rows = [
    row({ name: 'milk', item: 'M1', dept: '5', order: 'o1' }),
    row({ name: 'milk', item: 'M2', dept: '5', order: 'o2' }),
    row({ name: 'loose', item: '', dept: '5', order: 'o3' }),
    row({ name: 'loose', item: null, dept: '5', order: 'o4' }),
  ]
  const r = await getShortageReport('2026-09-01', '2026-09-10')
  const ps = r.groups[0].products
  expect(ps).toHaveLength(3)
  expect(ps.find((p) => p.productName === 'loose')!.orderCount).toBe(2)
})

test('an item first seen on an older line without Dept still lands in its real department once a newer line has it', async () => {
  rows = [
    row({ name: 'rice', item: 'R', dept: null, order: 'o1' }),
    row({ name: 'rice', item: 'R', dept: '7', order: 'o2' }),
  ]
  const r = await getShortageReport('2026-09-01', '2026-09-10')
  expect(r.groups.map((g) => g.code)).toEqual(['DF1'])
  expect(r.groups[0].products[0].orderCount).toBe(2)
})

test('an order outside the requested range is excluded', async () => {
  rows = [
    row({ name: 'x', item: 'X', dept: '1', shortage: 5, order: 'in', date: '2026-09-05' }),
    row({ name: 'x', item: 'X', dept: '1', shortage: 9, order: 'out', date: '2026-08-20' }),
  ]
  const r = await getShortageReport('2026-09-01', '2026-09-10')
  const p = r.groups[0].products[0]
  expect(p.totalQty).toBe(5)
  expect(p.details.map((d) => d.orderId)).toEqual(['in'])
})

test('two lines of the same item on one order combine into one detail row; weighed fractions round to 2 decimals', async () => {
  rows = [
    row({ name: 'pork', item: 'P', dept: '2', shortage: 0.1, order: 'o1' }),
    row({ name: 'pork', item: 'P', dept: '2', shortage: 0.2, order: 'o1' }),
  ]
  const r = await getShortageReport('2026-09-01', '2026-09-10')
  const p = r.groups[0].products[0]
  expect(p.orderCount).toBe(1)
  expect(p.details).toHaveLength(1)
  expect(p.details[0].qty).toBe(0.3)
  expect(p.totalQty).toBe(0.3)
})

test('each product lists its orders oldest first', async () => {
  rows = [
    row({ name: 'x', item: 'X', dept: '1', order: 'b', date: '2026-09-07' }),
    row({ name: 'x', item: 'X', dept: '1', order: 'a', date: '2026-09-02' }),
  ]
  const r = await getShortageReport('2026-09-01', '2026-09-10')
  expect(r.groups[0].products[0].details.map((d) => d.orderId)).toEqual(['a', 'b'])
})
