import React from 'react';

/**
 * 统一布局工具：深色主题、卡片+列表、按内容/宽度自适应、不拥挤。
 * 所有"世界观/角色/地点与势力/大纲/伏笔"页面共用，保证视觉与交互一致。
 */

export const LK: Record<string, React.CSSProperties> = {
  page: { padding: '20px 24px', maxWidth: 1280, margin: '0 auto', width: '100%', boxSizing: 'border-box' as const },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' as const, marginBottom: 18 },
  title: { margin: 0, fontSize: 20, color: '#e8e8f0', fontWeight: 600 },
  subtitle: { color: '#8a8aa0', margin: '6px 0 0', fontSize: 14, lineHeight: 1.5 },
  card: { border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.02)', overflow: 'hidden', marginBottom: 12 },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.015)' },
  cardTitle: { margin: 0, fontSize: 14, color: '#e8e8f0', fontWeight: 600 },
  cardBody: { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
  kvRow: { display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 10, fontSize: 14, lineHeight: 1.6 },
  kvKey: { color: '#8a8aa0', flexShrink: 0 },
  kvVal: { color: '#d0d0e0', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const },
  tag: { display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 999, fontSize: 14, border: '1px solid rgba(255,255,255,0.12)', color: '#c0c0d0', backgroundColor: 'rgba(255,255,255,0.04)' },
  muted: { color: '#8a8aa0', fontSize: 14 },
};

export const gridStyle = (min = 260, gap = 14): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
  gap,
});

export const CardGrid: React.FC<{ min?: number; gap?: number; style?: React.CSSProperties; children?: React.ReactNode }> = ({ min = 260, gap = 14, style, children }) => (
  <div style={{ ...gridStyle(min, gap), ...style }}>{children}</div>
);

export const Card: React.FC<{
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  span?: boolean;
  bodyStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ title, subtitle, actions, span, bodyStyle, style, children }) => (
  <section style={{ ...LK.card, ...(span ? { gridColumn: '1 / -1' } : null), ...style }}>
    {(title || actions) && (
      <header style={LK.cardHead}>
        <div style={{ minWidth: 0 }}>
          {title && <h3 style={LK.cardTitle}>{title}</h3>}
          {subtitle && <p style={{ ...LK.subtitle, margin: '4px 0 0', fontSize: 14 }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>{actions}</div>}
      </header>
    )}
    <div style={{ ...LK.cardBody, ...bodyStyle }}>{children}</div>
  </section>
);

export const KVList: React.FC<{ items: Array<{ label: string; value?: React.ReactNode }>; min?: number }> = ({ items, min = 96 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {items.filter(i => i.value !== undefined && i.value !== null && i.value !== '').map((item, idx) => (
      <div key={idx} style={{ ...LK.kvRow, gridTemplateColumns: `${min}px minmax(0, 1fr)` }}>
        <span style={LK.kvKey}>{item.label}</span>
        <span style={LK.kvVal}>{item.value}</span>
      </div>
    ))}
  </div>
);

export const SectionHeader: React.FC<{ title: React.ReactNode; desc?: React.ReactNode; actions?: React.ReactNode; style?: React.CSSProperties }> = ({ title, desc, actions, style }) => (
  <div style={{ ...LK.headerRow, marginTop: 8, marginBottom: 12, ...style }}>
    <div>
      <h2 style={{ ...LK.title, fontSize: 16 }}>{title}</h2>
      {desc && <p style={LK.subtitle}>{desc}</p>}
    </div>
    {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
  </div>
);

export const PageShell: React.FC<{ title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }> = ({ title, subtitle, actions, children }) => (
  <section style={LK.page}>
    {(title || actions) && (
      <div style={LK.headerRow}>
        <div>
          {title && <h1 style={LK.title}>{title}</h1>}
          {subtitle && <p style={LK.subtitle}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    )}
    {children}
  </section>
);

export const Tag: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <span style={{ ...LK.tag, ...(color ? { color, borderColor: color } : null) }}>{children}</span>
);

export const EmptyHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ padding: '28px 20px', textAlign: 'center', color: '#8a8aa0', fontSize: 14, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.02)' }}>
    {children}
  </div>
);

export const darkField: React.CSSProperties = {
  backgroundColor: 'rgba(0,0,0,0.25)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  color: '#e0e0ea',
  fontSize: 14,
  padding: '7px 9px',
  fontFamily: 'inherit',
  outline: 'none',
  resize: 'vertical',
};

/** 内容自适应高度文本域（随内容增高，超 400px 滚动） */
export const AutoTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ style, ...props }) => {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 400)}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} style={{ ...darkField, resize: 'none', overflowY: 'auto', minHeight: 80, maxHeight: 400, ...style }} />;
};

/** 响应式侧栏宽度：窄窗口收缩、宽窗口受限 */
export const clampSidebar = (min = 220, vw = 22, max = 320): React.CSSProperties => ({
  width: `clamp(${min}px, ${vw}vw, ${max}px)`,
  minWidth: min,
  maxWidth: max,
});

/** 模态框宽度保护，窄窗口不溢出 */
export const modalBox = (width = 640): React.CSSProperties => ({
  width: `min(${width}px, 95vw)`,
  maxHeight: '80vh',
  overflow: 'auto',
});

