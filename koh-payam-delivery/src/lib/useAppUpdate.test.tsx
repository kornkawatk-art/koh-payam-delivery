import { renderHook, waitFor, act } from '@testing-library/react'
import { useAppUpdate, loadedBundle } from './useAppUpdate'

const addBundle = (name: string) => {
  const s = document.createElement('script')
  s.src = `/assets/${name}.js`
  document.head.appendChild(s)
  return s
}
const serve = (html: string, ok = true) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, text: async () => html }))

afterEach(() => {
  document.head.querySelectorAll('script').forEach((s) => s.remove())
  vi.unstubAllGlobals()
})

test('no hashed bundle (dev server / tests): never checks, never reports stale', () => {
  serve('<script src="/assets/index-NEW.js"></script>')
  const { result } = renderHook(() => useAppUpdate())
  expect(result.current).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
})

test('loadedBundle reads the running entry bundle path', () => {
  expect(loadedBundle()).toBeNull()
  addBundle('index-OLD123')
  expect(loadedBundle()).toBe('/assets/index-OLD123.js')
})

test('reports stale when the server now serves a different bundle', async () => {
  addBundle('index-OLD123')
  serve('<html><script type="module" src="/assets/index-NEW456.js"></script></html>')
  const { result } = renderHook(() => useAppUpdate())
  await waitFor(() => expect(result.current).toBe(true))
  expect(fetch).toHaveBeenCalledWith('/', { cache: 'no-store' })
})

test('stays up to date when the server serves the same bundle', async () => {
  addBundle('index-SAME99')
  serve('<script type="module" src="/assets/index-SAME99.js"></script>')
  const { result } = renderHook(() => useAppUpdate())
  await waitFor(() => expect(fetch).toHaveBeenCalled())
  expect(result.current).toBe(false)
})

test('ignores failed / non-ok / unparseable responses instead of crying wolf', async () => {
  addBundle('index-OLD123')
  serve('<html>no bundle here</html>')
  const { result, unmount } = renderHook(() => useAppUpdate())
  await waitFor(() => expect(fetch).toHaveBeenCalled())
  expect(result.current).toBe(false)
  unmount()

  serve('<script src="/assets/index-NEW456.js"></script>', false)
  const r2 = renderHook(() => useAppUpdate())
  await waitFor(() => expect(fetch).toHaveBeenCalled())
  expect(r2.result.current).toBe(false)
  r2.unmount()

  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  const r3 = renderHook(() => useAppUpdate())
  await waitFor(() => expect(fetch).toHaveBeenCalled())
  expect(r3.result.current).toBe(false)
})

test('re-checks when the tab becomes visible again (the "left open overnight" case)', async () => {
  addBundle('index-OLD123')
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '<script src="/assets/index-OLD123.js"></script>' })
  vi.stubGlobal('fetch', fetchMock)
  const { result } = renderHook(() => useAppUpdate())
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  expect(result.current).toBe(false)

  // a deploy happens while the tab sits in the background
  fetchMock.mockResolvedValue({ ok: true, text: async () => '<script src="/assets/index-NEWER7.js"></script>' })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await waitFor(() => expect(result.current).toBe(true))
})
