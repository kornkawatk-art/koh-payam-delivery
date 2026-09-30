import { lazyPage } from './lazyPage'

// Exercise the loader React.lazy wraps (its internal _payload._result).
const loaderOf = (c: unknown) => (c as { _payload: { _result: () => Promise<unknown> } })._payload._result

beforeEach(() => sessionStorage.clear())

test('a stale-tab chunk failure reloads the page once', async () => {
  const reload = vi.fn()
  Object.defineProperty(window, 'location', { value: { reload }, configurable: true })
  const Page = lazyPage(() => Promise.reject(new Error('Failed to fetch dynamically imported module')))
  void loaderOf(Page)()
  await new Promise((r) => setTimeout(r, 0))
  expect(reload).toHaveBeenCalledTimes(1)
  expect(sessionStorage.getItem('kp:chunk-reload')).toBe('1')
})

test('after one reload, a repeat failure surfaces instead of looping', async () => {
  const reload = vi.fn()
  Object.defineProperty(window, 'location', { value: { reload }, configurable: true })
  sessionStorage.setItem('kp:chunk-reload', '1')
  const Page = lazyPage(() => Promise.reject(new Error('offline')))
  await expect(loaderOf(Page)()).rejects.toThrow('offline')
  expect(reload).not.toHaveBeenCalled()
})

test('a successful load clears the reload flag', async () => {
  sessionStorage.setItem('kp:chunk-reload', '1')
  const Page = lazyPage(() => Promise.resolve({ default: () => null }))
  await loaderOf(Page)()
  expect(sessionStorage.getItem('kp:chunk-reload')).toBeNull()
})
