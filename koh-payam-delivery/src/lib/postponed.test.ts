import { canMoveShipDay, movableNos, nextDayISO, shipDayTargetError } from './postponed'

const row = (no: string, ship_date: string, status: string) => ({ id: no + ship_date, makro_order_no: no, ship_date, status })

test('a PO still waiting on one earlier day can move; a delivered or duplicated one cannot', () => {
  const nos = movableNos(
    [
      row('A', '2026-10-15', 'imported'),
      row('B', '2026-10-15', 'packed'),
      row('C', '2026-10-15', 'at_pier'),
      row('D', '2026-10-15', 'shipped'),
      row('E', '2026-10-15', 'picked_up'),
      row('F', '2026-10-14', 'imported'),
      row('F', '2026-10-15', 'imported'),
    ],
    '2026-10-16',
  )
  expect([...nos].sort()).toEqual(['A', 'B', 'C'])
})

test('a PO the team postponed to a later day is not offered to move back when the old day is re-imported', () => {
  const nos = movableNos([row('A', '2026-10-17', 'imported'), row('B', '2026-10-15', 'imported')], '2026-10-16')
  expect([...nos]).toEqual(['B'])
})

test('an order can be postponed until it has gone out', () => {
  for (const s of ['imported', 'packing', 'packed', 'at_pier']) expect(canMoveShipDay(s)).toBe(true)
  for (const s of ['shipped', 'picked_up']) expect(canMoveShipDay(s)).toBe(false)
})

test('the next day crosses a month end', () => {
  expect(nextDayISO('2026-10-31')).toBe('2026-11-01')
  expect(nextDayISO('2026-10-16')).toBe('2026-10-17')
})

test('the new ship day is tomorrow or later, and not the day the order is already on', () => {
  const today = '2026-10-26'
  expect(shipDayTargetError('2026-10-27', '2026-10-26', today)).toBeNull()
  expect(shipDayTargetError('2026-11-05', '2026-10-25', today)).toBeNull()
  expect(shipDayTargetError('', '2026-10-26', today)).toBe('เลือกวันส่งใหม่')
  expect(shipDayTargetError('2026-10-26', '2026-10-25', today)).toBe('เลือกได้ตั้งแต่พรุ่งนี้เป็นต้นไป')
  expect(shipDayTargetError('2026-10-20', '2026-10-26', today)).toBe('เลือกได้ตั้งแต่พรุ่งนี้เป็นต้นไป')
  expect(shipDayTargetError('2026-10-28', '2026-10-28', today)).toBe('ออเดอร์อยู่วันนี้อยู่แล้ว')
})
