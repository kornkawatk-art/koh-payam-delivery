import { applyTheme, getTheme, setTheme } from './theme'

const meta = () => document.querySelector('meta[name="theme-color"]')!

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.head.innerHTML = '<meta name="theme-color" content="#fbfbfa" />'
  vi.restoreAllMocks()
})

test('light by default, whatever the OS prefers', () => {
  expect(getTheme()).toBe('light')
})

test('falls back to light when storage throws (private mode)', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied')
  })
  expect(getTheme()).toBe('light')
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied')
  })
  expect(() => setTheme('dark')).not.toThrow()
})

test('remembers the choice on this device', () => {
  setTheme('dark')
  expect(getTheme()).toBe('dark')
  setTheme('light')
  expect(getTheme()).toBe('light')
})

test('applyTheme sets and clears the html attribute and the browser bar colour', () => {
  applyTheme('dark')
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(meta().getAttribute('content')).toBe('#121212')
  applyTheme(null)
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  expect(meta().getAttribute('content')).toBe('#fbfbfa')
})
