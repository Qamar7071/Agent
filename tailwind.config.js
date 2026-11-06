/** @type {import('tailwindcss').Config} */
// Palette: the Karakoram itself. Juniper forest green, limestone off-white, cliff ochre,
// Hunza apricot (sparingly, for the road), Attabad lake blue for weather, brick for danger.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Colours that change with the theme are CSS variables (see src/index.css): light by default,
      // dark with the theme switch or the system setting, and always dark inside .mission pages.
      colors: {
        juniper: {
          DEFAULT: 'rgb(var(--c-juniper) / <alpha-value>)',
          950: '#0D2119',
          900: '#123026',
          800: '#173A2E',
          700: 'rgb(var(--c-juniper-700) / <alpha-value>)',
          600: 'rgb(var(--c-juniper-600) / <alpha-value>)',
          500: 'rgb(var(--c-juniper-500) / <alpha-value>)',
          200: 'rgb(var(--c-juniper-200) / <alpha-value>)',
          100: 'rgb(var(--c-juniper-100) / <alpha-value>)',
          50: 'rgb(var(--c-juniper-50) / <alpha-value>)',
        },
        'on-juniper': 'rgb(var(--c-on-juniper) / <alpha-value>)',
        limestone: { DEFAULT: 'rgb(var(--c-limestone) / <alpha-value>)', 200: 'rgb(var(--c-limestone-200) / <alpha-value>)', 300: 'rgb(var(--c-limestone-300) / <alpha-value>)', 400: 'rgb(var(--c-limestone-400) / <alpha-value>)' },
        ink: { DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)', 700: 'rgb(var(--c-ink-700) / <alpha-value>)', 600: 'rgb(var(--c-ink-600) / <alpha-value>)', 500: 'rgb(var(--c-ink-500) / <alpha-value>)' },
        ochre: { DEFAULT: 'rgb(var(--c-ochre) / <alpha-value>)', 700: 'rgb(var(--c-ochre-700) / <alpha-value>)', 100: 'rgb(var(--c-ochre-100) / <alpha-value>)', 50: 'rgb(var(--c-ochre-50) / <alpha-value>)' },
        apricot: { DEFAULT: '#E39A3B', 300: '#F2C27F', 100: 'rgb(var(--c-apricot-100) / <alpha-value>)' },
        lake: { DEFAULT: 'rgb(var(--c-lake) / <alpha-value>)', 700: 'rgb(var(--c-lake-700) / <alpha-value>)', 100: 'rgb(var(--c-lake-100) / <alpha-value>)', 50: 'rgb(var(--c-lake-50) / <alpha-value>)' },
        brick: { DEFAULT: 'rgb(var(--c-brick) / <alpha-value>)', 50: 'rgb(var(--c-brick-50) / <alpha-value>)' },
        paper: 'rgb(var(--c-paper) / <alpha-value>)',
        // Hypothetical / simulated (Travel Twin scenarios): never confused with live data.
        iris: { DEFAULT: 'rgb(var(--c-iris) / <alpha-value>)', 700: 'rgb(var(--c-iris-700) / <alpha-value>)', 100: 'rgb(var(--c-iris-100) / <alpha-value>)', 50: 'rgb(var(--c-iris-50) / <alpha-value>)' },
        // Mission-control accents for the intelligence pages (Travel Twin, Agents, Guardian).
        signal: { green: '#3DDC97', amber: '#F5B841', red: '#FF6B5B', cyan: '#4CC9F0', violet: '#A78BFA' },
      },
      fontFamily: {
        sans: ['Archivo', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        // A classical scale (12 14 16 18 21 24 30 36 48 60 72), with line heights for each.
        xs: ['0.75rem', { lineHeight: '1.1rem' }],
        sm: ['0.875rem', { lineHeight: '1.35rem' }],
        base: ['1rem', { lineHeight: '1.6rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.3125rem', { lineHeight: '1.9rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.3rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.6rem' }],
        '5xl': ['3rem', { lineHeight: '3.2rem' }],
        '6xl': ['3.75rem', { lineHeight: '3.9rem' }],
        '7xl': ['4.5rem', { lineHeight: '4.6rem' }],
      },
      // Radius scale: buttons and fields 12px, cards 20px, feature panels 28px, chips round.
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        md: '10px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '28px',
      },
      // Elevation comes from CSS variables, so the dark theme gets its own deeper shadows.
      boxShadow: {
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
        float: 'var(--shadow-float)',
        glow: '0 12px 32px -12px rgb(227 154 59 / 0.65)',
        'inset-line': 'inset 0 1px 0 rgb(255 255 255 / 0.08)',
      },
      maxWidth: {
        page: '1240px',
        prose: '68ch',
      },
      keyframes: {
        reveal: { from: { clipPath: 'inset(-40% 100% -10% 0)' }, to: { clipPath: 'inset(-40% 0 -10% 0)' } },
        appear: { from: { opacity: 0 }, to: { opacity: 1 } },
        pulseDot: { '0%,80%,100%': { opacity: 0.25 }, '40%': { opacity: 1 } },
        fadeUp: { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'none' } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        toastIn: { from: { opacity: 0, transform: 'translate(-50%, 12px) scale(.98)' }, to: { opacity: 1, transform: 'translate(-50%, 0) scale(1)' } },
        flow: { to: { strokeDashoffset: '-24' } },
        breathe: { '0%,100%': { opacity: 0.55 }, '50%': { opacity: 1 } },
      },
      animation: {
        reveal: 'reveal 2.2s cubic-bezier(.45,.05,.25,1) .3s both',
        appear: 'appear .5s ease-out 1.6s both',
        pulseDot: 'pulseDot 1.2s infinite ease-in-out',
        fadeUp: 'fadeUp .7s cubic-bezier(.2,.7,.2,1) both',
        fadeIn: 'fadeIn .4s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
        toastIn: 'toastIn .28s cubic-bezier(.2,.7,.2,1) both',
        flow: 'flow 1.1s linear infinite',
        breathe: 'breathe 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
