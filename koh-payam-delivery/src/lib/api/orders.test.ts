import {
  commitImport,
  listOrdersOnOtherDays,
  deleteOrder,
  findOrdersByMakroOrderNo,
  listOrdersForCustomerDay,
  regenTokenLink,
  setOrderBoats,
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
  oldItems: [] as any[],
  elsewhere: [] as any[],
  elsewhereError: null as null | { message: string },
  customerDayRows: [] as any[],
  customerDayError: null as null | { message: string },
  customerDayCalls: [] as any[],
  boatsData: [] as any[],
  boatsCalls: [] as any[],
}

vi.mock('../supabase', () => {
  const builder = (table: string) => {
    const b: any = {
      select: (cols?: string) => {
        state.customerDayCalls.push(['select', table, cols])
        return b
      },
      order: (col: string) => {
        state.customerDayCalls.push(['order', col])
        return Promise.resolve({ data: state.customerDayRows, error: state.customerDayError })
      },
      eq: (col: string, val?: unknown) => {
        state.customerDayCalls.push(['eq', col, val])
        // findOrdersByMakroOrderNo awaits select(...).eq('makro_order_no', ...)
        // directly with no further chain call, unlike every other eq() usage
        // in this file (which is always followed by .in()/.single()/etc.).
        if (col === 'makro_order_no') {
          return Promise.resolve({ data: state.searchResult, error: state.searchError })
        }
        // commitImport's packed-carry-forward read: select(...).eq('order_id', ...)
        // also terminates the chain with no further call.
        if (col === 'order_id') {
          return Promise.resolve({ data: state.oldItems, error: null })
        }
        return b
      },
      // listOrdersOnOtherDays: select(...).neq('ship_date', d).in('makro_order_no', nos)
      neq: () => {
        b.__other = true
        return b
      },
      in: () => {
        if (b.__other) {
          b.__other = false
          return Promise.resolve({ data: state.elsewhere, error: state.elsewhereError })
        }
        return Promise.resolve({ data: state.existing, error: null })
      },
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
          // setOrderBoats: update(...).in('id', ids).in('status', [...]).select('id')
          in: (col: string, vals: unknown[]) => {
            state.boatsCalls.push([col, vals])
            return {
              in: (col2: string, vals2: unknown[]) => {
                state.boatsCalls.push([col2, vals2])
                return {
                  select: () =>
                    Promise.resolve({
                      data: state.updateError ? null : state.boatsData,
                      error: state.updateError,
                    }),
                }
              },
            }
          },
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

const linkBackordersToDay = vi.fn().mockResolvedValue(0)
const syncShortageBackorders = vi.fn().mockResolvedValue(undefined)
vi.mock('./backorders', () => ({
  linkBackordersToDay: (...a: unknown[]) => linkBackordersToDay(...a),
  syncShortageBackorders: (...a: unknown[]) => syncShortageBackorders(...a),
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
        isFresh: false,
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
  state.oldItems = []
  state.elsewhere = []
  state.elsewhereError = null
  state.customerDayRows = []
  state.customerDayError = null
  state.customerDayCalls = []
  state.boatsData = []
  state.boatsCalls = []
  logAction.mockClear()
  linkBackordersToDay.mockClear()
  syncShortageBackorders.mockClear()
})

test('fresh import inserts orders + items and counts created', async () => {
  const r = await commitImport('2026-10-01', parsedOrders as any)
  expect(r).toEqual({ created: 1, synced: 0, skipped: [] })
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
    is_fresh: false,
    packed: false, // a brand-new order has no prior tick to carry forward
  })
  // A freshly created order's shortage backorders are seeded immediately,
  // not left to wait for someone to first open its pack screen.
  expect(syncShortageBackorders).toHaveBeenCalledWith('new-1')
})

test('re-import of an existing order syncs without touching protected columns', async () => {
  state.existing = [{ id: 'old1', makro_order_no: 'PO-1' }]
  const r = await commitImport('2026-10-01', parsedOrders as any)
  expect(r).toEqual({ created: 0, synced: 1, skipped: [] })

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

  // Re-syncing must refresh this order's shortage backorders too -- a
  // corrected shipped/shortage number from Makro must not leave a stale
  // (or missing) backorder row behind.
  expect(syncShortageBackorders).toHaveBeenCalledWith('old1')
})

test('re-import carries the "packed" tick forward for a line matched by makro_item_id', async () => {
  state.existing = [{ id: 'old1', makro_order_no: 'PO-1' }]
  state.oldItems = [{ makro_item_id: '100001', product_name: 'old name', packed: true }]
  await commitImport('2026-10-01', parsedOrders as any)
  const itemIns = state.inserted.find((i) => i.table === 'order_items')
  // matched on makro_item_id ('100001') despite the product_name differing
  // (Makro can rename a product between exports) -- the tick still carries.
  expect(itemIns.rows[0]).toMatchObject({ makro_item_id: '100001', packed: true })
})

test('re-import does not carry a tick forward for a line with no matching old row', async () => {
  state.existing = [{ id: 'old1', makro_order_no: 'PO-1' }]
  state.oldItems = [{ makro_item_id: '999999', product_name: 'unrelated', packed: true }]
  await commitImport('2026-10-01', parsedOrders as any)
  const itemIns = state.inserted.find((i) => i.table === 'order_items')
  expect(itemIns.rows[0]).toMatchObject({ makro_item_id: '100001', packed: false })
})

test('re-import skips the carry-forward (defaults to unpacked) when two old rows share the same key', async () => {
  // A data gap Makro's own export can produce for real (e.g. two old rows
  // both missing Item Id with the same product name) collapses to one
  // ambiguous map entry -- must not let either row's tick "win" and leak
  // onto the new line, since that could silently mark a line as already
  // packed without it ever being re-verified.
  state.existing = [{ id: 'old1', makro_order_no: 'PO-1' }]
  state.oldItems = [
    { makro_item_id: '100001', product_name: 'a', packed: true },
    { makro_item_id: '100001', product_name: 'b', packed: true },
  ]
  await commitImport('2026-10-01', parsedOrders as any)
  const itemIns = state.inserted.find((i) => i.table === 'order_items')
  expect(itemIns.rows[0]).toMatchObject({ makro_item_id: '100001', packed: false })
})

test('re-import calls syncShortageBackorders for every order, new and synced, before the once-per-day link pass', async () => {
  state.existing = [{ id: 'old1', makro_order_no: 'PO-1' }]
  const twoOrders = [
    parsedOrders[0],
    { ...parsedOrders[0], makroOrderNo: 'PO-2', customerName: 'B' },
  ]
  await commitImport('2026-10-01', twoOrders as any)
  // PO-1 synced (existing id old1); PO-2 created (fresh id from the mocked
  // insert -- PO-1's own order_items insert already pushed once, so PO-2's
  // orders-insert lands as the 2nd row in the mock's insert log, hence 'new-2').
  expect(syncShortageBackorders).toHaveBeenCalledWith('old1')
  expect(syncShortageBackorders).toHaveBeenCalledWith('new-2')
  expect(syncShortageBackorders).toHaveBeenCalledTimes(2)
  // linkBackordersToDay runs once for the whole ship date, after every
  // order's own backorders have already been refreshed -- not per order.
  expect(linkBackordersToDay).toHaveBeenCalledTimes(1)
  expect(linkBackordersToDay).toHaveBeenCalledWith('2026-10-01')
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

test('listOrdersForCustomerDay filters by ship date + phone, orders by order number, and embeds items + photos', async () => {
  state.customerDayRows = [{ id: 'a' }, { id: 'b' }]
  const rows = await listOrdersForCustomerDay('2026-10-01', '0811111111')
  expect(rows).toEqual([{ id: 'a' }, { id: 'b' }])
  const c = state.customerDayCalls
  expect(c).toContainEqual(['select', 'orders', '*, order_items(*), evidence_photos(*)'])
  expect(c).toContainEqual(['eq', 'ship_date', '2026-10-01'])
  expect(c).toContainEqual(['eq', 'customer_phone', '0811111111'])
  expect(c).toContainEqual(['order', 'makro_order_no'])
})

test('listOrdersForCustomerDay throws a Thai error on failure', async () => {
  state.customerDayError = { message: 'boom' }
  await expect(listOrdersForCustomerDay('2026-10-01', '0811111111')).rejects.toThrow(
    'โหลดออเดอร์ของลูกค้าไม่สำเร็จ',
  )
})

test('setOrderBoats assigns the boat + at_pier to every ready PO in one update, guarded to packed/at_pier, and audits each', async () => {
  state.boatsData = [{ id: 'a' }, { id: 'b' }]
  const n = await setOrderBoats(['a', 'b', 'c'], '2')
  expect(n).toBe(2)
  expect(state.updated.at(-1)).toEqual({ table: 'orders', patch: { boat_id: '2', status: 'at_pier' } })
  expect(state.boatsCalls).toEqual([
    ['id', ['a', 'b', 'c']],
    ['status', ['packed', 'at_pier']],
  ])
  expect(logAction).toHaveBeenCalledWith('boat_set', 'order', 'a', { boatId: '2' })
  expect(logAction).toHaveBeenCalledWith('boat_set', 'order', 'b', { boatId: '2' })
  expect(logAction).toHaveBeenCalledTimes(2)
})

test('setOrderBoats throws when no PO was updatable (all already shipped) and logs nothing', async () => {
  state.boatsData = []
  await expect(setOrderBoats(['a'], '2')).rejects.toThrow('บันทึกเรือไม่สำเร็จ (ออเดอร์อาจถูกส่งไปแล้ว)')
  expect(logAction).not.toHaveBeenCalled()
})

test('setOrderBoats surfaces a database error in Thai', async () => {
  state.updateError = { message: 'boom' }
  await expect(setOrderBoats(['a'], '2')).rejects.toThrow('บันทึกเรือไม่สำเร็จ: boom')
})

test('a PO already imported on ANOTHER day is skipped: nothing is created, synced or back-ordered for it', async () => {
  state.elsewhere = [{ makro_order_no: 'PO-1', ship_date: '2026-09-19', status: 'shipped' }]
  const r = await commitImport('2026-10-01', parsedOrders as any)
  expect(r).toEqual({
    created: 0,
    synced: 0,
    skipped: [{ makroOrderNo: 'PO-1', shipDate: '2026-09-19' }],
  })
  expect(state.inserted.some((i) => i.table === 'orders' || i.table === 'order_items')).toBe(false)
  expect(state.updated.some((u) => u.table === 'orders')).toBe(false)
  expect(syncShortageBackorders).not.toHaveBeenCalled()
  expect(logAction).toHaveBeenCalledWith('import', 'ship_day', 'sd1', {
    shipDate: '2026-10-01',
    created: 0,
    synced: 0,
    skipped: 1,
  })
})

test('a PO that exists on THIS day (and also on another) still syncs in place -- same day wins', async () => {
  state.existing = [{ id: 'old1', makro_order_no: 'PO-1' }]
  state.elsewhere = [{ makro_order_no: 'PO-1', ship_date: '2026-09-19', status: 'shipped' }]
  const r = await commitImport('2026-10-01', parsedOrders as any)
  expect(r).toEqual({ created: 0, synced: 1, skipped: [] })
})

test('in a mixed file only the already-imported POs are skipped; the new ones are created', async () => {
  state.elsewhere = [{ makro_order_no: 'PO-1', ship_date: '2026-09-19', status: 'shipped' }]
  const twoOrders = [parsedOrders[0], { ...parsedOrders[0], makroOrderNo: 'PO-2', customerName: 'B' }]
  const r = await commitImport('2026-10-01', twoOrders as any)
  expect(r.created).toBe(1)
  expect(r.skipped).toEqual([{ makroOrderNo: 'PO-1', shipDate: '2026-09-19' }])
  const ordIns = state.inserted.filter((i) => i.table === 'orders')
  expect(ordIns).toHaveLength(1)
  expect(ordIns[0].rows.makro_order_no).toBe('PO-2')
})

test('the same skipped PO listed on two other days is reported once', async () => {
  state.elsewhere = [
    { makro_order_no: 'PO-1', ship_date: '2026-09-19', status: 'shipped' },
    { makro_order_no: 'PO-1', ship_date: '2026-09-20', status: 'imported' },
  ]
  const r = await commitImport('2026-10-01', parsedOrders as any)
  expect(r.skipped).toHaveLength(1)
})

test('listOrdersOnOtherDays returns the rows, short-circuits on an empty list, and throws a Thai error on failure', async () => {
  state.elsewhere = [{ makro_order_no: 'PO-1', ship_date: '2026-09-19', status: 'shipped' }]
  expect(await listOrdersOnOtherDays(['PO-1'], '2026-10-01')).toEqual(state.elsewhere)
  expect(await listOrdersOnOtherDays([], '2026-10-01')).toEqual([])
  state.elsewhereError = { message: 'boom' }
  await expect(listOrdersOnOtherDays(['PO-1'], '2026-10-01')).rejects.toThrow('ตรวจออเดอร์ที่เคยนำเข้าแล้วไม่สำเร็จ: boom')
})
