/**
 * 设计令牌（JS 常量版）
 *
 * 与 styles/tokens.css 中的 CSS 变量保持一致，作为单一来源。
 * 用于不支持 CSS 变量的场景（如 Monaco 编辑器主题 defineTheme）。
 *
 * 修改颜色时：tokens.css 和本文件必须同步修改。
 * Monaco 主题颜色必须用 #RRGGBB / #RRGGBBAA 十六进制，
 * 不要用 rgba() 字符串（Monaco 不识别，会回退成纯红 #ff0000）。
 */

export const COLORS = {
  bg: {
    primary: '#1a1a2e',
    secondary: '#16213e',
    card: '#0f3460',
    elevated: '#2a2a4a',
  },
  text: {
    primary: '#eaeaea',
    secondary: '#a0a0b0',
    muted: '#6c6c80',
    dim: '#8a8aa0',
    soft: '#c0c0d0',
    white: '#ffffff',
  },
  accent: {
    primary: '#e94560',
    hover: '#ff6b81',
  },
  info: {
    primary: '#3b76c3',
    light: '#6cb6ff',
  },
  semantic: {
    success: '#2ecc71',
    warning: '#f39c12',
    danger: '#e74c3c',
  },
  border: {
    default: '#2a2a4a',
    strong: '#3a3a5e',
  },
  transparent: '#00000000',
} as const;

/** 带透明度的信息蓝（用于选中/高亮背景，#RRGGBBAA 格式） */
export const INFO_ALPHA = {
  15: '#3776c326',
  18: '#3776c32e',
  22: '#3776c338',
  35: '#3776c359',
  40: '#3776c366',
  50: '#3b76c380',
  60: '#3b76c399',
} as const;

/** 滚动条滑块灰色（带透明度） */
export const SCROLLBAR_ALPHA = {
  30: '#6c6c804d',
  50: '#6c6c8080',
  70: '#6c6c80b3',
} as const;

export const FONTS = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  mono: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
} as const;

export const RADIUS = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  full: '9999px',
} as const;

export const SPACING = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
} as const;
