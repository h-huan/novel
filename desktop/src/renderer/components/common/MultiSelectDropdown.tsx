import React, { useEffect, useRef, useState } from 'react';

export interface MultiSelectOption {
  value: string;
  label: string;
  hint?: string;
  warning?: string;
}

interface Props {
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onToggle: (value: string) => void;
  onAdd?: (value: string) => void;
  addPlaceholder?: string;
  placeholder?: string;
  disabled?: boolean;
}

/** 三项作者多选设定共用一份交互，避免灵感发现与项目卡片再次长出两套选择行为。 */
const MultiSelectDropdown: React.FC<Props> = ({ label, options, value, onToggle, onAdd, addPlaceholder = '填写自定义标签', placeholder = '请选择…', disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  const selectedText = value.length ? `${value.join('、')}（${value.length} 项）` : placeholder;
  const addCustom = () => {
    const next = customValue.trim();
    if (next && !value.includes(next)) onAdd?.(next);
    setCustomValue('');
  };
  return (
    <div ref={root} style={{ position: 'relative', width: '100%', marginBottom: 24 }}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled || (options.length === 0 && !onAdd)}
        onClick={() => setOpen((current) => !current)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          width: '100%', minHeight: 42, padding: '9px 12px', textAlign: 'left',
          border: `1px solid ${open ? 'var(--color-accent)' : 'var(--color-border)'}`,
          borderRadius: 8, background: 'var(--color-bg-primary)', color: value.length ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          font: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedText}</span>
        <span aria-hidden="true" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          aria-multiselectable="true"
          style={{
            position: 'absolute', zIndex: 60, top: 'calc(100% + 4px)', left: 0, right: 0,
            maxHeight: 264, overflowY: 'auto', padding: 4,
            border: '1px solid var(--color-border)', borderRadius: 9,
            background: 'var(--color-bg-elevated)', boxShadow: 'var(--shadow-lg)',
          }}
        >
          {options.map((option) => {
            const checked = value.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={checked}
                title={option.warning || option.hint}
                onClick={() => onToggle(option.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px',
                  border: 0, borderRadius: 6, background: checked ? 'var(--color-accent-soft)' : 'transparent',
                  color: option.warning ? 'var(--color-error, #f85149)' : 'var(--color-text-primary)',
                  textAlign: 'left', font: 'inherit', cursor: 'pointer',
                }}
              >
                <span aria-hidden="true" style={{ width: 16, textAlign: 'center', color: checked ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>{checked ? '☑' : '□'}</span>
                <span style={{ flex: 1 }}>{option.label}</span>
                {option.warning && <span aria-hidden="true">⚠</span>}
              </button>
            );
          })}
          {onAdd && <div style={{ display: 'flex', gap: 6, padding: 6, borderTop: '1px solid var(--color-border)' }}>
            <input aria-label={`填写${label}`} value={customValue} onChange={(event) => setCustomValue(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustom(); } }}
              placeholder={addPlaceholder} style={{ flex: 1, minWidth: 0, padding: '7px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }} />
            <button type="button" onClick={addCustom} disabled={!customValue.trim()} style={{ padding: '6px 10px' }}>添加</button>
          </div>}
        </div>
      )}
    </div>
  );
};

export default MultiSelectDropdown;
