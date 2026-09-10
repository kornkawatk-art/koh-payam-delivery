import { STRINGS, t } from './i18n'

test('returns the requested language string', () => {
  expect(t('en', 'report_problem')).toBe('Report a problem')
  expect(typeof t('th', 'report_problem')).toBe('string')
  expect(t('th', 'report_problem')).not.toBe('report_problem')
})

test('falls back to english when a key is missing in th', () => {
  // seed an en-only key at runtime to prove the fallback path
  ;(STRINGS.en as Record<string, string>).__probe__ = 'English only'
  expect(t('th', '__probe__')).toBe('English only')
  delete (STRINGS.en as Record<string, string>).__probe__
})

test('returns the key itself when it is unknown in both languages', () => {
  expect(t('en', 'totally_unknown_key')).toBe('totally_unknown_key')
})

test('every en key has a th counterpart (real translations, no silent gaps)', () => {
  for (const key of Object.keys(STRINGS.en)) {
    expect(STRINGS.th[key], `missing th for "${key}"`).toBeTruthy()
  }
})
