// The app's version, stamped at build time (vite.config.ts `define`): the build
// date in Thailand plus the short commit, e.g. "v2026.10.11 · 4ce840e". Lets
// the team say exactly which build a phone is running when reporting a problem.

export function formatAppVersion(built: Date, commit?: string): string {
  // en-CA formats as YYYY-MM-DD
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(built)
  const sha = (commit ?? '').trim().slice(0, 7)
  return `v${day.replace(/-/g, '.')}${sha ? ` · ${sha}` : ''}`
}

declare const __APP_VERSION__: string | undefined

/** This build's version ("dev" on the dev server / in tests). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
