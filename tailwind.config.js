/** @type {import('tailwindcss').Config} */
// Palette: the Karakoram itself. Juniper forest green, limestone off-white, cliff ochre,
// Hunza apricot (sparingly, for the road), Attabad lake blue for weather, brick for danger.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        juniper: {
          DEFAULT: '#173A2E',
          950: '#0D2119',
          900: '#123026',
          800: '#173A2E',
          700: '#1F4A3B',
          600: '#2A6150',
          500: '#3B7A65',
          200: '#BFD6CA',
          100: '#DCE8E1',
          50: '#EEF4F0',
        },
        limestone: { DEFAULT: '#F5F6F1', 200: '#E9EBE3', 300: '#D6DACF', 400: '#B9BFB1' },
        ink: { DEFAULT: '#17211C', 700: '#2E3A33', 600: '#46524B', 500: '#58625A' },
        ochre: { DEFAULT: '#8C5A24', 700: '#6E4518', 100: '#F3E7D6', 50: '#FAF4EA' },
        apricot: { DEFAULT: '#E39A3B', 300: '#F2C27F', 100: '#FBEBD3' },
        lake: { DEFAULT: '#1C6E78', 700: '#14565E', 100: '#D7ECEE', 50: '#ECF6F7' },
        brick: { DEFAULT: '#A3321F', 50: '#FBECE8' },
        paper: '#FFFFFF',
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
      borderRadius: {
        sm: '3px',
        DEFAULT: '5px',
        md: '7px',
        lg: '10px',
      },
      maxWidth: {
        page: '1240px',
        prose: '68ch',
      },
      keyframes: {
        reveal: { from: { clipPath: 'inset(-40% 100% -10% 0)' }, to: { clipPath: 'inset(-40% 0 -10% 0)' } },
        appear: { from: { opacity: 0 }, to: { opacity: 1 } },
        pulseDot: { '0%,80%,100%': { opacity: 0.25 }, '40%': { opacity: 1 } },
      },
      animation: {
        reveal: 'reveal 2.2s cubic-bezier(.45,.05,.25,1) .3s both',
        appear: 'appear .5s ease-out 1.6s both',
        pulseDot: 'pulseDot 1.2s infinite ease-in-out',
      },
    },
  },
  plugins: [],
};
