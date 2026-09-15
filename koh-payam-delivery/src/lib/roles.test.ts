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
test('non-managers are denied the LINE contacts page', () => {
  expect(canAccess('/line-contacts', 'packer')).toBe(false)
  expect(canAccess('/line-contacts', 'pier')).toBe(false)
})
test('manager can access the LINE contacts page', () => {
  expect(canAccess('/line-contacts', 'manager')).toBe(true)
})
test('non-managers are denied the audit log page', () => {
  expect(canAccess('/audit-log', 'packer')).toBe(false)
  expect(canAccess('/audit-log', 'pier')).toBe(false)
})
test('manager can access the audit log page', () => {
  expect(canAccess('/audit-log', 'manager')).toBe(true)
})
test('non-managers are denied the shortage report page', () => {
  expect(canAccess('/shortage-report', 'packer')).toBe(false)
  expect(canAccess('/shortage-report', 'pier')).toBe(false)
})
test('manager can access the shortage report page', () => {
  expect(canAccess('/shortage-report', 'manager')).toBe(true)
})
