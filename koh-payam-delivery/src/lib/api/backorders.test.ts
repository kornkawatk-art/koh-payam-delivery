import {
  syncShortageBackorders,
  linkBackordersToDay,
  listBackordersForDay,
  listPendingBackordersForOrder,
  listRelatedBackordersForOrder,
  markBackorderFulfilled,
  createResendBackorder,
} from './backorders'

const calls: any[] = []
let orderItems: any[] = []
let dayOrders: any[] = []
let pending: any[] = []
let dayList: any[] = []
let orderList: any[] = []
let relatedList: any[] = []
let claimRow: any = null

vi.mock('../supabase', () => {
  const res = (data: any) => {
    const p: any = Promise.resolve({ data, error: null })
    p.eq = () => p
    return p
  }
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
      from: (t: string) => ({
        select: (sel: string) => ({
          or: (arg: string) => {
            calls.push(['or', t, sel, arg])
            return Promise.resolve({ data: relatedList, error: null })
          },
          eq: (col: string, val: any) => {
            calls.push(['select', t, sel, col, val])
            if (t === 'claims')
              return { single: () => Promise.resolve({ data: claimRow, error: null }) }
            if (t === 'order_items') return res(orderItems)
            if (t === 'orders') return res(dayOrders)
            if (t === 'backorders')
              return res(
                col === 'target_ship_date'
                  ? dayList
                  : col === 'target_order_id'
                    ? orderList
                    : pending,
              )
            return res([])
          },
        }),
        delete: () => {
          const entry: any = ['delete', t, {} as Record<string, any>]
          const p: any = Promise.resolve({ error: null })
          p.eq = (col: string, val: any) => {
            entry[2][col] = val
            if (!calls.includes(entry)) calls.push(entry)
            return p
          }
          return p
        },
        insert: (rows: any) => {
          calls.push(['insert', t, rows])
          return Promise.resolve({ error: null })
        },
        update: (patch: any) => ({
          eq: (col: string, val: any) => {
            calls.push(['update', t, patch, col, val])
            return Promise.resolve({ error: null })
          },
        }),
      }),
    },
  }
})

beforeEach(() => {
  calls.length = 0
  orderItems = []
  dayOrders = []
  pending = []
  dayList = []
  orderList = []
  relatedList = []
  claimRow = null
})

test('syncShortageBackorders deletes old shortage rows then inserts one per short item', async () => {
  orderItems = [
    { id: 'i1', product_name: 'rice', qty_ordered: 2, qty_shipped: 0, shortage_qty: 2, status: 'short' },
    { id: 'i2', product_name: 'oil', qty_ordered: 1, qty_shipped: 1, shortage_qty: 0, status: 'ok' },
    { id: 'i3', product_name: 'sugar', qty_ordered: 5, qty_shipped: 3, shortage_qty: 0, status: 'short' },
  ]
  await syncShortageBackorders('ord1')
  const del = calls.find((c) => c[0] === 'delete' && c[1] === 'backorders')
  expect(del).toBeTruthy()
  // delete must stay scoped to this order's still-pending shortage rows —
  // a widened delete would wipe already-fulfilled shortage history.
  expect(del[2]).toEqual({
    source_order_id: 'ord1',
    reason: 'shortage',
    status: 'pending',
  })
  const ins = calls.find((c) => c[0] === 'insert')
  expect(ins[1]).toBe('backorders')
  expect(ins[2]).toHaveLength(2)
  // rice: qty comes straight from the makro shortage_qty column
  expect(ins[2][0]).toMatchObject({
    source_order_id: 'ord1',
    product_name: 'rice',
    qty: 2,
    reason: 'shortage',
    status: 'pending',
    target_ship_date: null,
  })
  // sugar: shortage_qty is 0 -> fall back to ordered - shipped (5 - 3)
  expect(ins[2][1]).toMatchObject({ product_name: 'sugar', qty: 2 })
})

test('syncShortageBackorders backorder qty uses shortage_qty for a partial line', async () => {
  orderItems = [
    { id: 'i1', product_name: 'tomato', qty_ordered: 6, qty_shipped: 5.43, shortage_qty: 0.57, status: 'short' },
  ]
  await syncShortageBackorders('ord1')
  const ins = calls.find((c) => c[0] === 'insert')
  expect(ins[2][0].qty).toBeCloseTo(0.57, 5)
})

test('syncShortageBackorders inserts nothing when no item is short', async () => {
  orderItems = [{ id: 'i1', product_name: 'rice', qty_ordered: 2, status: 'ok' }]
  await syncShortageBackorders('ord1')
  expect(calls.some((c) => c[0] === 'delete')).toBe(true)
  expect(calls.some((c) => c[0] === 'insert')).toBe(false)
})

test('linkBackordersToDay binds only matching customers not already tied to another day', async () => {
  dayOrders = [
    { id: 'o-blue', customer_name_en: 'BLUE VIEW' },
    { id: 'o-sun', customer_name_en: 'SUNSET' },
  ]
  pending = [
    { id: 'b1', source_order_id: 's1', target_ship_date: null, orders: { customer_name_en: 'BLUE VIEW' } },
    { id: 'b2', source_order_id: 's2', target_ship_date: '2026-09-30', orders: { customer_name_en: 'SUNSET' } },
    { id: 'b3', source_order_id: 's3', target_ship_date: null, orders: { customer_name_en: 'NOBODY' } },
    { id: 'b4', source_order_id: 's4', target_ship_date: '2026-10-01', orders: { customer_name_en: 'SUNSET' } },
  ]
  const n = await linkBackordersToDay('2026-10-01')
  expect(n).toBe(2)
  const updates = calls.filter((c) => c[0] === 'update')
  expect(updates.map((u) => u[4]).sort()).toEqual(['b1', 'b4'])
  expect(updates[0][2]).toMatchObject({ target_ship_date: '2026-10-01' })
  expect(updates.find((u) => u[4] === 'b1')[2].target_order_id).toBe('o-blue')
})

test('listBackordersForDay filters by target day and pending status', async () => {
  dayList = [{ id: 'b1', product_name: 'rice', qty: 2, status: 'pending' }]
  const rows = await listBackordersForDay('2026-10-01')
  expect(rows).toEqual(dayList)
  const sel = calls.find((c) => c[0] === 'select' && c[1] === 'backorders')
  expect(sel[3]).toBe('target_ship_date')
  expect(sel[4]).toBe('2026-10-01')
})

test('listPendingBackordersForOrder filters by destination order and pending status', async () => {
  orderList = [{ id: 'b1', product_name: 'rice', qty: 2, status: 'pending' }]
  const rows = await listPendingBackordersForOrder('ord9')
  expect(rows).toEqual(orderList)
  const sel = calls.find((c) => c[0] === 'select' && c[1] === 'backorders')
  expect(sel[3]).toBe('target_order_id')
  expect(sel[4]).toBe('ord9')
})

test('listRelatedBackordersForOrder matches source OR target on the order id', async () => {
  relatedList = [
    { id: 'b1', source_order_id: 'ord-x', target_order_id: null, status: 'pending' },
    { id: 'b2', source_order_id: 's9', target_order_id: 'ord-x', status: 'fulfilled' },
  ]
  const rows = await listRelatedBackordersForOrder('ord-x')
  expect(rows).toEqual(relatedList)
  const orCall = calls.find((c) => c[0] === 'or' && c[1] === 'backorders')
  expect(orCall[3]).toBe('source_order_id.eq.ord-x,target_order_id.eq.ord-x')
})

test('createResendBackorder inserts one backorder row per claim item', async () => {
  claimRow = {
    order_id: 'ord1',
    claim_items: [
      { qty: 2, order_items: { product_name: 'rice' } },
      { qty: 1, order_items: { product_name: 'fish sauce' } },
    ],
  }
  await createResendBackorder('c1')
  const ins = calls.find((c) => c[0] === 'insert')
  expect(ins[1]).toBe('backorders')
  expect(ins[2]).toEqual([
    {
      source_order_id: 'ord1',
      reason: 'claim_resend',
      product_name: 'rice',
      qty: 2,
      status: 'pending',
      target_ship_date: null,
    },
    {
      source_order_id: 'ord1',
      reason: 'claim_resend',
      product_name: 'fish sauce',
      qty: 1,
      status: 'pending',
      target_ship_date: null,
    },
  ])
})

test('createResendBackorder throws and inserts nothing when the claim has zero items (box_lost)', async () => {
  claimRow = { order_id: 'ord1', claim_items: [] }
  await expect(createResendBackorder('c1')).rejects.toThrow(
    'เคลมนี้ไม่มีรายการสินค้า จึงสร้างรายการส่งชดเชยไม่ได้',
  )
  expect(calls.some((c) => c[0] === 'insert')).toBe(false)
})

test('markBackorderFulfilled sets fulfilled status with actor and timestamp', async () => {
  await markBackorderFulfilled('b9')
  const u = calls.find((c) => c[0] === 'update')
  expect(u[1]).toBe('backorders')
  expect(u[2]).toMatchObject({ status: 'fulfilled', fulfilled_by: 'u1' })
  expect(typeof u[2].fulfilled_at).toBe('string')
  expect(u[3]).toBe('id')
  expect(u[4]).toBe('b9')
})
