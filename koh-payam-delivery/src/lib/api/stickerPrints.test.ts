import { markStickersPrinted } from './stickerPrints'
import { getShortNames } from './customerAliases'

const updates: { patch: any; id: any }[] = []
const inCalls: any[] = []
let fail = false
vi.mock('../supabase', () => ({
  supabase: {
    from: (t: string) => ({
      update: (patch: any) => ({
        eq: (_c: string, id: any) => {
          updates.push({ patch, id })
          return Promise.resolve({ error: fail ? { message: 'nope' } : null })
        },
      }),
      select: () => ({
        in: (c: string, vals: any[]) => {
          inCalls.push([t, c, vals])
          return Promise.resolve({
            data: [{ customer_key: 'phone:0826289533|name:JJ PAYAM', short_name: 'JJ' }],
            error: null,
          })
        },
      }),
    }),
  },
}))

beforeEach(() => {
  updates.length = 0
  inCalls.length = 0
  fail = false
})

test('markStickersPrinted stores each order’s printed box counts', async () => {
  await markStickersPrinted([
    { id: 'a', paper_box_count: 2, foam_box_count: 1, piece_count: 0 },
    { id: 'b', paper_box_count: 0, foam_box_count: 0, piece_count: 0 },
  ])
  expect(updates).toEqual([
    { patch: { stickers_printed: '2,1,0' }, id: 'a' },
    { patch: { stickers_printed: '0,0,0' }, id: 'b' },
  ])
})

test('markStickersPrinted reports a failure', async () => {
  fail = true
  await expect(markStickersPrinted([{ id: 'a', paper_box_count: 1, foam_box_count: 0, piece_count: 0 }])).rejects.toThrow(
    'บันทึกว่าพิมพ์สติ๊กเกอร์แล้วไม่สำเร็จ',
  )
})

test('getShortNames: every saved name in one query, keyed by customer', async () => {
  const names = await getShortNames([
    { customer_phone: '082-628-9533', customer_name_en: 'jj payam' },
    { customer_phone: null, customer_name_en: 'Sunset' },
  ])
  expect(inCalls).toEqual([['customer_aliases', 'customer_key', ['phone:0826289533|name:JJ PAYAM', 'name:SUNSET']]])
  expect(names.get('phone:0826289533|name:JJ PAYAM')).toBe('JJ')
  expect(names.has('name:SUNSET')).toBe(false)
})
