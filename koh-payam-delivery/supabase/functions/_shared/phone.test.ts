import { normalizePhone } from './phone'

test('an already-normalized Thai mobile number passes through unchanged', () => {
  expect(normalizePhone('0812345678')).toBe('0812345678')
})

test('strips separators a customer might type', () => {
  expect(normalizePhone('081-234-5678')).toBe('0812345678')
  expect(normalizePhone('081 234 5678')).toBe('0812345678')
  expect(normalizePhone('(081) 234-5678')).toBe('0812345678')
  expect(normalizePhone('  0812345678  ')).toBe('0812345678')
})

test('converts a +66 country-code form to the domestic 0-prefixed form', () => {
  expect(normalizePhone('+66812345678')).toBe('0812345678')
  expect(normalizePhone('+66 81-234-5678')).toBe('0812345678')
  expect(normalizePhone('66812345678')).toBe('0812345678')
  // "0066…" (IDD-dialled) does not start with 66, so the rule deliberately
  // leaves it alone rather than guessing — it is not a form Makro's export uses.
  expect(normalizePhone('0066812345678')).toBe('0066812345678')
})

test('every formatting of one number collapses to the same key', () => {
  const forms = ['0812345678', '081-234-5678', '081 234 5678', '+66812345678', '+66 81 234 5678']
  const keys = new Set(forms.map(normalizePhone))
  expect(keys.size).toBe(1)
  expect([...keys][0]).toBe('0812345678')
})

test('a short number that merely starts with 66 is NOT treated as a country code', () => {
  // 9 digits or fewer -> too short to be 66 + a local number, so leave it be.
  expect(normalizePhone('661234567')).toBe('661234567')
})

test('input with no digits at all normalizes to an empty string', () => {
  expect(normalizePhone('')).toBe('')
  expect(normalizePhone('   ')).toBe('')
  expect(normalizePhone('-- --')).toBe('')
  expect(normalizePhone('ไม่มีเบอร์')).toBe('')
})
