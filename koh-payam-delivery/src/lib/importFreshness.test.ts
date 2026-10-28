import { importLateMs } from './importFreshness'

const H = 3_600_000
const at = (thai: string) => new Date(Date.parse(`${thai}+07:00`)).toISOString()
const t = (thai: string) => Date.parse(at(thai))

test('late from 2 h old during work hours', () => {
  expect(importLateMs(at('2026-10-29T09:00:00'), t('2026-10-29T10:59:00'))).toBe(0)
  expect(importLateMs(at('2026-10-29T09:00:00'), t('2026-10-29T11:00:00'))).toBe(2 * H)
})

test('never late at night; the morning counts from 08:00, not from last night', () => {
  const lastNight = at('2026-10-28T19:30:00')
  expect(importLateMs(lastNight, t('2026-10-28T21:00:00'))).toBe(0)
  expect(importLateMs(lastNight, t('2026-10-29T09:30:00'))).toBe(0)
  expect(importLateMs(lastNight, t('2026-10-29T10:00:00'))).toBe(2 * H)
})

test('never imported is not late', () => {
  expect(importLateMs(null, t('2026-10-29T12:00:00'))).toBe(0)
})
