import { canAccess } from './roles'

test('packer cannot access pier', () => {
  expect(canAccess('/pier', 'packer')).toBe(false)
})
test('non-managers are denied the claims queue', () => {
  expect(canAccess('/claims', 'packer')).toBe(false)
  expect(canAccess('/claims', 'pier')).toBe(false)
})
test('pier is denied order import', () => {
  expect(canAccess('/import', 'pier')).toBe(false)
})
test('pier can access pier and dashboard', () => {
  expect(canAccess('/pier', 'pier')).toBe(true)
  expect(canAccess('/', 'pier')).toBe(true)
})
test('manager can access everything in NAV', () => {
  expect(canAccess('/claims', 'manager')).toBe(true)
  expect(canAccess('/import', 'manager')).toBe(true)
})
