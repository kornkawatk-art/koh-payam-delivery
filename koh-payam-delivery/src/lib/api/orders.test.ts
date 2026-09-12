import {
  commitImport,
  deleteOrder,
  findOrdersByMakroOrderNo,
  regenTokenLink,
  setOrderPierName,
  updateOrderStatus,
} from './orders'

const state = {
  existing: [] as any[],
  inserted: [] as any[],
  deleted: [] as any[],
  updated: [] as any[],
  current: { status: 'imported' } as any,
  deleteError: null as null | { message: string },
  deleteData: [{ id: 'o1' }] as any[],
  updateError: null as null | { message: string },
  updateData: [{ id: 'o1' }] as any[],
  searchResult: [] as any[],
  searchError: null as null | { message: string },
}

vi.mock('../supabase', () => {
  const builder = (table: string) => {
    const b: any = {
      select: () => b,
      eq: (col: string) => {
        // findOrdersByMakroOrderNo awaits select(...).eq('makro_order_no', ...)
        // directly with no further chain call, unlike every other eq() usage
        // in this file (which is always followed by .in()/.single()/etc.).
        if (col === 'makro_order_no') {
          return Promise.resolve({ data: state.searchResult, error: state.searchError })
        }
        return b
      },
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
        return {
          eq: () => ({
            select: () =>
              Promise.resolve({
                data: state.updateError ? null : state.updateData,
                error: state.updateError,
              }),
            then: (resolve: any) => resolve({ error: state.updateError }),
          }),
        }
      },
      delete: () => ({
        in: (_col: string, vals: any[]) => {
          state.deleted.push({ table, vals })
          return Promise.resolve({ error: null })
        },
        eq: (col: string, val: any) => {
          state.deleted.push({ table, [col]: val })
          return {
            select: () =>
              Promise.resolve({
                data: state.deleteError ? null : state.deleteData,
                error: state.deleteError,
              }),
            then: (resolve: any) => resolve({ error: state.deleteError }),
          }
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

const logAction = vi.fn().mockResolvedValue(undefined)
vi.mock('./audit', () => ({ logAction: (...a: unknown[]) => logAction(...a) }))

const parsedOrders = [
  {
    makroOrderNo: 'PO-1',
    customerName: 'A',
    subDistrict: 'เกาะพยาม',
    shippingAddress: 'x',
    expectedDate: '2026-10-01',
    makroOrderStatus: 'Completed',
    paymentMethod: 'Pay On Delivery',
    paymentStatus: 'Unpaid',
    outstandingAmount: 6172.5,
    customerPhone: '0826289533',
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
  state.deleteError = null
  state.deleteData = [{ id: 'o1' }]
  state.updateError = null
  state.updateData = [{ id: 'o1' }]
  state.searchResult = []
  state.searchError = null
  logAction.mockClear()
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
    payment_method: 'Pay On Delivery',
    payment_status: 'Unpaid',
    outstanding_amount: 6172.5,
    customer_phone: '0826289533',
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
    payment_method: 'Pay On Delivery',
    payment_status: 'Unpaid',
    outstanding_amount: 6172.5,
    customer_phone: '0826289533',
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

test('deleteOrder deletes the row by id and logs the snapshot', async () => {
  const snapshot = {
    makroOrderNo: 'PO-1',
    customerNameEn: 'A',
    status: 'imported',
    shipDate: '2026-10-01',
  }
  await deleteOrder('o1', snapshot)
  expect(state.deleted).toEqual([{ table: 'orders', id: 'o1' }])
  expect(logAction).toHaveBeenCalledWith('order_deleted', 'order', 'o1', snapshot)
})

test('deleteOrder throws a Thai error and does not log when the delete fails', async () => {
  state.deleteError = { message: 'boom' }
  const snapshot = {
    makroOrderNo: 'PO-1',
    customerNameEn: 'A',
    status: 'imported',
    shipDate: '2026-10-01',
  }
  await expect(deleteOrder('o1', snapshot)).rejects.toThrow(/ลบออเดอร์ไม่สำเร็จ/)
  expect(logAction).not.toHaveBeenCalled()
})

test('deleteOrder throws a Thai error and does not log when RLS silently denies the delete (zero rows)', async () => {
  state.deleteData = []
  const snapshot = {
    makroOrderNo: 'PO-1',
    customerNameEn: 'A',
    status: 'imported',
    shipDate: '2026-10-01',
  }
  await expect(deleteOrder('o1', snapshot)).rejects.toThrow(
    /ลบออเดอร์ไม่สำเร็จ \(ไม่มีสิทธิ์ หรือออเดอร์ถูกลบไปแล้ว\)/,
  )
  expect(logAction).not.toHaveBeenCalled()
})

test('setOrderPierName writes the trimmed pier name and logs the raw value', async () => {
  await setOrderPierName('o1', '  ท่าเรือ 1  ')
  expect(state.updated).toEqual([{ table: 'orders', patch: { pier_name: 'ท่าเรือ 1' } }])
  expect(logAction).toHaveBeenCalledWith('pier_name_set', 'order', 'o1', {
    pierName: '  ท่าเรือ 1  ',
  })
})

test('setOrderPierName writes null when only whitespace is given', async () => {
  await setOrderPierName('o1', '   ')
  expect(state.updated).toEqual([{ table: 'orders', patch: { pier_name: null } }])
})

test('setOrderPierName throws a Thai error and does not log when RLS silently denies the update (zero rows)', async () => {
  state.updateData = []
  await expect(setOrderPierName('o1', 'ท่าเรือ 1')).rejects.toThrow(
    /บันทึกชื่อคนลงเรือไม่สำเร็จ \(ออเดอร์อาจถูกส่งไปแล้ว\)/,
  )
  expect(logAction).not.toHaveBeenCalled()
})

test('findOrdersByMakroOrderNo returns the matching row(s) for a known order number', async () => {
  state.searchResult = [{ id: 'o1', customer_name_en: 'BLUE VIEW', ship_date: '2026-10-01' }]
  const rows = await findOrdersByMakroOrderNo('PO-1')
  expect(rows).toEqual([{ id: 'o1', customer_name_en: 'BLUE VIEW', ship_date: '2026-10-01' }])
})

test('findOrdersByMakroOrderNo trims the input before querying', async () => {
  state.searchResult = [{ id: 'o1', customer_name_en: 'BLUE VIEW', ship_date: '2026-10-01' }]
  const rows = await findOrdersByMakroOrderNo('  PO-1  ')
  expect(rows.length).toBe(1)
})

test('findOrdersByMakroOrderNo returns multiple rows as-is when several orders share the number', async () => {
  state.searchResult = [
    { id: 'o1', customer_name_en: 'BLUE VIEW', ship_date: '2026-10-01' },
    { id: 'o2', customer_name_en: 'PAYAM CAFE', ship_date: '2026-10-02' },
  ]
  const rows = await findOrdersByMakroOrderNo('PO-1')
  expect(rows).toHaveLength(2)
})

test('findOrdersByMakroOrderNo returns [] (not an error) when nothing matches', async () => {
  state.searchResult = []
  const rows = await findOrdersByMakroOrderNo('PO-404')
  expect(rows).toEqual([])
})

test('findOrdersByMakroOrderNo throws a Thai error on a real Supabase error', async () => {
  state.searchError = { message: 'boom' }
  await expect(findOrdersByMakroOrderNo('PO-1')).rejects.toThrow(/ค้นหาออเดอร์ไม่สำเร็จ/)
})
