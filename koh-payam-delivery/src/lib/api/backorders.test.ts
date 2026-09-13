import {
  syncShortageBackorders,
  linkBackordersToDay,
  listUnmatchedBackorders,
  listBackordersForDay,
  listPendingBackordersForOrder,
  listRelatedBackordersForOrder,
  markBackorderFulfilled,
  createResendBackorder,
} from './backorders'

const logAction = vi.fn().mockResolvedValue(undefined)
vi.mock('./audit', () => ({
  logAction: (...a: unknown[]) => logAction(...a),
}))

const calls: any[] = []
let orderItems: any[] = []
let dayOrders: any[] = []
let pending: any[] = []
let dayList: any[] = []
let orderList: any[] = []
let relatedList: any[] = []
let unmatchedList: any[] = []
let claimRow: any = null
// The row markBackorderFulfilled's claim_id lookup (`select('claim_id').eq('id', id).single()`)
// resolves to -- null means "no claim_id", matching a shortage backorder.
let backorderRow: any = null
let backorderRowError: any = null
// closeClaimIfResendFulfilled now delegates the actual check + write to the
// close_resend_claim_if_fulfilled RPC (0019_claim_closing.sql) -- these control
// what that mocked rpc() call resolves to.
let rpcResult: any = false
let rpcError: any = null
const rpcCalls: any[] = []

vi.mock('../supabase', () => {
  const res = (data: any) => {
    const p: any = Promise.resolve({ data, error: null })
    p.eq = () => p
    return p
  }
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
      rpc: (name: string, args: any) => {
        rpcCalls.push([name, args])
        return Promise.resolve({ data: rpcResult, error: rpcError })
      },
      from: (t: string) => ({
        select: (sel: string) => {
          const isFn = (col: string, val: any) => {
            calls.push(['is', t, sel, col, val])
            const chain: any = Promise.resolve({ data: unmatchedList, error: null })
            chain.order = (ocol: string, opts: any) => {
              calls.push(['order', t, ocol, opts])
              return Promise.resolve({ data: unmatchedList, error: null })
            }
            return chain
          }
          return {
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
              if (t === 'backorders') {
                if (col === 'id')
                  return {
                    single: () =>
                      Promise.resolve({ data: backorderRow, error: backorderRowError }),
                  }
                // listUnmatchedBackorders: .eq('reason','claim_resend').is('target_order_id',null)
                if (col === 'reason') return { is: isFn }
                return res(
                  col === 'target_ship_date'
                    ? dayList
                    : col === 'target_order_id'
                      ? orderList
                      : pending,
                )
              }
              return res([])
            },
            is: isFn,
          }
        },
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
        update: (patch: any) => {
          // Records every chained .eq() call onto one shared entry (so a
          // multi-guard update like claims' `.eq('id',...).eq('status',...)`
          // is captured in full) while staying a plain 5-element entry, as
          // before, for callers that only chain a single .eq().
          const entry: any = ['update', t, patch]
          const step = {
            eq: (col: string, val: any) => {
              entry.push(col, val)
              if (!calls.includes(entry)) calls.push(entry)
              const p: any = Promise.resolve({ error: null })
              p.eq = step.eq
              return p
            },
          }
          return step
        },
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
  unmatchedList = []
  claimRow = null
  backorderRow = null
  backorderRowError = null
  rpcResult = false
  rpcError = null
  rpcCalls.length = 0
  logAction.mockClear()
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

test('linkBackordersToDay matches by phone first, even when an available order has a different name', async () => {
  dayOrders = [
    // Same phone as the backorder's source customer, but a differently
    // spelled name -- proves phone is tried before name.
    { id: 'o-real', customer_name_en: 'BLUEVIEW RESORT', customer_phone: '0812345678' },
    { id: 'o-decoy', customer_name_en: 'BLUE VIEW', customer_phone: '0899999999' },
  ]
  pending = [
    {
      id: 'b1',
      source_order_id: 's1',
      target_ship_date: null,
      orders: { customer_name_en: 'BLUE VIEW', customer_phone: '0812345678' },
    },
  ]
  const n = await linkBackordersToDay('2026-10-01')
  expect(n).toBe(1)
  const update = calls.find((c) => c[0] === 'update')
  expect(update[2].target_order_id).toBe('o-real')
})

test('linkBackordersToDay falls back to name match when the source order has no phone', async () => {
  dayOrders = [{ id: 'o-sun', customer_name_en: 'SUNSET', customer_phone: '0811111111' }]
  pending = [
    {
      id: 'b1',
      source_order_id: 's1',
      target_ship_date: null,
      orders: { customer_name_en: 'SUNSET', customer_phone: '' },
    },
  ]
  const n = await linkBackordersToDay('2026-10-01')
  expect(n).toBe(1)
  const update = calls.find((c) => c[0] === 'update')
  expect(update[2].target_order_id).toBe('o-sun')
})

test('linkBackordersToDay falls back to name match when no same-day order shares the phone', async () => {
  dayOrders = [{ id: 'o-sun', customer_name_en: 'SUNSET', customer_phone: '0822222222' }]
  pending = [
    {
      id: 'b1',
      source_order_id: 's1',
      target_ship_date: null,
      orders: { customer_name_en: 'SUNSET', customer_phone: '0899999999' },
    },
  ]
  const n = await linkBackordersToDay('2026-10-01')
  expect(n).toBe(1)
  const update = calls.find((c) => c[0] === 'update')
  expect(update[2].target_order_id).toBe('o-sun')
})

test('linkBackordersToDay never matches a backorder back to its own source order', async () => {
  // Reproduces a bug confirmed live in production (98 self-linked rows
  // across 4 real orders): re-importing/syncing a ship date after its own
  // pack screen already created a shortage backorder used to match the
  // backorder right back to the order that caused it, since the source
  // order is itself present in that day's order list and trivially shares
  // its own customer's phone/name.
  dayOrders = [
    { id: 's1', customer_name_en: 'SELF LINK CO', customer_phone: '0812345678' },
  ]
  pending = [
    {
      id: 'b1',
      source_order_id: 's1',
      target_ship_date: null,
      orders: { customer_name_en: 'SELF LINK CO', customer_phone: '0812345678' },
    },
  ]
  const n = await linkBackordersToDay('2026-10-01')
  expect(n).toBe(0)
  expect(calls.some((c) => c[0] === 'update')).toBe(false)
})

test('linkBackordersToDay matches a genuinely different same-day order for the same customer, excluding only the source order itself', async () => {
  dayOrders = [
    { id: 's1', customer_name_en: 'SELF LINK CO', customer_phone: '0812345678' }, // the source order itself -- must be excluded
    { id: 'o-new', customer_name_en: 'SELF LINK CO', customer_phone: '0812345678' }, // a real new order, same customer
  ]
  pending = [
    {
      id: 'b1',
      source_order_id: 's1',
      target_ship_date: null,
      orders: { customer_name_en: 'SELF LINK CO', customer_phone: '0812345678' },
    },
  ]
  const n = await linkBackordersToDay('2026-10-01')
  expect(n).toBe(1)
  const update = calls.find((c) => c[0] === 'update')
  expect(update[2].target_order_id).toBe('o-new')
})

test('listUnmatchedBackorders selects only claim_resend, unmatched rows, ordered oldest-first, and flattens customer name (no shortage rows, no reason field)', async () => {
  // Real Supabase would already filter reason='claim_resend' server-side --
  // this fixture represents that filtered result, matching this file's
  // convention elsewhere (dayList/orderList/pending fixtures do the same).
  unmatchedList = [
    {
      id: 'b2',
      product_name: 'fish sauce',
      qty: 1,
      created_at: '2026-09-05T00:00:00.000Z',
      orders: { customer_name_en: 'SUNSET' },
    },
  ]
  const rows = await listUnmatchedBackorders()
  expect(rows).toEqual([
    {
      id: 'b2',
      customerName: 'SUNSET',
      productName: 'fish sauce',
      qty: 1,
      createdAt: '2026-09-05T00:00:00.000Z',
    },
  ])
  const reasonCall = calls.find((c) => c[0] === 'select' && c[1] === 'backorders' && c[3] === 'reason')
  expect(reasonCall[4]).toBe('claim_resend')
  const isCall = calls.find((c) => c[0] === 'is' && c[1] === 'backorders')
  expect(isCall[3]).toBe('target_order_id')
  expect(isCall[4]).toBe(null)
  const orderCall = calls.find((c) => c[0] === 'order' && c[1] === 'backorders')
  expect(orderCall[2]).toBe('created_at')
  expect(orderCall[3]).toEqual({ ascending: true })
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
      claim_id: 'c1',
    },
    {
      source_order_id: 'ord1',
      reason: 'claim_resend',
      product_name: 'fish sauce',
      qty: 1,
      status: 'pending',
      target_ship_date: null,
      claim_id: 'c1',
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

test('markBackorderFulfilled on a backorder with no claim_id: the close_resend_claim_if_fulfilled RPC is never called', async () => {
  backorderRow = { claim_id: null }
  await markBackorderFulfilled('b9')
  expect(calls.some((c) => c[0] === 'update' && c[1] === 'backorders')).toBe(true)
  expect(rpcCalls.length).toBe(0)
  expect(logAction).not.toHaveBeenCalled()
})

// The "are all sibling backorders fulfilled" check itself now lives inside
// the close_resend_claim_if_fulfilled Postgres function (0019_claim_closing.sql)
// -- not-all-fulfilled is simulated here by the rpc simply resolving false,
// exactly as it would for a real not-yet-fulfilled claim.
test('markBackorderFulfilled with a claim_id whose RPC reports not-yet-fulfilled (resolves false): no audit log', async () => {
  backorderRow = { claim_id: 'c1' }
  rpcResult = false
  await markBackorderFulfilled('b9')
  expect(rpcCalls).toEqual([['close_resend_claim_if_fulfilled', { p_claim_id: 'c1' }]])
  expect(logAction).not.toHaveBeenCalled()
})

test('markBackorderFulfilled logs the audit entry once the RPC reports the claim was actually closed (resolves true)', async () => {
  backorderRow = { claim_id: 'c1' }
  rpcResult = true
  await markBackorderFulfilled('b9')
  expect(rpcCalls).toEqual([['close_resend_claim_if_fulfilled', { p_claim_id: 'c1' }]])
  expect(logAction).toHaveBeenCalledWith('claim_auto_closed', 'claim', 'c1', {
    trigger: 'resend_fulfilled',
  })
})

// The RPC resolving false covers both "not actually fulfilled yet" and "this
// call didn't win the race to flip it" (e.g. already closed by another call)
// -- either way, no audit entry should be recorded.
test('markBackorderFulfilled does not log an audit entry when the RPC resolves false (already closed or not fulfilled)', async () => {
  backorderRow = { claim_id: 'c1' }
  rpcResult = false
  await markBackorderFulfilled('b9')
  expect(logAction).not.toHaveBeenCalled()
})

test('markBackorderFulfilled swallows an RPC error in the claim-closing side path without throwing, and the backorder fulfillment write already succeeded', async () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  backorderRow = { claim_id: 'c1' }
  rpcError = { message: 'rpc boom' }
  await expect(markBackorderFulfilled('b9')).resolves.toBeUndefined()
  const backorderUpdate = calls.find((c) => c[0] === 'update' && c[1] === 'backorders')
  expect(backorderUpdate).toBeTruthy()
  expect(logAction).not.toHaveBeenCalled()
  expect(warnSpy).toHaveBeenCalled()
  warnSpy.mockRestore()
})

test('markBackorderFulfilled warns (but does not throw) when the backorder claim_id lookup itself errors', async () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  backorderRow = null
  backorderRowError = { message: 'claim_id lookup boom' }
  await expect(markBackorderFulfilled('b9')).resolves.toBeUndefined()
  expect(rpcCalls.length).toBe(0)
  expect(logAction).not.toHaveBeenCalled()
  expect(warnSpy).toHaveBeenCalledWith('claim_id lookup failed', backorderRowError)
  warnSpy.mockRestore()
})
