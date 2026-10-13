import { foamTimeline, heldDays, heldTone, lastReturnAt, oldestHeldAt, returnedSince } from './foamTrack'
import type { FoamEvent } from '../../supabase/functions/_shared/foamBalance'

const D = 24 * 60 * 60 * 1000
const day = (n: number) => new Date(Date.UTC(2026, 9, n)).toISOString() // 2026-10-n
const sent = (n: number, qty: number, label = 'PO'): FoamEvent => ({ at: day(n), kind: 'sent', qty, label })
const ret = (n: number, qty: number): FoamEvent => ({ at: day(n), kind: 'return', qty })
const set = (n: number, qty: number): FoamEvent => ({ at: day(n), kind: 'set', qty })

test('returns use up the oldest boxes first, so the oldest box still out sets the age', () => {
  const ev = [sent(1, 5), sent(3, 2), ret(5, 4), sent(9, 2)]
  // 5 sent on the 1st, 4 of them back on the 5th -> 1 box from the 1st is still out
  expect(oldestHeldAt(ev)).toBe(day(1))
  expect(oldestHeldAt([...ev, ret(10, 1)])).toBe(day(3)) // that last one back -> the 3rd's boxes are oldest
})

test('nothing held -> no age; a set-balance counts as held from that moment', () => {
  expect(oldestHeldAt([sent(1, 2), ret(2, 2)])).toBeNull()
  expect(oldestHeldAt([sent(1, 2), set(4, 3)])).toBe(day(4))
  expect(oldestHeldAt([sent(1, 2), set(4, 0)])).toBeNull()
  expect(oldestHeldAt([sent(1, 2), ret(2, 9)])).toBeNull() // over-return never goes negative
})

test('days held and how urgent that is (0-7 grey, 8-14 amber, over 14 red)', () => {
  const now = new Date(day(20)).getTime() + 3 * 60 * 60 * 1000
  expect(heldDays([sent(1, 1)], now)).toBe(19)
  expect(heldDays([], now)).toBeNull()
  expect(heldTone(7)).toBe('badge-neutral')
  expect(heldTone(8)).toBe('badge-warn')
  expect(heldTone(14)).toBe('badge-warn')
  expect(heldTone(15)).toBe('badge-danger')
})

test('the timeline carries the balance after each step, in order', () => {
  expect(foamTimeline([sent(3, 2), sent(1, 5), ret(5, 4), set(6, 1)]).map((e) => [e.kind, e.after])).toEqual([
    ['sent', 5],
    ['sent', 7],
    ['return', 3],
    ['set', 1],
  ])
})

test('last return, and boxes returned since a time', () => {
  const ev = [sent(1, 5), ret(3, 2), ret(8, 1)]
  expect(lastReturnAt(ev)).toBe(day(8))
  expect(lastReturnAt([sent(1, 1)])).toBeNull()
  expect(returnedSince([ev, [ret(9, 4)]], new Date(day(5)).getTime())).toBe(5)
  expect(D).toBeGreaterThan(0)
})
