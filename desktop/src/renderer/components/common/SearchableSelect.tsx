/**
 * SearchableSelect —— 可手动输入、关键字过滤的下拉选择
 *
 * 用于数据筛选：作品可能有几十上百条，原生 select 只能滚动很难找；
 * 这里支持直接打字按名称过滤后选中。深色主题、字号走全局令牌（最小 14px）。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface SearchOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  width?: number | string;
}

const wrap: React.CSSProperties = { position: 'relative', minWidth: 180 };
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '7px 30px 7px 12px', borderRadius: 8, fontSize: 'var(--font-size-sm)',
  fontFamily: 'inherit', backgroundColor: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)', outline: 'none',
};

const SearchableSelect: React.FC<Props> = ({ value, options, onChange, placeholder = '搜索选择…', disabled, width = 220 }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find(o => o.value === value), [options, value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.hint || '').toLowerCase().includes(q) ||
      o.value.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={rootRef} style={{ ...wrap, width, opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <input
        value={open ? query : (selected?.label || '')}
        placeholder={placeholder}
        disabled={disabled}
        style={input}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
      />
      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', pointerEvents: 'none' }}>▾</span>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 50, top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: 264, overflowY: 'auto',
          backgroundColor: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-strong)', borderRadius: 10,
          boxShadow: 'var(--shadow-lg)', padding: 4,
        }}>
          {filtered.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>没有匹配项</div>
          )}
          {filtered.map(o => {
            const active = o.value === value;
            return (
              <div key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
                style={{
                  padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 'var(--font-size-sm)',
                  color: active ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
                  display: 'flex', alignItems: 'baseline', gap: 8, lineHeight: 1.4,
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = active ? 'var(--color-accent-soft)' : 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = active ? 'var(--color-accent-soft)' : 'transparent')}>
                <span style={{ flex: 1, minWidth: 0 }}>{o.label}</span>
                {o.hint && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', flexShrink: 0 }}>{o.hint}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
