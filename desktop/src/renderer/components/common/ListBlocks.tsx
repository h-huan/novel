import React from 'react';
import { splitToLines } from '../../lib/textList';

export const SectionHeading: React.FC<{ title: string; accent?: string; hint?: string }> = ({ title, accent = '#e94560', hint }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '14px 0 8px' }}>
    <span style={{ width: 3, alignSelf: 'stretch', backgroundColor: accent, borderRadius: 2 }} />
    <span style={{ fontSize: 13, fontWeight: 800, color: '#eaeaea', letterSpacing: 0.5 }}>{title}</span>
    {hint && <span style={{ fontSize: 11, color: '#8a8aa0' }}>{hint}</span>}
  </div>
);

export const FieldList: React.FC<{ label: string; value: unknown; accent?: string; empty?: string }> = ({
  label, value, accent = '#93c5fd', empty = '未填写',
}) => {
  const items = splitToLines(value);
  if (items.length === 0) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: '#6c6c80' }}>{empty}</div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 3 }}>{label}</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#c0c0d0', lineHeight: 1.7 }}>
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  );
};

export const ChipList: React.FC<{ items: string[]; color?: string; empty?: string }> = ({ items, color = '#60a5fa', empty = '暂无' }) => {
  if (!items.length) return <span style={{ fontSize: 12, color: '#6c6c80' }}>{empty}</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((item, i) => (
        <span key={i} style={{ padding: '4px 9px', borderRadius: 5, fontSize: 12, color, backgroundColor: `${color}1a`, border: `1px solid ${color}44` }}>{item}</span>
      ))}
    </div>
  );
};
