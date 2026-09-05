import React from 'react';
import { splitToLines } from '../../lib/textList';

const cardStyle: React.CSSProperties = {
  marginBottom: 10,
  padding: '10px 12px',
  borderRadius: 6,
  backgroundColor: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.04)',
};

const Label: React.FC<{ label: string; accent: string; suffix?: string }> = ({ label, accent, suffix }) => (
  <div style={{ fontSize: 14, fontWeight: 700, color: accent, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
    <span style={{ width: 3, height: 12, backgroundColor: accent, borderRadius: 2 }} />
    {label}
    {suffix && <span style={{ fontSize: 14, color: 'var(--color-text-muted)', fontWeight: 400 }}>{suffix}</span>}
  </div>
);

export const SectionHeading: React.FC<{ title: string; accent?: string; hint?: string }> = ({ title, accent = 'var(--color-accent)', hint }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '14px 0 8px' }}>
    <span style={{ width: 3, alignSelf: 'stretch', backgroundColor: accent, borderRadius: 2 }} />
    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: 0.5 }}>{title}</span>
    {hint && <span style={{ fontSize: 14, color: 'var(--color-text-dim)' }}>{hint}</span>}
  </div>
);

export const ParagraphField: React.FC<{ label: string; value: string; accent?: string; empty?: string }> = ({
  label, value, accent = 'var(--color-info-light)', empty = '未填写',
}) => (
  <div style={cardStyle}>
    <Label label={label} accent={accent} />
    <div style={{ fontSize: 14, color: value ? 'var(--color-text-soft)' : 'var(--color-text-muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{value || empty}</div>
  </div>
);

export const StringListField: React.FC<{ label: string; value: readonly string[]; accent?: string; empty?: string; ordered?: boolean }> = ({
  label, value, accent = 'var(--color-info-light)', empty = '未填写', ordered = true,
}) => {
  const items = value.map(item => item.trim()).filter(Boolean);
  return (
    <div style={cardStyle}>
      <Label label={label} accent={accent} suffix={items.length ? `${items.length}项` : undefined} />
      {items.length === 0 ? <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{empty}</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((item, index) => (
            <div key={`${index}-${item}`} style={{ display: 'flex', gap: 7, fontSize: 14, color: 'var(--color-text-soft)', lineHeight: 1.7 }}>
              {ordered && <span style={{ color: accent, flexShrink: 0 }}>{index + 1}.</span>}
              <span style={{ whiteSpace: 'pre-wrap' }}>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const KeyValueListField: React.FC<{ label: string; value: readonly { key: string; value: string }[]; accent?: string; empty?: string }> = ({
  label, value, accent = 'var(--color-info-light)', empty = '未填写',
}) => (
  <div style={cardStyle}>
    <Label label={label} accent={accent} suffix={value.length ? `${value.length}项` : undefined} />
    {value.length === 0 ? <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{empty}</div> : value.map((item, index) => (
      <div key={`${index}-${item.key}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, 160px) minmax(0, 1fr)', gap: 10, fontSize: 14, lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--color-text-primary)' }}>{item.key}</strong>
        <span style={{ color: 'var(--color-text-soft)', whiteSpace: 'pre-wrap' }}>{item.value}</span>
      </div>
    ))}
  </div>
);

export const TimelineField: React.FC<{ label: string; value: readonly { label: string; value: string }[]; accent?: string; empty?: string }> = ({
  label, value, accent = 'var(--color-info-light)', empty = '未填写',
}) => (
  <div style={cardStyle}>
    <Label label={label} accent={accent} suffix={value.length ? `${value.length}个时间节点` : undefined} />
    {value.length === 0 ? <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{empty}</div> : value.map((item, index) => (
      <div key={`${index}-${item.label}`} style={{ display: 'flex', gap: 10, marginBottom: 5 }}>
        <strong style={{ color: 'var(--color-warning)', minWidth: 72 }}>{item.label}</strong>
        <span style={{ color: 'var(--color-text-soft)', lineHeight: 1.7 }}>{item.value}</span>
      </div>
    ))}
  </div>
);

/**
 * Transitional wrapper for untouched scalar fields. It intentionally supports
 * only text or string[] and never guesses layout from punctuation, dates or
 * key:value ratios.
 */
export const FieldList: React.FC<{ label: string; value: string | readonly string[] | null | undefined; accent?: string; empty?: string }> = ({
  label, value, accent = 'var(--color-info-light)', empty = '未填写',
}) => Array.isArray(value)
  ? <StringListField label={label} value={value as readonly string[]} accent={accent} empty={empty} />
  : <ParagraphField label={label} value={String(value ?? '')} accent={accent} empty={empty} />;

export const LegacyTextListField: React.FC<{ label: string; value: string; accent?: string; empty?: string }> = ({ label, value, accent, empty }) => (
  <StringListField label={label} value={splitToLines(value)} accent={accent} empty={empty} />
);

export const ChipList: React.FC<{ items: string[]; color?: string; empty?: string }> = ({ items, color = 'var(--color-info-light)', empty = '暂无' }) => {
  if (!items.length) return <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{empty}</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((item, i) => (
        <span key={i} style={{ padding: '4px 9px', borderRadius: 5, fontSize: 14, color, backgroundColor: `${color}1a`, border: `1px solid ${color}44` }}>{item}</span>
      ))}
    </div>
  );
};
