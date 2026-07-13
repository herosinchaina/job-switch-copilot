/** Map design tokens (CSS vars) to Tailwind semantic colors. */
const tok = (v) => `rgb(var(--${v}) / <alpha-value>)`
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: tok('bg'),
        'bg-2': tok('bg-2'),
        surface: tok('surface'),
        'surface-2': tok('surface-2'),
        border: tok('border'),
        'border-strong': tok('border-strong'),
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
      borderRadius: { card: '1.25rem', 'card-lg': '1.5rem', hero: '1.75rem', btn: '0.625rem', pill: '99px' },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.3), 0 8px 26px -12px rgb(0 0 0 / 0.6)',
        pop: '0 4px 16px rgb(0 0 0 / 0.4)',
        lift: '0 10px 30px -8px rgb(0 0 0 / 0.55), 0 30px 70px -30px rgb(0 0 0 / 0.8)',
      },
    },
  },
  plugins: [],
}
