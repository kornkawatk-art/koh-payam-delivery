import { canTransition } from './status'
import { makroPickStage, isMakroPickedUp, makroVoid } from './makroStatus'

test('makroVoid: Makro returned / canceled orders (any case, US or UK spelling); others are null', () => {
  expect(makroVoid('Returned')).toBe('returned')
  expect(makroVoid(' canceled ')).toBe('canceled')
  expect(makroVoid('Cancelled')).toBe('canceled')
  expect(makroVoid('Delivered')).toBeNull()
  expect(makroVoid(null)).toBeNull()
})

test('isMakroPickedUp: only Makro’s "Picked up"', () => {
  expect(isMakroPickedUp('Picked up')).toBe(true)
  expect(isMakroPickedUp('picked UP')).toBe(true)
  expect(isMakroPickedUp('Ready for pickup')).toBe(false)
  expect(isMakroPickedUp(null)).toBe(false)
})

test('a store pickup can be closed from imported or packed, and only reopened back to imported', () => {
  expect(canTransition('imported', 'picked_up')).toBe(true)
  expect(canTransition('packed', 'picked_up')).toBe(true)
  expect(canTransition('at_pier', 'picked_up')).toBe(false)
  expect(canTransition('shipped', 'picked_up')).toBe(false)
  expect(canTransition('picked_up', 'imported')).toBe(true)
  expect(canTransition('picked_up', 'shipped')).toBe(false)
})

test("Makro's picking stage is read from its Order Status", () => {
  expect(makroPickStage('Placed')).toBe('waiting')
  expect(makroPickStage('Picking and packing')).toBe('picking')
  for (const s of ['Ready for ship', 'Ready for pickup', 'Shipped', 'Out for delivery', 'Delivered', 'Picked up'])
    expect(makroPickStage(s)).toBe('ready')
  expect(makroPickStage(' delivered ')).toBe('ready')
  expect(makroPickStage('Canceled')).toBeNull()
  expect(makroPickStage(null)).toBeNull()
})
