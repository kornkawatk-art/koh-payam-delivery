import { savePack } from './pack'

const calls: any[] = []
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
          calls.push(['update', t, patch, { [col]: val }])
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

beforeEach(() => {
  calls.length = 0
  syncShortageBackorders.mockClear()
})

test('savePack writes only the box counts + packer name and re-syncs shortage backorders', async () => {
  const out = await savePack({
    orderId: 'ord1',
    paperCount: 3,
    foamCount: 1,
    pieceCount: 2,
    packerName: 'สมชาย',
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
