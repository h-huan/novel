/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/renderer/**/*.{ts,tsx,js,jsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 颜色统一引用 styles/tokens.css 中的 CSS 变量，作为单一来源
        'bg-primary': 'var(--color-bg-primary)',
        'bg-secondary': 'var(--color-bg-secondary)',
        'bg-card': 'var(--color-bg-card)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        border: 'var(--color-border)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
      },
      width: {
        sidebar: '240px',
        'sidebar-collapsed': '56px',
      },
      height: {
        header: '48px',
        statusbar: '28px',
      },
    },
  },
  plugins: [],
};
