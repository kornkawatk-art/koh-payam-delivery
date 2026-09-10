import { commitImport, regenTokenLink, updateOrderStatus } from './orders'

const state = {
  existing: [] as any[],
  inserted: [] as any[],
  deleted: [] as any[],
  updated: [] as any[],
  current: { status: 'imported' } as any,
}

vi.mock('../supabase', () => {
  const builder = (table: string) => {
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => Promise.resolve({ data: state.existing, error: null }),
      single: () => Promise.resolve({ data: state.current, error: null }),
      insert: (rows: any) => {
        state.inserted.push({ table, rows })
        return {
          select: () => ({
            single: () =>
              Promise.resolve({ data: { id: 'new-' + state.inserted.length }, error: null }),
          }),
        }
      },
      update: (patch: any) => {
        state.updated.push({ table, patch })
        return { eq: () => Promise.resolve({ error: null }) }
      },
      delete: () => ({
        in: (_col: string, vals: any[]) => {
          state.deleted.push({ table, vals })
          return Promise.resolve({ error: null })
        },
      }),
    }
    return b
  }
  return { supabase: { from: (t: string) => builder(t) } }
})

vi.mock('./shipDays', () => ({
  getOrCreateShipDay: vi.fn().mockResolvedValue({ id: 'sd1', boats: [] }),
}))

vi.mock('./backorders', () => ({
  linkBackordersToDay: vi.fn().mockResolvedValue(0),
  syncShortageBackorders: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./audit', () => ({ logAction: vi.fn() }))

const orders = [
  {
    makroOrderNo: 'PO-1',
    customerNameEn: 'A',
    totalValue: 100,
    items: [{ productName: 'x', qtyOrdered: 1, unitPrice: 100, lineNo: 1 }],
  },
]

beforeEach(() => {
  state.existing = []
  state.inserted = []
  state.deleted = []
  state.updated = []
  state.current = { status: 'imported' }
})

test('fresh import creates orders + items', async () => {
  const r = await commitImport('2026-10-01', orders as any)
  expect(r).toEqual({ created: 1, overwrites: [] })
  expect(state.inserted.some((i) => i.table === 'orders')).toBe(true)
  expect(state.inserted.some((i) => i.table === 'order_items')).toBe(true)
})

test('duplicate without force does not write', async () => {
  state.existing = [{ id: 'old1', makro_order_no: 'PO-1' }]
  const r = await commitImport('2026-10-01', orders as any)
  expect(r).toEqual({ created: 0, overwrites: ['PO-1'] })
  expect(state.inserted.length).toBe(0)
})

test('duplicate with force deletes the old rows then recreates', async () => {
  state.existing = [{ id: 'old1', makro_order_no: 'PO-1' }]
  const r = await commitImport('2026-10-01', orders as any, { force: true })
  expect(r).toEqual({ created: 1, overwrites: ['PO-1'] })
  expect(state.deleted).toEqual([{ table: 'orders', vals: ['old1'] }])
  expect(state.inserted.some((i) => i.table === 'orders')).toBe(true)
})

test('updateOrderStatus rejects an illegal transition', async () => {
  state.current = { status: 'imported' }
  await expect(updateOrderStatus('o1', 'shipped')).rejects.toThrow()
  expect(state.updated.length).toBe(0)
})

test('updateOrderStatus writes a legal transition', async () => {
  state.current = { status: 'imported' }
  await updateOrderStatus('o1', 'packing')
  expect(state.updated).toEqual([{ table: 'orders', patch: { status: 'packing' } }])
})

test('regenTokenLink returns a fresh token and persists it', async () => {
  const token = await regenTokenLink('o1')
  expect(token).toMatch(/^o_[0-9a-f]{32}$/)
  expect(state.updated).toEqual([{ table: 'orders', patch: { link_token: token } }])
})
