/// <reference types="vitest" />
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { formatAppVersion } from './src/lib/appVersion'

// The commit this build comes from: Vercel passes it in; a local build asks git.
function buildCommit(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Stamped into production builds only; the dev server and tests show "dev".
  define:
    command === 'build'
      ? { __APP_VERSION__: JSON.stringify(formatAppVersion(new Date(), buildCommit())) }
      : {},
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}))
