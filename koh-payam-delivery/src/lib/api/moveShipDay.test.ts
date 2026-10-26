import { moveOrdersToDay } from './moveShipDay'

const getOrCreateShipDay = vi.fn().mockResolvedValue({ id: 'day-27', boats: [] })
vi.mock('./shipDays', () => ({ getOrCreateShipDay: (...a: unknown[]) => getOrCreateShipDay(...a) }))
const logAction = vi.fn().mockResolvedValue(undefined)
vi.mock('./audit', () => ({ logAction: (...a: unknown[]) => logAction(...a) }))

const updates: any[] = []
let failOn: string | null = null
vi.mock('../supabase', () => ({
  supabase: {
    from: (t: string) => ({
      update: (patch: any) => {
        const entry: any = { table: t, patch, where: {} as Record<string, any> }
        updates.push(entry)
        const chain: any = {
          eq: (c: string, v: any) => {
            entry.where[c] = v
            return chain
          },
          in: (c: string, v: any) => {
            entry.where[c] = v
            return chain
          },
          then: (ok: any, bad: any) =>
            Promise.resolve({ error: failOn === t ? { message: 'boom' } : null }).then(ok, bad),
        }
        return chain
      },
    }),
  },
}))

const TODAY = '2026-10-26'
const order = (id: string, status: string) => ({ id, makro_order_no: 'PO-' + id, ship_date: '2026-10-26', status })

beforeEach(() => {
  updates.length = 0
  failOn = null
  getOrCreateShipDay.mockClear()
  logAction.mockClear()
})

test('moves every order to the new day, clears its boat, brings an order at the pier back to packed', async () => {
  const n = await moveOrdersToDay([order('a', 'packed'), order('b', 'at_pier')], '2026-10-27', ' รอลูกค้าโอน ', TODAY)
  expect(n).toBe(2)
  expect(getOrCreateShipDay).toHaveBeenCalledWith('2026-10-27')
  const moves = updates.filter((u) => u.table === 'orders')
  expect(moves.map((u) => [u.where.id, u.patch])).toEqual([
    ['a', { ship_day_id: 'day-27', ship_date: '2026-10-27', boat_id: null, status: 'packed' }],
    ['b', { ship_day_id: 'day-27', ship_date: '2026-10-27', boat_id: null, status: 'packed' }],
  ])
  expect(logAction).toHaveBeenCalledWith('move_ship_day', 'order', 'a', {
    makroOrderNo: 'PO-a',
    from: '2026-10-26',
    to: '2026-10-27',
    reason: 'รอลูกค้าโอน',
  })
})

test('a claim resend waiting on the moved orders moves with them', async () => {
  await moveOrdersToDay([order('a', 'imported')], '2026-10-28', 'ลูกค้าขอเลื่อน', TODAY)
  const bo = updates.find((u) => u.table === 'backorders')
  expect(bo.patch).toEqual({ target_ship_date: '2026-10-28' })
  expect(bo.where).toEqual({ target_order_id: ['a'], status: 'pending' })
})

test('an order that has gone out, a past day or a missing reason is refused before anything is written', async () => {
  await expect(moveOrdersToDay([order('a', 'shipped')], '2026-10-27', 'x', TODAY)).rejects.toThrow('ส่งออกไปแล้ว')
  await expect(moveOrdersToDay([order('a', 'packed')], '2026-10-27', '  ', TODAY)).rejects.toThrow('ใส่เหตุผล')
  await expect(moveOrdersToDay([order('a', 'packed')], '2020-01-01', 'x', TODAY)).rejects.toThrow('พรุ่งนี้')
  expect(updates).toHaveLength(0)
})

test('a failed write says which order', async () => {
  failOn = 'orders'
  await expect(moveOrdersToDay([order('a', 'packed')], '2026-10-27', 'x', TODAY)).rejects.toThrow('PO-a')
})
