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
        'bg-primary': '#1a1a2e',
        'bg-secondary': '#16213e',
        'bg-card': '#0f3460',
        accent: '#e94560',
        'accent-hover': '#ff6b81',
        'text-primary': '#eaeaea',
        'text-secondary': '#a0a0b0',
        'text-muted': '#6c6c80',
        border: '#2a2a4a',
        success: '#2ecc71',
        warning: '#f39c12',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: [
          '"Cascadia Code"',
          '"Fira Code"',
          '"JetBrains Mono"',
          'monospace',
        ],
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
