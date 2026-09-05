/**
 * charts.tsx — 零依赖纯 SVG 图表（不引入 echarts/recharts，控制 Electron 体积、与深色主题统一）
 *
 * 设计遵循可视化调研结论：
 *  - 雷达图：多维综合画像，固定同量纲、网格环、相关维度相邻，短板形状一眼可见；
 *  - 环图 Donut：部分占整体（≤8 类），中心放主数值；
 *  - 仪表环 GaugeRing：单个 0-100 分/百分比，语义色（≥85 绿 / 70-84 黄 / 其余红，空值灰）；
 *  - 趋势线 TrendChart：时间序列多序列折线+面积，可对比“问题新增 vs 解决”；
 *  - 横向排名条 HBars：短板排序。
 * 所有可读文字不小于 14px；无数据时由调用方渲染 Empty，不画空图。
 */
import React from 'react';

const num = (v: any) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);
export const scoreColor = (s: number | null | undefined) =>
  (s == null ? '#7f8c9b' : s >= 85 ? '#2ecc71' : s >= 70 ? '#f39c12' : '#e74c3c');

const polar = (cx: number, cy: number, r: number, angleDeg: number) => {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
};

// ───────────────────────── 雷达图 ─────────────────────────
export interface RadarAxis { label: string; value: number; hint?: string }
export const RadarChart: React.FC<{
  axes: RadarAxis[];
  max?: number;
  size?: number;
  color?: string;
  levels?: number;
  compare?: { axes: RadarAxis[]; color: string }; // 叠加对比序列（如目标值）
}> = ({ axes, max, size = 320, color = '#e94560', levels = 4, compare }) => {
  if (!axes.length) return null;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const R = size / 2 - 66;
  const n = axes.length;
  const dataMax = max ?? Math.max(4, ...axes.map(a => num(a.value)), ...(compare ? compare.axes.map(a => num(a.value)) : []));
  const angle = (i: number) => (360 / n) * i;
  const point = (i: number, ratio: number) => polar(cx, cy, R * ratio, angle(i));
  const polygon = (vals: number[]) => vals.map((v, i) => { const p = point(i, Math.max(0, Math.min(1, num(v) / dataMax))); return `${p.x},${p.y}`; }).join(' ');
  const anchor = (i: number) => { const a = angle(i); if (Math.abs(a - 180) < 1 || Math.abs(a - 0) < 1) return 'middle'; return a < 180 ? 'start' : 'end'; };

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: size, display: 'block', margin: '0 auto' }}>
      {Array.from({ length: levels }).map((_, li) => {
        const rr = (li + 1) / levels;
        return <polygon key={li} points={polygon(axes.map(() => rr * dataMax))} fill="none" stroke="rgba(127,127,127,0.18)" strokeWidth={1} />;
      })}
      {axes.map((_, i) => { const p = point(i, 1); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(127,127,127,0.18)" strokeWidth={1} />; })}
      {compare && (
        <polygon points={polygon(compare.axes.map(a => a.value))} fill={compare.color} fillOpacity={0.08} stroke={compare.color} strokeWidth={1.5} strokeDasharray="4 3" />
      )}
      <polygon points={polygon(axes.map(a => a.value))} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {axes.map((a, i) => {
        const p = point(i, Math.max(0, Math.min(1, num(a.value) / dataMax)));
        return <circle key={i} cx={p.x} cy={p.y} r={3.2} fill={color} />;
      })}
      {axes.map((a, i) => {
        const lp = point(i, 1.18);
        return (
          <text key={i} x={lp.x} y={lp.y} textAnchor={anchor(i) as any} dominantBaseline="middle" fontSize={14} fill="var(--color-text-secondary)" style={{ fontWeight: 600 }}>
            {a.label}
            <tspan fill={color} fontWeight={700}> {a.value}</tspan>
          </text>
        );
      })}
    </svg>
  );
};

// ───────────────────────── 环图 ─────────────────────────
export interface DonutSeg { label: string; value: number; color: string }
export const Donut: React.FC<{
  segments: DonutSeg[];
  size?: number;
  thickness?: number;
  centerTop?: React.ReactNode;
  centerBottom?: React.ReactNode;
}> = ({ segments, size = 188, thickness = 22, centerTop, centerBottom }) => {
  const total = segments.reduce((a, s) => a + num(s.value), 0);
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(127,127,127,0.14)" strokeWidth={thickness} />
        {total > 0 && segments.map((s, i) => {
          const len = (num(s.value) / total) * circ;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - 2)} ${circ - len + 2}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" />
          );
          offset += len;
          return el;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={24} fontWeight={800} fill="var(--color-text-primary)">{centerTop ?? total}</text>
        {centerBottom && <text x={cx} y={cy + 18} textAnchor="middle" fontSize={14} fill="var(--color-text-muted)">{centerBottom}</text>}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 130 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--color-text-soft)' }}>{s.label}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{num(s.value)}{total > 0 && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}> ·{Math.round((num(s.value) / total) * 100)}%</span>}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ───────────────────────── 仪表环（单个分值） ─────────────────────────
export const GaugeRing: React.FC<{ value: number | null; size?: number; label: string; sub?: string; color?: string }>
= ({ value, size = 116, label, sub, color }) => {
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  const r = (size - 14) / 2;
  const circ = 2 * Math.PI * r;
  const c = color || scoreColor(v);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(127,127,127,0.15)" strokeWidth={9} />
        {v != null && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={9} strokeLinecap="round"
            strokeDasharray={`${(v / 100) * circ} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={26} fontWeight={800} fill={c}>{v == null ? '—' : v}</text>
      </svg>
      <div style={{ fontSize: 14, fontWeight: 600, textAlign: 'center' }}>{label}</div>
      {sub && <div style={{ fontSize: 14, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: -4 }}>{sub}</div>}
    </div>
  );
};

// ───────────────────────── 趋势多折线 ─────────────────────────
export interface TrendSeries { key: string; label: string; color: string; area?: boolean }
export const TrendChart: React.FC<{
  labels: string[];
  rows: Array<Record<string, number | string>>;
  series: TrendSeries[];
  height?: number;
}> = ({ labels, rows, series, height = 230 }) => {
  const W = 860, H = height, padL = 40, padR = 14, padT = 14, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = Math.max(1, ...rows.flatMap(r => series.map(s => num(r[s.key]))));
  const x = (i: number) => padL + (rows.length <= 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (num(v) / max) * innerH;
  const labelEvery = Math.ceil(rows.length / 12);
  const grid = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {grid.map((g, i) => {
          const yy = padT + innerH - g * innerH;
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="rgba(127,127,127,0.14)" strokeWidth={1} />
              <text x={padL - 6} y={yy + 4} textAnchor="end" fontSize={14} fill="var(--color-text-muted)">{Math.round(g * max)}</text>
            </g>
          );
        })}
        {series.map(s => {
          const pts = rows.map((r, i) => `${x(i)},${y(num(r[s.key]))}`).join(' ');
          const areaPath = `M ${x(0)},${padT + innerH} L ${rows.map((r, i) => `${x(i)},${y(num(r[s.key]))}`).join(' L ')} L ${x(rows.length - 1)},${padT + innerH} Z`;
          return (
            <g key={s.key}>
              {s.area && <path d={areaPath} fill={s.color} fillOpacity={0.1} stroke="none" />}
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
              {rows.map((r, i) => <circle key={i} cx={x(i)} cy={y(num(r[s.key]))} r={2.6} fill={s.color} />)}
            </g>
          );
        })}
        {labels.map((lb, i) => (i % labelEvery === 0) && (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={14} fill="var(--color-text-muted)">{lb.slice(5).replace('-', '/')}</text>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }}>
        {series.map(s => (
          <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14 }}>
            <span style={{ width: 14, height: 4, borderRadius: 2, background: s.color }} />{s.label}
          </span>
        ))}
      </div>
    </div>
  );
};

// ───────────────────────── 横向排名条 ─────────────────────────
export const HBars: React.FC<{ data: Array<{ key: string; count: number; tone?: string }>; color?: string; empty: string; maxItems?: number }>
= ({ data, color = '#60a5fa', empty, maxItems = 12 }) => {
  const list = (data || []).filter(d => num(d.count) > 0).slice(0, maxItems);
  if (!list.length) return <div style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.7, padding: '6px 0' }}>{empty}</div>;
  const max = Math.max(1, ...list.map(d => num(d.count)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map((d, i) => (
        <div key={d.key + i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span style={{ width: 168, flexShrink: 0, color: 'var(--color-text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.key}>{d.key}</span>
          <div style={{ flex: 1, height: 12, borderRadius: 6, backgroundColor: 'rgba(127,127,127,0.12)', overflow: 'hidden' }}>
            <div style={{ width: `${(num(d.count) / max) * 100}%`, height: '100%', borderRadius: 6, background: d.tone || color }} />
          </div>
          <span style={{ width: 42, textAlign: 'right', fontWeight: 700 }}>{num(d.count)}</span>
        </div>
      ))}
    </div>
  );
};
