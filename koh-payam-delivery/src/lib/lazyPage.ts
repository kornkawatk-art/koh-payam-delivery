import { lazy, type ComponentType } from 'react'

const RELOAD_FLAG = 'kp:chunk-reload'

/**
 * React.lazy for a page, recovering from a stale tab: after a deploy, a tab
 * opened earlier still asks for the previous build's page files, which no
 * longer exist, so the import fails. Reload once to pick up the new build
 * (the flag stops a reload loop if the file is genuinely unreachable, e.g.
 * offline -- then the error surfaces normally).
 */
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await load()
      try {
        sessionStorage.removeItem(RELOAD_FLAG)
      } catch {
        /* storage unavailable: nothing to reset */
      }
      return mod
    } catch (e) {
      let reloaded = false
      try {
        reloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'
        if (!reloaded) sessionStorage.setItem(RELOAD_FLAG, '1')
      } catch {
        reloaded = true // can't remember -- don't risk a loop
      }
      if (!reloaded) {
        window.location.reload()
        return new Promise<never>(() => {}) // the reload replaces the page
      }
      throw e
    }
  })
}
