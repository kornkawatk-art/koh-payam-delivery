// Team-page colour theme (spec docs/superpowers/specs/2026-10-12-supabase-style-redesign.md).
// Light unless this device chose dark; the OS setting is deliberately ignored
// (pier staff work in sunlight). Only AppShell applies it, so login, 2FA and
// customer pages always stay light.

export type Theme = 'light' | 'dark'

const KEY = 'theme'
const BAR: Record<Theme, string> = { light: '#fbfbfa', dark: '#121212' }

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    // storage blocked (private mode): the choice lasts for this page only
  }
}

/** Set (or with null, clear) the theme on <html> and the browser bar colour. */
export function applyTheme(t: Theme | null): void {
  const root = document.documentElement
  if (t === 'dark') root.dataset.theme = 'dark'
  else root.removeAttribute('data-theme')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[t ?? 'light'])
}
