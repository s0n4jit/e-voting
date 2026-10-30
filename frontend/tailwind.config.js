/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (name, shades) => Object.fromEntries(shades.map((s) => [s, v(`${name}-${s}`)]));
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens (see index.css for the light / dark values)
        bg: v('bg'),
        surface: v('surface'),
        recessed: v('recessed'),
        line: v('line'),
        fg: v('fg'),
        muted: v('muted'),
        brand: { DEFAULT: v('brand'), hover: v('brand-hover'), soft: v('brand-soft'), fg: v('brand-fg') },
        ok: { DEFAULT: v('ok'), soft: v('ok-soft') },
        warn: { DEFAULT: v('warn'), soft: v('warn-soft') },
        bad: { DEFAULT: v('bad'), soft: v('bad-soft') },

        // Legacy palettes. slate/gray flip automatically in dark mode.
        slate: scale('slate', SHADES),
        gray: scale('slate', SHADES),
        primary: {
          50: '#eef1fb', 100: '#dde3f7', 200: '#bcc8ef', 300: '#92a4e3', 400: '#6679d3',
          500: '#4757c0', 600: '#38459f', 700: '#2e387f', 800: '#262e66', 900: '#1f2552', 950: '#131733',
        },
        success: {
          50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80',
          500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d',
        },
        danger: {
          50: '#fdf3f3', 100: '#fbe4e4', 200: '#f6c9c9', 300: '#eea3a3', 400: '#e27474',
          500: '#d24b4b', 600: '#b93a3a', 700: '#982f2f', 800: '#7d2b2b', 900: '#682828',
        },
        warning: {
          50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24',
          500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f',
        },
        campus: { bg: v('bg'), card: v('surface'), border: v('line'), text: v('fg'), muted: v('muted'), accent: v('brand') },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(var(--shadow) / 0.06)',
        'card-hover': '0 4px 14px -2px rgb(var(--shadow) / 0.12)',
        modal: '0 24px 48px -12px rgb(var(--shadow) / 0.28)',
      },
      animation: {
        'fade-in': 'fadeIn 0.18s ease-out backwards',
        'slide-up': 'slideUp 0.28s cubic-bezier(0.22, 1, 0.36, 1) backwards',
        'page-in': 'pageIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) backwards',
        'pop-in': 'popIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) backwards',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
        'draw-check': 'drawCheck 0.5s 0.15s ease-out forwards',
        'ring-out': 'ringOut 0.9s ease-out forwards',
        'step-next': 'stepNext 0.35s cubic-bezier(0.22, 1, 0.36, 1) backwards',
        'step-prev': 'stepPrev 0.35s cubic-bezier(0.22, 1, 0.36, 1) backwards',
        'ballot-drop': 'ballotDrop 1.6s ease-in-out infinite',
        'winner-pop': 'winnerPop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
        pageIn: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        popIn: { from: { opacity: '0', transform: 'scale(0.94)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '0%': { opacity: '0.55' }, '50%': { opacity: '1' }, '100%': { opacity: '0.55' } },
        stepNext: { from: { opacity: '0', transform: 'translateX(28px)' }, to: { opacity: '1', transform: 'none' } },
        stepPrev: { from: { opacity: '0', transform: 'translateX(-28px)' }, to: { opacity: '1', transform: 'none' } },
        ballotDrop: {
          '0%': { transform: 'translateY(-26px)', opacity: '0' },
          '25%': { opacity: '1' },
          '70%': { transform: 'translateY(14px)', opacity: '1' },
          '100%': { transform: 'translateY(22px)', opacity: '0' },
        },
        winnerPop: { '0%': { transform: 'scale(1)' }, '45%': { transform: 'scale(1.14)' }, '100%': { transform: 'scale(1.06)' } },
        drawCheck: { to: { strokeDashoffset: '0' } },
        ringOut: { from: { opacity: '0.5', transform: 'scale(0.6)' }, to: { opacity: '0', transform: 'scale(2.2)' } },
      },
    },
  },
  plugins: [],
};
