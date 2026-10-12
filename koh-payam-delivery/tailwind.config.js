/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // PO numbers, phones, money, counts (.num); Thai inside falls back to Plex
        mono: ['"JetBrains Mono"', '"IBM Plex Sans Thai"', 'ui-monospace', 'monospace'],
        sans: [
          'Inter',
          '"IBM Plex Sans Thai"',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
      // Every colour is a CSS variable (RGB channels, src/index.css) so dark
      // mode only redefines the variables and opacity modifiers keep working.
      colors: {
        paper: 'rgb(var(--c-paper) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        on: 'rgb(var(--c-on) / <alpha-value>)',
        ink: { DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)', soft: 'rgb(var(--c-ink-soft) / <alpha-value>)', faint: 'rgb(var(--c-ink-faint) / <alpha-value>)' },
        line: { DEFAULT: 'rgb(var(--c-line) / <alpha-value>)', strong: 'rgb(var(--c-line-strong) / <alpha-value>)' },
        brand: { DEFAULT: 'rgb(var(--c-brand) / <alpha-value>)', ink: 'rgb(var(--c-brand-ink) / <alpha-value>)', soft: 'rgb(var(--c-brand-soft) / <alpha-value>)' },
        ok: { DEFAULT: 'rgb(var(--c-ok) / <alpha-value>)', ink: 'rgb(var(--c-ok-ink) / <alpha-value>)', soft: 'rgb(var(--c-ok-soft) / <alpha-value>)' },
        warn: { DEFAULT: 'rgb(var(--c-warn) / <alpha-value>)', ink: 'rgb(var(--c-warn-ink) / <alpha-value>)', soft: 'rgb(var(--c-warn-soft) / <alpha-value>)' },
        danger: { DEFAULT: 'rgb(var(--c-danger) / <alpha-value>)', ink: 'rgb(var(--c-danger-ink) / <alpha-value>)', soft: 'rgb(var(--c-danger-soft) / <alpha-value>)' },
        info: { DEFAULT: 'rgb(var(--c-info) / <alpha-value>)', ink: 'rgb(var(--c-info-ink) / <alpha-value>)', soft: 'rgb(var(--c-info-soft) / <alpha-value>)' },
      },
      borderRadius: {
        xl: '0.5rem',
        '2xl': '0.625rem',
      },
      boxShadow: {
        card: 'none', // borders carry the edges, Supabase-style
        pop: '0 8px 24px -12px rgb(0 0 0 / 0.25)',
      },
      maxWidth: {
        page: '64rem',
      },
    },
  },
  plugins: [],
}
