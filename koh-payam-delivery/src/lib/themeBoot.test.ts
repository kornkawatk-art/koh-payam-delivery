import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// index.html applies a stored dark theme before the app loads, so a reload
// in dark mode doesn't flash light. It must skip pages that are always light.
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
const code = html.match(/<script id="theme-boot">([\s\S]*?)<\/script>/)?.[1] ?? ''

function boot(pathname: string, stored: string | null | 'throw') {
  const root = document.createElement('html')
  const meta = document.createElement('meta')
  const doc = {
    documentElement: root,
    querySelector: () => meta,
  }
  const storage = {
    getItem: () => {
      if (stored === 'throw') throw new Error('denied')
      return stored
    },
  }
  new Function('location', 'localStorage', 'document', code)({ pathname }, storage, doc)
  return { theme: root.getAttribute('data-theme'), bar: meta.getAttribute('content') }
}

test('the boot script exists', () => {
  expect(code).toContain('localStorage')
})

test('team pages start dark when this device chose dark', () => {
  expect(boot('/', 'dark')).toEqual({ theme: 'dark', bar: '#121212' })
  expect(boot('/order/abc/pack', 'dark').theme).toBe('dark')
})

test('always-light pages and light devices stay light', () => {
  for (const p of ['/login', '/2fa', '/2fa/setup', '/o/tok123', '/help', '/liff/register'])
    expect(boot(p, 'dark').theme).toBeNull()
  expect(boot('/', 'light').theme).toBeNull()
  expect(boot('/', null).theme).toBeNull()
  expect(boot('/', 'throw').theme).toBeNull()
})
