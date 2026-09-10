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
          then: (resolve: any) => resolve({ error: null }),
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
        eq: (col: string, val: any) => {
          state.deleted.push({ table, [col]: val })
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

const parsedOrders = [
  {
    makroOrderNo: 'PO-1',
    customerName: 'A',
    subDistrict: 'เกาะพยาม',
    shippingAddress: 'x',
    expectedDate: '2026-10-01',
    makroOrderStatus: 'Completed',
    items: [
      {
        productName: 'x',
        orderedQty: 2,
        shippedQty: 1,
        shortageQty: 1,
        itemId: '100001',
        itemRemark: 'r',
        lineNo: 1,
        isShort: true,
      },
    ],
  },
]

beforeEach(() => {
  state.existing = []
  state.inserted = []
  state.deleted = []
  state.updated = []
  state.current = { status: 'imported' }
})

test('fresh import inserts orders + items and counts created', async () => {
  const r = await commitImport('2026-10-01', parsedOrders as any)
  expect(r).toEqual({ created: 1, synced: 0 })
  const ordIns = state.inserted.find((i) => i.table === 'orders')
  expect(ordIns.rows).toMatchObject({
    makro_order_no: 'PO-1',
    customer_name_en: 'A',
    status: 'imported',
    sub_district: 'เกาะพยาม',
    makro_order_status: 'Completed',
  })
  expect(ordIns.rows.link_token).toMatch(/^o_[0-9a-f]{32}$/)
  const itemIns = state.inserted.find((i) => i.table === 'order_items')
  expect(itemIns.rows[0]).toMatchObject({
    product_name: 'x',
    qty_ordered: 2,
    qty_shipped: 1,
    shortage_qty: 1,
    status: 'short',
    makro_item_id: '100001',
    item_remark: 'r',
    line_no: 1,
  })
})

test('re-import of an existing order syncs without touching protected columns', async () => {
  state.existing = [{ id: 'old1', makro_order_no: 'PO-1' }]
  const r = await commitImport('2026-10-01', parsedOrders as any)
  expect(r).toEqual({ created: 0, synced: 1 })

  // orders row is not inserted again
  expect(state.inserted.some((i) => i.table === 'orders')).toBe(false)

  // only the makro-derived order fields are patched
  const patch = state.updated.find((u) => u.table === 'orders').patch
  expect(patch).toEqual({
    customer_name_en: 'A',
    sub_district: 'เกาะพยาม',
    makro_order_status: 'Completed',
  })
  for (const k of [
    'status',
    'boat_id',
    'paper_box_count',
    'foam_box_count',
    'shipped_at',
    'packed_at',
    'link_token',
  ]) {
    expect(patch).not.toHaveProperty(k)
  }

  // order_items are deleted for this order then re-inserted from the file
  expect(state.deleted).toEqual([{ table: 'order_items', order_id: 'old1' }])
  const itemIns = state.inserted.find((i) => i.table === 'order_items')
  expect(itemIns.rows[0]).toMatchObject({ order_id: 'old1', product_name: 'x', status: 'short' })
})

test('updateOrderStatus rejects an illegal transition', async () => {
  state.current = { status: 'imported' }
  await expect(updateOrderStatus('o1', 'shipped')).rejects.toThrow()
  expect(state.updated.length).toBe(0)
})

test('updateOrderStatus writes a legal transition', async () => {
  state.current = { status: 'imported' }
  await updateOrderStatus('o1', 'packed')
  expect(state.updated).toEqual([{ table: 'orders', patch: { status: 'packed' } }])
})

test('regenTokenLink returns a fresh token and persists it', async () => {
  const token = await regenTokenLink('o1')
  expect(token).toMatch(/^o_[0-9a-f]{32}$/)
  expect(state.updated).toEqual([{ table: 'orders', patch: { link_token: token } }])
})
