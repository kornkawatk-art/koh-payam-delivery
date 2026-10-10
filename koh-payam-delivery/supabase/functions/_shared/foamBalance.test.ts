import { customerKey, normCustomerName } from './customerKey'
import { foamBalance, sentEvents, sortFoamEvents, type FoamEvent } from './foamBalance'

test('customerKey: digits-only phone + normalized name; formatting differences are one customer', () => {
  expect(customerKey({ customer_phone: '082-628 9533', customer_name_en: ' jj   payam ' })).toBe(
    'phone:0826289533|name:JJ PAYAM',
  )
  expect(customerKey({ customer_phone: '0826289533', customer_name_en: 'JJ Payam' })).toBe(
    'phone:0826289533|name:JJ PAYAM',
  )
  expect(customerKey({ customer_phone: null, customer_name_en: 'Sunset' })).toBe('name:SUNSET')
  expect(normCustomerName('  a   b ')).toBe('A B')
})

const ev = (at: string, kind: FoamEvent['kind'], qty: number): FoamEvent => ({ at, kind, qty })

test('sent adds, return subtracts but never below 0, set replaces', () => {
  expect(
    foamBalance([
      ev('2026-10-10T01:00:00Z', 'sent', 3),
      ev('2026-10-11T01:00:00Z', 'return', 5),
      ev('2026-10-12T01:00:00Z', 'sent', 2),
    ]).balance,
  ).toBe(2)
  expect(
    foamBalance([ev('2026-10-10T01:00:00Z', 'sent', 3), ev('2026-10-11T01:00:00Z', 'set', 7)]).balance,
  ).toBe(7)
})

test('events are applied in time order, not array order; at the same instant sent comes first', () => {
  expect(
    foamBalance([ev('2026-10-12T00:00:00Z', 'return', 1), ev('2026-10-10T00:00:00Z', 'sent', 4)]).balance,
  ).toBe(3)
  // a return logged at the very instant of a ship still finds the box out
  expect(
    foamBalance([ev('2026-10-10T00:00:00Z', 'return', 2), ev('2026-10-10T00:00:00Z', 'sent', 2)]).balance,
  ).toBe(0)
  expect(
    sortFoamEvents([ev('2026-10-10T00:00:00Z', 'set', 1), ev('2026-10-10T00:00:00Z', 'sent', 2)]).map(
      (e) => e.kind,
    ),
  ).toEqual(['sent', 'set'])
})

test('lastSentAt is the latest ship; null with no ships', () => {
  expect(
    foamBalance([ev('2026-10-10T00:00:00Z', 'sent', 1), ev('2026-10-12T00:00:00Z', 'sent', 1)]).lastSentAt,
  ).toBe('2026-10-12T00:00:00Z')
  expect(foamBalance([ev('2026-10-10T00:00:00Z', 'set', 2)]).lastSentAt).toBeNull()
})

test('sentEvents: only shipped orders with foam boxes, shipped at/after the tracking start', () => {
  const start = '2026-10-10T00:00:00Z'
  expect(
    sentEvents(
      [
        { status: 'shipped', shipped_at: '2026-10-09T23:59:59Z', foam_box_count: 2 }, // before start
        { status: 'shipped', shipped_at: '2026-10-10T00:00:00Z', foam_box_count: 3, makro_order_no: 'PO-1' },
        { status: 'at_pier', shipped_at: null, foam_box_count: 4 }, // not shipped yet
        { status: 'shipped', shipped_at: '2026-10-11T00:00:00Z', foam_box_count: 0 }, // no foam
      ],
      start,
    ),
  ).toEqual([{ at: '2026-10-10T00:00:00Z', kind: 'sent', qty: 3, label: 'PO-1' }])
})
