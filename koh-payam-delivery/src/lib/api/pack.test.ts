import { computeShortageValue, savePack } from './pack'

const calls: any[] = []
let itemRows: any[] = []
const syncShortageBackorders = vi.fn().mockResolvedValue(undefined)

vi.mock('./backorders', () => ({
  syncShortageBackorders: (...a: unknown[]) => syncShortageBackorders(...a),
}))

vi.mock('./audit', () => ({ logAction: vi.fn() }))

vi.mock('../supabase', () => ({
  supabase: {
    from: (t: string) => ({
      update: (patch: any) => ({
        eq: (col: string, val: any) => {
          const entry: any = ['update', t, patch, { [col]: val }]
          calls.push(entry)
          const p: any = Promise.resolve({ error: null })
          p.in = (c2: string, v2: any) => {
            entry[3][c2] = v2
            return Promise.resolve({ error: null })
          }
          return p
        },
      }),
      select: (sel: string) => ({
        eq: (col: string, val: any) => {
          calls.push(['select', t, sel, col, val])
          return Promise.resolve({ data: itemRows, error: null })
        },
      }),
    }),
  },
}))

beforeEach(() => {
  calls.length = 0
  itemRows = []
  syncShortageBackorders.mockClear()
})

test('computeShortageValue sums only short lines', () => {
  const v = computeShortageValue([
    { unit_price: 100, qty_ordered: 2, status: 'short' },
    { unit_price: 50, qty_ordered: 3, status: 'ok' },
    { unit_price: 10, qty_ordered: 5, status: 'short' },
  ])
  expect(v).toBe(250) // 100*2 + 10*5
})

test('savePack writes item rows, box counts, and returns the shortage value', async () => {
  itemRows = [
    { unit_price: 100, qty_ordered: 2, status: 'short' },
    { unit_price: 50, qty_ordered: 1, status: 'ok' },
  ]
  const out = await savePack({
    orderId: 'ord1',
    paperCount: 3,
    foamCount: 1,
    items: [
      { id: 'i1', status: 'short', qtyShipped: 0 },
      { id: 'i2', status: 'ok', qtyShipped: 1 },
    ],
  })
  expect(out).toEqual({ shortageValue: 200 })

  const itemUpdates = calls.filter((c) => c[0] === 'update' && c[1] === 'order_items')
  expect(itemUpdates).toHaveLength(2)
  expect(itemUpdates[0]).toEqual([
    'update',
    'order_items',
    { status: 'short', qty_shipped: 0 },
    { id: 'i1' },
  ])

  const orderUpdates = calls.filter((c) => c[0] === 'update' && c[1] === 'orders')
  expect(orderUpdates).toHaveLength(2)

  // Box counts are written unconditionally — no status guard, so edits after
  // the order is packed still persist.
  const boxUpdate = orderUpdates.find((c) => 'paper_box_count' in c[2])
  expect(boxUpdate[2]).toEqual({ paper_box_count: 3, foam_box_count: 1 })
  expect(boxUpdate[3]).toEqual({ id: 'ord1' })

  // Status transition stays gated to imported/packing.
  const statusUpdate = orderUpdates.find((c) => 'status' in c[2])
  expect(statusUpdate[2]).toEqual({ status: 'packing' })
  expect(statusUpdate[3]).toEqual({ id: 'ord1', status: ['imported', 'packing'] })

  expect(syncShortageBackorders).toHaveBeenCalledWith('ord1')
})
