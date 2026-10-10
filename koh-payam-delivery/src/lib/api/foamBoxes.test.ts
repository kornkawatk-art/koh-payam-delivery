import {
  getCustomerFoamBalance,
  getFoamTrackingStart,
  listFoamCustomers,
  recordFoamReturn,
  setFoamBalance,
} from './foamBoxes'

const logAction = vi.fn().mockResolvedValue(undefined)
vi.mock('./audit', () => ({ logAction: (...a: unknown[]) => logAction(...a) }))

// Table-backed stand-in for supabase-js: filters eq/gte are applied,
// range() slices, maybeSingle() returns the first row, insert() records.
const db: Record<string, any[]> = {}
let missing = new Set<string>()
const inserts: { table: string; row: any }[] = []
vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      const rows = () => db[table] ?? []
      const filters: ((r: any) => boolean)[] = []
      const result = () =>
        missing.has(table)
          ? { data: null, error: { message: 'relation does not exist' } }
          : { data: rows().filter((r) => filters.every((f) => f(r))), error: null }
      const b: any = {
        select: () => b,
        eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
        gte: (c: string, v: any) => (filters.push((r) => r[c] >= v), b),
        order: () => b,
        range: (lo: number, hi: number) => {
          const r = result()
          return Promise.resolve(r.data ? { ...r, data: r.data.slice(lo, hi + 1) } : r)
        },
        maybeSingle: () => {
          const r = result()
          return Promise.resolve(r.data ? { data: r.data[0] ?? null, error: null } : r)
        },
        insert: (row: any) => {
          inserts.push({ table, row })
          return Promise.resolve({ error: missing.has(table) ? { message: 'denied' } : null })
        },
        then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
      }
      return b
    },
  },
}))

const START = '2026-10-10T00:00:00+00:00'
const order = (o: Partial<any>) => ({
  id: 'o',
  makro_order_no: 'PO',
  customer_name_en: 'JJ Payam',
  customer_phone: '0826289533',
  status: 'shipped',
  shipped_at: '2026-10-11T00:00:00+00:00',
  foam_box_count: 2,
  ...o,
})

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k]
  missing = new Set()
  inserts.length = 0
  logAction.mockClear()
  db.app_settings = [{ id: true, foam_tracking_start: START }]
})

test('not enabled yet (tables missing): start is null and the list is null', async () => {
  missing = new Set(['app_settings', 'foam_box_moves'])
  expect(await getFoamTrackingStart()).toBeNull()
  expect(await listFoamCustomers()).toBeNull()
})

test('listFoamCustomers groups by customer key (phone formatting does not split), applies moves, sorts by balance', async () => {
  db.orders = [
    order({ id: '1', makro_order_no: 'PO-1', foam_box_count: 3 }),
    order({ id: '2', makro_order_no: 'PO-2', customer_phone: '082-628-9533', foam_box_count: 2 }),
    order({ id: '3', customer_name_en: 'Sunset', customer_phone: null, foam_box_count: 1 }),
    order({ id: '4', customer_name_en: 'Quiet', customer_phone: '0811111111', foam_box_count: 0 }),
    order({ id: '5', shipped_at: '2026-10-09T00:00:00+00:00', foam_box_count: 9 }), // before start
  ]
  db.foam_box_moves = [
    { customer_key: 'phone:0826289533|name:JJ PAYAM', kind: 'return', qty: 1, note: null, created_at: '2026-10-12T00:00:00+00:00' },
  ]
  const list = (await listFoamCustomers())!
  expect(list.map((c) => [c.name, c.balance])).toEqual([
    ['JJ Payam', 4],
    ['Sunset', 1],
    ['Quiet', 0],
  ])
  expect(list[0].events.map((e) => e.kind)).toEqual(['sent', 'sent', 'return'])
  expect(list[0].lastSentAt).toBe('2026-10-11T00:00:00+00:00')
})

test('getCustomerFoamBalance: one customer; 0 when not enabled', async () => {
  db.orders = [order({ foam_box_count: 3 }), order({ customer_name_en: 'Other Shop', foam_box_count: 5 })]
  db.foam_box_moves = [
    { customer_key: 'phone:0826289533|name:JJ PAYAM', kind: 'set', qty: 6, note: null, created_at: '2026-10-12T00:00:00+00:00' },
  ]
  expect(await getCustomerFoamBalance({ customer_phone: '0826289533', customer_name_en: 'JJ Payam' })).toBe(6)
  missing = new Set(['app_settings'])
  expect(await getCustomerFoamBalance({ customer_phone: '0826289533', customer_name_en: 'JJ Payam' })).toBe(0)
})

test('recordFoamReturn / setFoamBalance insert the move and write an audit log', async () => {
  const c = { key: 'phone:0826289533|name:JJ PAYAM', name: 'JJ Payam' }
  await recordFoamReturn(c, 3, 'ฝากเรือมา')
  await setFoamBalance(c, 5)
  expect(inserts).toEqual([
    { table: 'foam_box_moves', row: { customer_key: c.key, customer_name: 'JJ Payam', kind: 'return', qty: 3, note: 'ฝากเรือมา' } },
    { table: 'foam_box_moves', row: { customer_key: c.key, customer_name: 'JJ Payam', kind: 'set', qty: 5, note: null } },
  ])
  expect(logAction).toHaveBeenCalledWith('foam_return', 'customer', c.key, { name: 'JJ Payam', qty: 3 })
  expect(logAction).toHaveBeenCalledWith('foam_set', 'customer', c.key, { name: 'JJ Payam', qty: 5 })
})

test('a rejected insert (e.g. pier trying to set) throws a Thai error and logs nothing', async () => {
  missing = new Set(['foam_box_moves'])
  await expect(setFoamBalance({ key: 'k', name: 'n' }, 1)).rejects.toThrow('บันทึกลังโฟมไม่สำเร็จ')
  expect(logAction).not.toHaveBeenCalled()
})

test('quantities must be whole and in range before anything is written', async () => {
  await expect(recordFoamReturn({ key: 'k', name: 'n' }, 0)).rejects.toThrow()
  await expect(setFoamBalance({ key: 'k', name: 'n' }, -1)).rejects.toThrow()
  expect(inserts).toEqual([])
})
