import {
  countLockedToday,
  getCustomerLock,
  getDayLocks,
  listCustomerDebts,
  markBillPaid,
  releaseCustomer,
} from './payments'

const logAction = vi.fn().mockResolvedValue(undefined)
vi.mock('./audit', () => ({ logAction: (...a: unknown[]) => logAction(...a) }))
vi.mock('../format', async (orig) => ({
  ...(await orig<typeof import('../format')>()),
  todayLocalISO: () => '2026-10-12',
}))

// Table-backed stand-in for supabase-js: filters are applied, range() slices,
// insert/update are recorded.
const db: Record<string, any[]> = {}
let broken = new Set<string>()
const writes: { op: string; table: string; row: any; id?: any }[] = []
vi.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'mgr' } } }) },
    from: (table: string) => {
      const filters: ((r: any) => boolean)[] = []
      const result = () =>
        broken.has(table)
          ? { data: null, error: { message: 'boom' } }
          : { data: (db[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }
      const b: any = {
        select: () => b,
        eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
        gt: (c: string, v: any) => (filters.push((r) => r[c] > v), b),
        lt: (c: string, v: any) => (filters.push((r) => r[c] < v), b),
        is: (c: string, v: any) => (filters.push((r) => (r[c] ?? null) === v), b),
        ilike: (c: string, pat: string) => {
          const needle = pat.replace(/%/g, '').toLowerCase()
          filters.push((r) => String(r[c] ?? '').toLowerCase().includes(needle))
          return b
        },
        in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(r[c])), b),
        order: () => b,
        range: (lo: number, hi: number) => {
          const r = result()
          return Promise.resolve(r.data ? { ...r, data: r.data.slice(lo, hi + 1) } : r)
        },
        insert: (row: any) => {
          writes.push({ op: 'insert', table, row })
          return Promise.resolve({ error: broken.has(table) ? { message: 'denied' } : null })
        },
        update: (row: any) => ({
          eq: (_c: string, id: any) => {
            writes.push({ op: 'update', table, row, id })
            return Promise.resolve({ error: null })
          },
        }),
        then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
      }
      return b
    },
  },
}))

const bill = (o: Record<string, unknown>) => ({
  id: 'b1',
  makro_order_no: 'PO-OLD',
  customer_name_en: 'JJ Payam',
  customer_phone: '0826289533',
  customer_phone_digits: '0826289533',
  ship_date: '2026-10-08',
  outstanding_amount: 500,
  payment_method: 'Pay On Delivery',
  payment_status: 'Unpaid',
  paid_marked_at: null,
  is_pickup: false,
  makro_order_status: 'Delivered',
  ...o,
})
const JJ = { customer_phone: '0826289533', customer_name_en: 'JJ Payam' }
const KEY = 'phone:0826289533|name:JJ PAYAM'

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k]
  broken = new Set()
  writes.length = 0
  logAction.mockClear()
})

test('getDayLocks: an earlier unpaid bill locks; a same-day bill alone does not', async () => {
  db.orders = [bill({}), bill({ id: 'b2', customer_name_en: 'Sunset', customer_phone: null, customer_phone_digits: '', ship_date: '2026-10-12' })]
  db.payment_releases = []
  const locks = await getDayLocks('2026-10-12', [JJ, { customer_phone: null, customer_name_en: 'Sunset' }])
  expect(locks.get(KEY)).toMatchObject({ locked: true, total: 500, oldestDays: 4 })
  expect(locks.get('name:SUNSET')?.locked).toBe(false)
})

test('getDayLocks: a release for that delivery unlocks the customer', async () => {
  db.orders = [bill({})]
  db.payment_releases = [{ customer_key: KEY, ship_date: '2026-10-12' }]
  const locks = await getDayLocks('2026-10-12', [JJ])
  expect(locks.get(KEY)).toMatchObject({ locked: false, released: true })
})

test('getCustomerLock fails soft to unlocked when the read errors', async () => {
  broken = new Set(['orders'])
  expect(await getCustomerLock(JJ, '2026-10-12')).toMatchObject({ locked: false })
})

test('getCustomerLock finds a bill whose phone is written differently', async () => {
  db.orders = [bill({ customer_phone: '082-628-9533' })]
  db.payment_releases = []
  expect((await getCustomerLock(JJ, '2026-10-12')).locked).toBe(true)
})

test('releaseCustomer needs a reason, then writes the release and an audit entry', async () => {
  await expect(releaseCustomer(JJ, '2026-10-12', '  ')).rejects.toThrow('ใส่เหตุผล')
  expect(writes).toEqual([])
  await releaseCustomer(JJ, '2026-10-12', ' โอนแล้ว ')
  expect(writes).toEqual([
    {
      op: 'insert',
      table: 'payment_releases',
      row: { customer_key: KEY, customer_name: 'JJ Payam', ship_date: '2026-10-12', reason: 'โอนแล้ว' },
    },
  ])
  expect(logAction).toHaveBeenCalledWith('payment_released', 'customer', KEY, {
    name: 'JJ Payam',
    shipDate: '2026-10-12',
    reason: 'โอนแล้ว',
  })
})

test('markBillPaid stamps who and when, and audits it', async () => {
  await markBillPaid('b1')
  expect(writes[0]).toMatchObject({
    op: 'update',
    table: 'orders',
    id: 'b1',
    row: { paid_marked_at: expect.any(String), paid_marked_by: 'mgr' },
  })
  expect(logAction).toHaveBeenCalledWith('payment_marked', 'order', 'b1', undefined)
})

test('listCustomerDebts groups unpaid bills per customer', async () => {
  db.orders = [bill({}), bill({ id: 'b3', ship_date: '2026-10-11', outstanding_amount: 100 }), bill({ id: 'b4', payment_status: 'Paid' })]
  const debts = await listCustomerDebts()
  expect(debts).toHaveLength(1)
  expect(debts[0]).toMatchObject({ name: 'JJ Payam', total: 600, oldestDays: 4, lockedToday: true })
})

test('countLockedToday: locked, unreleased customers with an order today', async () => {
  db.orders = [
    bill({}), // JJ's old bill
    bill({ id: 't1', makro_order_no: 'PO-TODAY', ship_date: '2026-10-12', outstanding_amount: 0 }), // JJ today
    bill({ id: 'x', customer_name_en: 'Owes But No Order', customer_phone: '01', customer_phone_digits: '01' }),
  ]
  db.payment_releases = []
  expect(await countLockedToday('2026-10-12')).toBe(1)
  db.payment_releases = [{ customer_key: KEY, ship_date: '2026-10-12' }]
  expect(await countLockedToday('2026-10-12')).toBe(0)
})
