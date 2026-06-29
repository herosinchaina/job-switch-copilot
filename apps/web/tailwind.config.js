/** Map design tokens (CSS vars) to Tailwind semantic colors. */
const tok = (v) => `rgb(var(--${v}) / <alpha-value>)`
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: tok('bg'),
        surface: tok('surface'),
        'surface-2': tok('surface-2'),
        border: tok('border'),
        text: tok('text'),
        muted: tok('text-muted'),
        faint: tok('text-faint'),
        accent: tok('accent'),
        'accent-hover': tok('accent-hover'),
        'accent-soft': tok('accent-soft'),
        success: tok('success'),
        danger: tok('danger'),
        warn: tok('warn'),
        ring: tok('ring'),
      },
      borderRadius: { card: '0.875rem', btn: '0.625rem' },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.06)',
        pop: '0 4px 16px rgb(0 0 0 / 0.10)',
      },
    },
  },
  plugins: [],
}
