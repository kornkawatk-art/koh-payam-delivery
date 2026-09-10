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
