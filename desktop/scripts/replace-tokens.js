/**
 * 批量替换脚本：把 TSX/TS 里的硬编码颜色/字体替换成 CSS 变量引用
 * 运行：node scripts/replace-tokens.js
 * 排除：styles/theme.ts（颜色定义）、styles/tokens.css（变量定义）
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'renderer');
const EXCLUDE = ['styles/theme.ts', 'styles/tokens.css'];

// 颜色映射：硬编码值 → CSS 变量
// 按长度降序排列，避免短值先匹配（如 #fff 不应匹配 #ffffff 的子串，但实际是独立字符串）
const colorMap = {
  // ===== 背景色 =====
  '#1a1a2e': 'var(--color-bg-primary)',
  '#16213e': 'var(--color-bg-secondary)',
  '#0f3460': 'var(--color-bg-card)',
  '#2a2a4a': 'var(--color-border)',
  '#3a3a5e': 'var(--color-border-strong)',
  // 深色背景变体（归入主/次背景）
  '#0f172a': 'var(--color-bg-primary)',
  '#111827': 'var(--color-bg-primary)',
  '#020617': 'var(--color-bg-primary)',
  '#0a0a0f': 'var(--color-bg-primary)',
  '#0a0a12': 'var(--color-bg-primary)',
  '#0f0f23': 'var(--color-bg-primary)',
  '#12121f': 'var(--color-bg-primary)',
  '#121225': 'var(--color-bg-primary)',
  '#12122a': 'var(--color-bg-primary)',
  '#15151c': 'var(--color-bg-primary)',
  '#161628': 'var(--color-bg-primary)',
  '#16162a': 'var(--color-bg-primary)',
  '#17172a': 'var(--color-bg-primary)',
  '#1e1e28': 'var(--color-bg-primary)',
  '#1e1e32': 'var(--color-bg-primary)',
  '#1e1e36': 'var(--color-bg-primary)',
  // 次级背景变体
  '#1e293b': 'var(--color-bg-secondary)',
  '#131b36': 'var(--color-bg-secondary)',
  '#171c31': 'var(--color-bg-secondary)',
  '#17213b': 'var(--color-bg-secondary)',
  '#181e34': 'var(--color-bg-secondary)',
  '#1b213a': 'var(--color-bg-secondary)',
  '#1d2a3a': 'var(--color-bg-secondary)',
  // elevated 背景变体
  '#334155': 'var(--color-bg-elevated)',
  '#2a2a36': 'var(--color-bg-elevated)',
  '#2a2a3e': 'var(--color-bg-elevated)',
  '#2e2e3a': 'var(--color-bg-elevated)',
  '#374151': 'var(--color-bg-elevated)',
  '#3a3a48': 'var(--color-bg-elevated)',
  '#3a3a50': 'var(--color-bg-elevated)',
  '#303b60': 'var(--color-bg-card)',
  '#3a456d': 'var(--color-bg-card)',

  // ===== 文字色 =====
  '#eaeaea': 'var(--color-text-primary)',
  '#e0e0e0': 'var(--color-text-primary)',
  '#e8e8f0': 'var(--color-text-primary)',
  '#a0a0b0': 'var(--color-text-secondary)',
  '#94a3b8': 'var(--color-text-secondary)',
  '#95a0c0': 'var(--color-text-secondary)',
  '#6c6c80': 'var(--color-text-muted)',
  '#5a5a70': 'var(--color-text-muted)',
  '#4a4a60': 'var(--color-text-muted)',
  '#5c5c70': 'var(--color-text-muted)',
  '#95a5a6': 'var(--color-text-muted)',
  '#64748b': 'var(--color-text-muted)',
  '#8a8aa0': 'var(--color-text-dim)',
  '#9a9ab0': 'var(--color-text-dim)',
  '#7a7a90': 'var(--color-text-dim)',
  '#c0c0d0': 'var(--color-text-soft)',
  '#c8c8d0': 'var(--color-text-soft)',
  '#d0d0e0': 'var(--color-text-soft)',
  '#cbd5e1': 'var(--color-text-soft)',
  '#ffffff': 'var(--color-white)',
  '#fff': 'var(--color-white)',

  // ===== 强调/品牌色 =====
  '#e94560': 'var(--color-accent)',
  '#ff6b81': 'var(--color-accent-hover)',
  '#f43f5e': 'var(--color-accent)',

  // ===== 信息/蓝色 =====
  '#3b76c3': 'var(--color-info)',
  '#6cb6ff': 'var(--color-info-light)',
  '#3498db': 'var(--color-info)',
  '#3b82f6': 'var(--color-info)',
  '#3a6ea5': 'var(--color-info)',
  '#2980b9': 'var(--color-info)',
  '#60a5fa': 'var(--color-info-light)',
  '#93c5fd': 'var(--color-info-light)',

  // ===== 语义色：成功 =====
  '#2ecc71': 'var(--color-success)',
  '#22c55e': 'var(--color-success)',
  '#27ae60': 'var(--color-success)',
  '#10b981': 'var(--color-success)',
  '#4ade80': 'var(--color-success)',
  '#86efac': 'var(--color-success)',
  '#07c160': 'var(--color-success)',
  '#059669': 'var(--color-success)',
  '#1a8c5c': 'var(--color-success)',

  // ===== 语义色：警告 =====
  '#f39c12': 'var(--color-warning)',
  '#f59e0b': 'var(--color-warning)',
  '#eab308': 'var(--color-warning)',
  '#fbbf24': 'var(--color-warning)',
  '#facc15': 'var(--color-warning)',
  '#e67e22': 'var(--color-warning)',
  '#d68910': 'var(--color-warning)',
  '#b45309': 'var(--color-warning)',
  '#f5a623': 'var(--color-warning)',

  // ===== 语义色：危险 =====
  '#e74c3c': 'var(--color-danger)',
  '#ef4444': 'var(--color-danger)',
  '#c0392b': 'var(--color-danger)',
  '#f87171': 'var(--color-danger)',
  '#ff4444': 'var(--color-danger)',
  '#ff6b6b': 'var(--color-danger)',
  '#b91c1c': 'var(--color-danger)',

  // ===== 紫色/粉色 =====
  '#a855f7': 'var(--color-purple)',
  '#9b59b6': 'var(--color-purple)',
  '#8b5cf6': 'var(--color-purple)',
  '#a78bfa': 'var(--color-purple)',
  '#d8b4fe': 'var(--color-purple)',
  '#c084fc': 'var(--color-purple)',
  '#6366f1': 'var(--color-purple)',
  '#ec4899': 'var(--color-pink)',
  '#f472b6': 'var(--color-pink)',
};

// 字体映射
const fontMap = {
  "'monospace'": "'var(--font-mono)'",
  '"monospace"': '"var(--font-mono)"',
  "'-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif'": "'var(--font-sans)'",
  "'system-ui, sans-serif'": "'var(--font-sans)'",
};

function walk(dir, ext) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(walk(full, ext));
    else if (ext.some(e => entry.name.endsWith(e))) results.push(full);
  }
  return results;
}

const files = walk(SRC, ['.tsx', '.ts']).filter(f =>
  !EXCLUDE.some(ex => f.replace(/\\/g, '/').endsWith(ex.replace(/\\/g, '/')))
);

let totalColorReplaced = 0;
let totalFontReplaced = 0;
const fileStats = [];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  let colorCount = 0;
  let fontCount = 0;

  // 替换颜色（大小写不敏感）
  for (const [hex, variable] of Object.entries(colorMap)) {
    const regex = new RegExp(hex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = content.match(regex);
    if (matches) {
      colorCount += matches.length;
      content = content.replace(regex, variable);
    }
  }

  // 替换字体
  for (const [oldFont, newFont] of Object.entries(fontMap)) {
    if (content.includes(oldFont)) {
      fontCount += (content.match(new RegExp(oldFont.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      content = content.split(oldFont).join(newFont);
    }
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    totalColorReplaced += colorCount;
    totalFontReplaced += fontCount;
    fileStats.push({ file: path.relative(SRC, file), colorCount, fontCount });
  }
}

console.log('\n========== 批量替换完成 ==========');
console.log(`处理文件数: ${files.length}`);
console.log(`修改文件数: ${fileStats.length}`);
console.log(`颜色替换总数: ${totalColorReplaced}`);
console.log(`字体替换总数: ${totalFontReplaced}`);
console.log('\n各文件替换明细:');
fileStats.sort((a, b) => (b.colorCount + b.fontCount) - (a.colorCount + a.fontCount));
for (const s of fileStats) {
  console.log(`  颜色${String(s.colorCount).padStart(4)} 字体${String(s.fontCount).padStart(3)}  ${s.file}`);
}
