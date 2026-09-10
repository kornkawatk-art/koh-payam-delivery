import { canTransition, nextStatus } from './status'

test('canTransition allows imported -> packed but not imported -> at_pier', () => {
  expect(canTransition('imported', 'packed')).toBe(true)
  expect(canTransition('imported', 'at_pier')).toBe(false)
})

test('canTransition walks packed -> at_pier -> shipped', () => {
  expect(canTransition('packed', 'at_pier')).toBe(true)
  expect(canTransition('at_pier', 'shipped')).toBe(true)
})

test('canTransition rejects shipped -> at_pier and any backward move', () => {
  expect(canTransition('shipped', 'at_pier')).toBe(false)
  expect(canTransition('at_pier', 'packed')).toBe(false)
  expect(canTransition('packed', 'imported')).toBe(false)
})

test('nextStatus returns the single forward step', () => {
  expect(nextStatus('imported')).toBe('packed')
  expect(nextStatus('packed')).toBe('at_pier')
  expect(nextStatus('at_pier')).toBe('shipped')
  expect(nextStatus('shipped')).toBe(null)
})
