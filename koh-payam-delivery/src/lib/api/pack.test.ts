import { savePack, savePackGroup } from './pack'

const calls: any[] = []
const syncShortageBackorders = vi.fn().mockResolvedValue(undefined)
let itemUpdateError: { message: string } | null = null
let primaryUpdateRows: { id: string }[] = [{ id: 'p1' }]

vi.mock('./backorders', () => ({
  syncShortageBackorders: (...a: unknown[]) => syncShortageBackorders(...a),
}))

vi.mock('./audit', () => ({ logAction: vi.fn() }))

vi.mock('../supabase', () => ({
  supabase: {
    from: (t: string) => ({
      // Chainable + thenable like a PostgREST builder: records ONE call
      // (patch + every filter applied) when awaited.
      update: (patch: any) => {
        const filters: Record<string, unknown> = {}
        let selected = false
        const q: any = {
          eq: (col: string, val: unknown) => {
            filters[col] = val
            return q
          },
          in: (col: string, vals: unknown[]) => {
            filters[col] = vals
            return q
          },
          select: () => {
            selected = true
            return q
          },
          then: (resolve: any) => {
            calls.push(['update', t, patch, { ...filters }])
            resolve({
              data: selected ? primaryUpdateRows : null,
              error: t === 'order_items' ? itemUpdateError : null,
            })
          },
        }
        return q
      },
    }),
  },
}))

beforeEach(() => {
  calls.length = 0
  itemUpdateError = null
  primaryUpdateRows = [{ id: 'p1' }]
  syncShortageBackorders.mockClear()
})

test('savePack writes only the box counts + packer name and re-syncs shortage backorders when no items are given', async () => {
  const out = await savePack({
    orderId: 'ord1',
    paperCount: 3,
    foamCount: 1,
    pieceCount: 2,
    packerName: 'สมชาย',
    itemPacked: [],
  })
  expect(out).toBeUndefined()

  // exactly one write, to orders, box counts + packer name only — no order_items touch, no status gate
  expect(calls).toEqual([
    [
      'update',
      'orders',
      {
        paper_box_count: 3,
        foam_box_count: 1,
        piece_count: 2,
        packer_name: 'สมชาย',
        packed_with_order_id: null, // real boxes recorded -> no longer riding on another PO
      },
      { id: 'ord1' },
    ],
  ])
  expect(calls.some((c) => c[1] === 'order_items')).toBe(false)

  expect(syncShortageBackorders).toHaveBeenCalledWith('ord1')
})

test('savePack writes packer_name as null when only whitespace is typed', async () => {
  await savePack({
    orderId: 'ord1',
    paperCount: 1,
    foamCount: 0,
    pieceCount: 0,
    packerName: '   ',
    itemPacked: [],
  })

  expect(calls).toEqual([
    [
      'update',
      'orders',
      {
        paper_box_count: 1,
        foam_box_count: 0,
        piece_count: 0,
        packer_name: null,
        packed_with_order_id: null,
      },
      { id: 'ord1' },
    ],
  ])
})

test('savePack batches item ticks into one packed=true update and one packed=false update', async () => {
  await savePack({
    orderId: 'ord1',
    paperCount: 1,
    foamCount: 0,
    pieceCount: 0,
    packerName: '',
    itemPacked: [
      { id: 'i1', packed: true },
      { id: 'i2', packed: false },
      { id: 'i3', packed: true },
    ],
  })

  const itemCalls = calls.filter((c) => c[1] === 'order_items')
  expect(itemCalls).toEqual([
    ['update', 'order_items', { packed: true }, { id: ['i1', 'i3'] }],
    ['update', 'order_items', { packed: false }, { id: ['i2'] }],
  ])
})

test('savePack skips the packed=true (or =false) call entirely when every item lands in the other bucket', async () => {
  await savePack({
    orderId: 'ord1',
    paperCount: 1,
    foamCount: 0,
    pieceCount: 0,
    packerName: '',
    itemPacked: [{ id: 'i1', packed: true }],
  })

  const itemCalls = calls.filter((c) => c[1] === 'order_items')
  expect(itemCalls).toEqual([['update', 'order_items', { packed: true }, { id: ['i1'] }]])
})

test('savePack throws a Thai error if the item-packed update fails', async () => {
  itemUpdateError = { message: 'boom' }
  await expect(
    savePack({
      orderId: 'ord1',
      paperCount: 1,
      foamCount: 0,
      pieceCount: 0,
      packerName: '',
      itemPacked: [{ id: 'i1', packed: true }],
    }),
  ).rejects.toThrow('บันทึกสถานะแพ็คสินค้าไม่สำเร็จ')
})

test('savePack with zero boxes/pieces leaves packed_with_order_id alone (a plain save must not drop the link)', async () => {
  await savePack({
    orderId: 'ord2',
    paperCount: 0,
    foamCount: 0,
    pieceCount: 0,
    packerName: '',
    itemPacked: [],
  })
  expect(calls).toEqual([
    ['update', 'orders', { paper_box_count: 0, foam_box_count: 0, piece_count: 0, packer_name: null }, { id: 'ord2' }],
  ])
})

test('savePackGroup records boxes on the primary, zeros + links the others, ticks items, syncs every PO', async () => {
  await savePackGroup({
    primaryId: 'p1',
    otherIds: ['p2', 'p3'],
    paperCount: 3,
    foamCount: 1,
    pieceCount: 0,
    packerName: ' สมชาย ',
    itemPacked: [
      { id: 'i1', packed: true },
      { id: 'i2', packed: true },
    ],
  })
  expect(calls).toEqual([
    [
      'update',
      'orders',
      { paper_box_count: 3, foam_box_count: 1, piece_count: 0, packer_name: 'สมชาย', packed_with_order_id: null },
      { id: 'p1', status: 'imported' },
    ],
    [
      'update',
      'orders',
      { paper_box_count: 0, foam_box_count: 0, piece_count: 0, packer_name: 'สมชาย', packed_with_order_id: 'p1' },
      { id: ['p2', 'p3'], status: 'imported' },
    ],
    ['update', 'order_items', { packed: true }, { id: ['i1', 'i2'] }],
  ])
  expect(syncShortageBackorders.mock.calls.map((c) => c[0])).toEqual(['p1', 'p2', 'p3'])
})

test('savePackGroup with no other POs skips the linked-orders update', async () => {
  await savePackGroup({
    primaryId: 'p1',
    otherIds: [],
    paperCount: 1,
    foamCount: 0,
    pieceCount: 0,
    packerName: '',
    itemPacked: [],
  })
  expect(calls).toHaveLength(1)
  expect(calls[0][3]).toEqual({ id: 'p1', status: 'imported' })
})

test('savePackGroup refuses (and writes nothing else) when the primary is no longer imported', async () => {
  primaryUpdateRows = [] // the status = imported guard matched no row
  await expect(
    savePackGroup({
      primaryId: 'p1',
      otherIds: ['p2'],
      paperCount: 1,
      foamCount: 0,
      pieceCount: 0,
      packerName: '',
      itemPacked: [{ id: 'i1', packed: true }],
    }),
  ).rejects.toThrow('ออเดอร์หลักถูกแพ็คหรือเปลี่ยนสถานะไปแล้ว')
  // only the guarded primary update was attempted: no other POs, no item ticks, no backorder sync
  expect(calls).toHaveLength(1)
  expect(syncShortageBackorders).not.toHaveBeenCalled()
})
