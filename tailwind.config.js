/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        night: { DEFAULT: '#0A1E3A', 900: '#071629', 800: '#0A1E3A', 700: '#10294D', 600: '#173766' },
        brand: { DEFAULT: '#1570EF', 50: '#EEF5FF', 100: '#DCEBFF', 300: '#7FB3FF', 400: '#3D8BFF', 600: '#0E5FD6', 700: '#0B4BAD' },
        ink: { DEFAULT: '#0B1B2E', 700: '#22344A', 600: '#46576B', 500: '#64748B', 400: '#8A97A8' },
        line: '#E5ECF4',
        surface: '#F4F8FC',
        teal: { DEFAULT: '#14B8A6', 50: '#E7FAF7', 600: '#0E9384' },
        sun: { DEFAULT: '#F59E0B', 50: '#FFF6E5' },
        rose: { DEFAULT: '#EF4444', 50: '#FDECEC' },
        leaf: { DEFAULT: '#10B981', 50: '#E8F8F1' },
        glacier: { DEFAULT: '#5FB4FF', 300: '#A9D4FF' },
        snow: '#FFFFFF',
      },
      fontFamily: {
        display: ['Outfit', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        script: ['Caveat', 'cursive'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,27,46,0.04), 0 8px 24px -8px rgba(11,27,46,0.12)',
        lift: '0 24px 48px -16px rgba(11,27,46,0.28)',
        panel: '0 30px 70px -20px rgba(7,22,41,0.45)',
        brand: '0 10px 24px -8px rgba(21,112,239,0.55)',
      },
      keyframes: {
        kenburns: { '0%': { transform: 'scale(1.06)' }, '100%': { transform: 'scale(1)' } },
        rise: { '0%': { opacity: 0, transform: 'translateY(16px)' }, '100%': { opacity: 1, transform: 'none' } },
        pulseDot: { '0%,80%,100%': { opacity: 0.25, transform: 'translateY(0)' }, '40%': { opacity: 1, transform: 'translateY(-3px)' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
      },
      animation: {
        kenburns: 'kenburns 16s ease-out forwards',
        rise: 'rise .7s cubic-bezier(.2,.7,.2,1) both',
        pulseDot: 'pulseDot 1.2s infinite ease-in-out',
        shimmer: 'shimmer 1.6s infinite linear',
      },
    },
  },
  plugins: [],
};
