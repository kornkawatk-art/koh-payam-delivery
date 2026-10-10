import { formatAppVersion } from './appVersion'

test('version = build date in Thailand + short commit', () => {
  // 20:00 UTC on 10 Oct is already 11 Oct in Bangkok
  expect(formatAppVersion(new Date('2026-10-10T20:00:00Z'), '4ce840e1234567')).toBe('v2026.10.11 · 4ce840e')
  expect(formatAppVersion(new Date('2026-01-05T01:00:00Z'), 'abc')).toBe('v2026.01.05 · abc')
})

test('no commit known -> just the date', () => {
  expect(formatAppVersion(new Date('2026-10-10T01:00:00Z'), '')).toBe('v2026.10.10')
  expect(formatAppVersion(new Date('2026-10-10T01:00:00Z'))).toBe('v2026.10.10')
})
