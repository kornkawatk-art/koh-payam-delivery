import {
  formatTHB,
  formatDateTH,
  formatDateTimeTH,
  formatDate,
  formatDateTime,
  todayLocalISO,
} from './format'

test('formatTHB includes the grouped amount and a currency marker', () => {
  const out = formatTHB(1234.5)
  expect(out).toContain('1,234.5')
  expect(out.includes('฿') || out.includes('THB')).toBe(true)
})

test('formatDateTH returns a non-empty string', () => {
  expect(formatDateTH('2026-10-01')).toBeTruthy()
})

test('formatDateTimeTH returns a non-empty string', () => {
  expect(formatDateTimeTH('2026-10-01T08:30:00Z')).toBeTruthy()
})

test('formatDate(en) renders a non-Thai (en-GB) date string', () => {
  const out = formatDate('2026-10-01', 'en')
  expect(out).not.toMatch(/[฀-๿]/) // no Thai script / digits
  expect(out).toContain('2026')
  expect(out).toMatch(/Oct/)
})

test('formatDate(th) still renders Thai', () => {
  expect(formatDate('2026-10-01', 'th')).toMatch(/[฀-๿]/)
})

test('formatDateTime(en) renders a non-Thai date-time string', () => {
  const out = formatDateTime('2026-10-01T08:30:00Z', 'en')
  expect(out).not.toMatch(/[฀-๿]/)
  expect(out).toContain('2026')
})

test('todayLocalISO is a Y-M-D string matching the local calendar date', () => {
  const out = todayLocalISO()
  expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  const d = new Date()
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
  expect(out).toBe(expected)
})
