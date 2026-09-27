import React, { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** 同一份可编辑分类控件供灵感发现与本书设定复用，候选值只从 shared 取得。 */
const CategoryReferencePicker: React.FC<Props> = ({ value, options, onChange, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const visible = filtering
    ? options.filter(option => option.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return <div ref={root} style={{ position: 'relative', display: 'flex', width: '100%' }}>
    <input
      value={value}
      disabled={disabled}
      onChange={event => { onChange(event.target.value); setFiltering(true); setOpen(true); }}
      onFocus={() => { setFiltering(false); setOpen(true); }}
      onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}
      placeholder="输入平台后台分类，或从参考品类选择"
      aria-label="投稿分类"
      aria-expanded={open}
      style={{ width: '100%', minWidth: 0, padding: '10px 42px 10px 12px', boxSizing: 'border-box', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-primary)', font: 'inherit' }}
    />
    <button
      type="button"
      disabled={disabled || options.length === 0}
      onClick={() => { setFiltering(false); setOpen(current => !current); }}
      aria-label="展开参考品类"
      style={{ position: 'absolute', right: 2, top: 2, bottom: 2, width: 38, border: 0, background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
    >▾</button>
    {open && options.length > 0 && <div role="listbox" aria-label="参考品类" style={{ position: 'absolute', zIndex: 70, top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: 240, overflowY: 'auto', padding: 6, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 9, boxShadow: 'var(--shadow-lg)' }}>
      <div style={{ padding: '5px 8px 8px', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>参考品类 · 可直接填写其它分类</div>
      {visible.length ? visible.map(option => <button key={option} type="button" role="option" aria-selected={option === value} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(option); setFiltering(false); setOpen(false); }} style={{ display: 'block', width: '100%', padding: '8px 10px', border: 0, borderRadius: 6, textAlign: 'left', color: 'var(--color-text-primary)', background: option === value ? 'var(--color-accent-soft)' : 'transparent', font: 'inherit', cursor: 'pointer' }}>{option}</button>)
        : <div style={{ padding: '8px 10px', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>直接使用填写的分类</div>}
    </div>}
  </div>;
};

export default CategoryReferencePicker;
