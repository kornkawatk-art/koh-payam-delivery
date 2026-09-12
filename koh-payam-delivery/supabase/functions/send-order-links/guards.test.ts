import { bangkokToday, missingLineSecrets } from './guards'

test('bangkokToday returns a YYYY-MM-DD calendar date', () => {
  expect(bangkokToday(new Date('2026-09-12T05:00:00Z'))).toBe('2026-09-12')
})

test('bangkokToday uses Thailand time, not UTC — the 00:00–07:00 ICT window is the whole point', () => {
  // 17:00Z on the 12th is already 00:00 on the 13th in Bangkok (UTC+7). This is
  // the morning window this feature actually runs in; a naive UTC comparison
  // would call it the 12th and skip every real send as "not today".
  expect(bangkokToday(new Date('2026-09-12T17:00:00Z'))).toBe('2026-09-13')
  expect(bangkokToday(new Date('2026-09-12T23:30:00Z'))).toBe('2026-09-13')
  // 06:59 ICT on the 13th is 23:59Z on the 12th — same conclusion.
  expect(bangkokToday(new Date('2026-09-12T23:59:00Z'))).toBe('2026-09-13')
})

test('bangkokToday rolls over at ICT midnight, not UTC midnight', () => {
  expect(bangkokToday(new Date('2026-09-12T16:59:59Z'))).toBe('2026-09-12') // 23:59:59 ICT
  expect(bangkokToday(new Date('2026-09-12T17:00:00Z'))).toBe('2026-09-13') // 00:00:00 ICT
})

test('a ship date matching bangkokToday is today; the day before/after is not', () => {
  const now = new Date('2026-09-12T17:30:00Z') // 2026-09-13 00:30 ICT
  const today = bangkokToday(now)
  expect('2026-09-13' === today).toBe(true)
  expect('2026-09-12' === today).toBe(false) // yesterday: links would already be dead
  expect('2026-09-14' === today).toBe(false) // boats set up in advance: legitimate, just don't send
})

test('missingLineSecrets lists nothing when both secrets are present', () => {
  expect(missingLineSecrets('channel-token', 'https://example.com')).toEqual([])
})

test('missingLineSecrets flags an unset secret — the expected first-deploy state', () => {
  expect(missingLineSecrets('', 'https://example.com')).toEqual(['LINE_CHANNEL_ACCESS_TOKEN'])
  expect(missingLineSecrets('channel-token', '')).toEqual(['SITE_URL'])
  expect(missingLineSecrets('', '')).toEqual(['LINE_CHANNEL_ACCESS_TOKEN', 'SITE_URL'])
})

test('missingLineSecrets treats undefined/null/whitespace-only as missing', () => {
  expect(missingLineSecrets(undefined, undefined)).toEqual([
    'LINE_CHANNEL_ACCESS_TOKEN',
    'SITE_URL',
  ])
  expect(missingLineSecrets(null, null)).toEqual(['LINE_CHANNEL_ACCESS_TOKEN', 'SITE_URL'])
  expect(missingLineSecrets('   ', '\t')).toEqual(['LINE_CHANNEL_ACCESS_TOKEN', 'SITE_URL'])
})
