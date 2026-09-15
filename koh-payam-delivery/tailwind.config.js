/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
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
      colors: {
        paper: '#faf9f7',
        surface: '#ffffff',
        ink: {
          DEFAULT: '#1c1917',
          soft: '#57534e',
          faint: '#a8a29e',
        },
        line: {
          DEFAULT: '#e7e5e4',
          strong: '#d6d3d1',
        },
        brand: {
          DEFAULT: '#9a6a1c',
          ink: '#7c5214',
          soft: '#f6efe1',
        },
        ok: {
          DEFAULT: '#15803d',
          ink: '#166534',
          soft: '#ecfdf3',
        },
        warn: {
          DEFAULT: '#b45309',
          ink: '#9a3412',
          soft: '#fff5e9',
        },
        danger: {
          DEFAULT: '#b91c1c',
          ink: '#991b1b',
          soft: '#fef2f2',
        },
        info: {
          DEFAULT: '#1d4ed8',
          ink: '#1e40af',
          soft: '#eff4ff',
        },
        // Vivid, jewel-toned identity colors -- decorative accents (nav icons,
        // section highlights), never status/semantic meaning (that stays
        // ok/warn/danger/info above). Chosen distinctly from those four hues
        // so an accent chip next to a status badge never reads as a status.
        // One color per team nav destination, in src/lib/roles.ts's NAV order;
        // `line` intentionally reuses LINE's own brand green so the LINE
        // registrations menu is instantly recognizable.
        accent: {
          indigo: { DEFAULT: '#4f46e5', soft: '#eef2ff' },
          emerald: { DEFAULT: '#059669', soft: '#ecfdf5' },
          amber: { DEFAULT: '#d97706', soft: '#fffbeb' },
          teal: { DEFAULT: '#0d9488', soft: '#f0fdfa' },
          rose: { DEFAULT: '#e11d48', soft: '#fff1f2' },
          line: { DEFAULT: '#06c755', soft: '#eafff2' },
          slate: { DEFAULT: '#475569', soft: '#f1f5f9' },
        },
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(28 25 23 / 0.04), 0 1px 3px 0 rgb(28 25 23 / 0.06)',
        pop: '0 8px 30px -8px rgb(28 25 23 / 0.18)',
      },
      maxWidth: {
        page: '64rem',
      },
    },
  },
  plugins: [],
}
