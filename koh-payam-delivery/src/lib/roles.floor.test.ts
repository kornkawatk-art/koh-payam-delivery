import { canAccess, canEdit, isBoss, isLead, usesBothApps } from './roles'

test('แอดมิน runs the island app like a manager, audit log and order delete included', () => {
  expect(isLead('admin')).toBe(true)
  expect(isBoss('admin')).toBe(true)
  expect(canEdit('admin')).toBe(true)
  for (const p of ['/', '/import', '/boats', '/pier', '/foam', '/claims', '/debts', '/audit-log', '/customer-aliases'])
    expect(canAccess(p, 'admin')).toBe(true)
})

test('เซลฟลอร์ reads today, an order and the shortage report, and changes nothing', () => {
  expect(canEdit('floor')).toBe(false)
  expect(isLead('floor')).toBe(false)
  expect(usesBothApps('floor')).toBe(true)
  for (const p of ['/', '/order', '/shortage-report']) expect(canAccess(p, 'floor')).toBe(true)
  for (const p of ['/import', '/boats', '/pier', '/foam', '/claims', '/debts', '/audit-log', '/customer-aliases'])
    expect(canAccess(p, 'floor')).toBe(false)
})
