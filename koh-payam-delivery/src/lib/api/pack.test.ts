import { savePack } from './pack'

const calls: any[] = []
const syncShortageBackorders = vi.fn().mockResolvedValue(undefined)
let itemUpdateError: { message: string } | null = null

vi.mock('./backorders', () => ({
  syncShortageBackorders: (...a: unknown[]) => syncShortageBackorders(...a),
}))

vi.mock('./audit', () => ({ logAction: vi.fn() }))

vi.mock('../supabase', () => ({
  supabase: {
    from: (t: string) => ({
      update: (patch: any) => ({
        eq: (col: string, val: any) => {
          calls.push(['update', t, patch, { [col]: val }])
          return Promise.resolve({ error: null })
        },
        in: (col: string, vals: any[]) => {
          calls.push(['update', t, patch, { [col]: vals }])
          return Promise.resolve({ error: itemUpdateError })
        },
      }),
    }),
  },
}))

beforeEach(() => {
  calls.length = 0
  itemUpdateError = null
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
      { paper_box_count: 3, foam_box_count: 1, piece_count: 2, packer_name: 'สมชาย' },
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
      { paper_box_count: 1, foam_box_count: 0, piece_count: 0, packer_name: null },
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
