import { canTransition, nextStatus } from './status'

test('canTransition allows imported -> packing but not imported -> packed', () => {
  expect(canTransition('imported', 'packing')).toBe(true)
  expect(canTransition('imported', 'packed')).toBe(false)
})

test('canTransition allows backward packed -> packing but not at_pier -> packing', () => {
  expect(canTransition('packed', 'packing')).toBe(true)
  expect(canTransition('at_pier', 'packing')).toBe(false)
})

test('canTransition rejects shipped -> at_pier', () => {
  expect(canTransition('shipped', 'at_pier')).toBe(false)
})

test('nextStatus returns the forward step, skipping backward options', () => {
  expect(nextStatus('imported')).toBe('packing')
  expect(nextStatus('packed')).toBe('at_pier')
  expect(nextStatus('shipped')).toBe(null)
})
