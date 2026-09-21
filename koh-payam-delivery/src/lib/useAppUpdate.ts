import { useEffect, useState } from 'react'

// Vite fingerprints the entry bundle (assets/index-<hash>.js). A tab left open
// across a deploy keeps running the OLD bundle, so a stale tab can quietly
// import files / save data with logic that has since been fixed. Comparing the
// bundle this tab loaded with the one the server now serves is enough to know.
const BUNDLE_RE = /\/assets\/index-[A-Za-z0-9_-]+\.js/

export function loadedBundle(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]')
  return el ? new URL(el.src, location.href).pathname : null
}

/** true once the server is serving a newer build than the one this tab is running. */
export function useAppUpdate(intervalMs = 10 * 60 * 1000): boolean {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    const current = loadedBundle()
    if (!current) return // dev server / tests: no hashed bundle to compare against
    let active = true

    async function check() {
      try {
        const res = await fetch(import.meta.env.BASE_URL || '/', { cache: 'no-store' })
        if (!res.ok) return
        const latest = (await res.text()).match(BUNDLE_RE)?.[0]
        if (active && latest && latest !== current) setStale(true)
      } catch {
        // offline / flaky island signal: try again on the next trigger
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }

    void check()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    const timer = setInterval(check, intervalMs)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
      clearInterval(timer)
    }
  }, [intervalMs])

  return stale
}
