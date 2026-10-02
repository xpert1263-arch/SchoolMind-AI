/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: token('--c-canvas'),
        surface: {
          DEFAULT: token('--c-surface'),
          muted: token('--c-surface-muted'),
          sunken: token('--c-surface-sunken'),
          raised: token('--c-surface-raised'),
        },
        line: {
          DEFAULT: token('--c-line'),
          strong: token('--c-line-strong'),
        },
        ink: {
          DEFAULT: token('--c-text'),
          muted: token('--c-text-muted'),
          subtle: token('--c-text-subtle'),
        },
        accent: {
          DEFAULT: token('--c-accent'),
          hover: token('--c-accent-hover'),
          contrast: token('--c-accent-contrast'),
          soft: token('--c-accent-soft'),
          text: token('--c-accent-text'),
          line: token('--c-accent-line'),
        },
        success: {
          DEFAULT: token('--c-success'),
          soft: token('--c-success-soft'),
          text: token('--c-success-text'),
          line: token('--c-success-line'),
        },
        warn: {
          DEFAULT: token('--c-warn'),
          soft: token('--c-warn-soft'),
          text: token('--c-warn-text'),
          line: token('--c-warn-line'),
        },
        danger: {
          DEFAULT: token('--c-danger'),
          soft: token('--c-danger-soft'),
          text: token('--c-danger-text'),
          line: token('--c-danger-line'),
        },
        info: {
          DEFAULT: token('--c-info'),
          soft: token('--c-info-soft'),
          text: token('--c-info-text'),
          line: token('--c-info-line'),
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      borderRadius: {
        sm: '0.375rem',
        DEFAULT: '0.5rem',
        md: '0.625rem',
        lg: '0.75rem',
        xl: '1rem',
      },
      boxShadow: {
        subtle: 'var(--shadow-subtle)',
        raised: 'var(--shadow-raised)',
        overlay: 'var(--shadow-overlay)',
      },
      transitionTimingFunction: {
        swift: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out both',
      },
    },
  },
  plugins: [],
};
