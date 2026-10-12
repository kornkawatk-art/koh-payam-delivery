import { CLAIM_WINDOW_MS, LINK_VIEW_MS, isLinkValid } from './linkWindow'

const H = 60 * 60 * 1000
const shipped = '2026-10-01T08:00:00Z'
const at = (hoursAfter: number) => new Date(shipped).getTime() + hoursAfter * H

test('claims stay 48 hours; the link itself lasts 7 days', () => {
  expect(CLAIM_WINDOW_MS).toBe(48 * H)
  expect(LINK_VIEW_MS).toBe(7 * 24 * H)
})

test('a shipped order stays viewable for 7 days, well past the claim window', () => {
  expect(isLinkValid(shipped, at(49))).toBe(true) // claims closed, still viewable
  expect(isLinkValid(shipped, at(7 * 24))).toBe(true)
  expect(isLinkValid(shipped, at(7 * 24 + 1))).toBe(false)
})

test('an order that has not shipped yet is always viewable', () => {
  expect(isLinkValid(null, at(1000))).toBe(true)
})
