/**
 * 当前代码侧可执行规则只读视图。
 * 唯一规范文档：仓库根 QUALITY_EXECUTION.md。
 * 本页禁止运行时“重新归纳/改写标准”，避免不同机器产生不同 hard rules。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Step { name: string; goal: string }
interface Standard {
  moduleKey: string;
  moduleName: string;
  category: string;
  scenarios: string[];
  purpose: string;
  steps: Step[];
  requirements: string[];
  rules: string[];
  qualityBar: string;
  version: number;
  changeNote: string;
  source: string;
  seedBaselineVersion?: number;
}

const card: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-secondary,#fff)',
  border: '1px solid var(--color-border,#e5e7eb)',
  borderRadius: 12,
  padding: '16px 20px',
  marginBottom: 12,
  minWidth: 0,
  overflowWrap: 'anywhere',
};
const tag: React.CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  padding: '2px 8px',
  borderRadius: 999,
  backgroundColor: 'rgba(96,165,250,0.14)',
  color: '#3b82f6',
};
const section: React.CSSProperties = { padding: '16px 0', borderBottom: '1px solid var(--color-border)' };
const sectionTitle: React.CSSProperties = { margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' };
const itemList: React.CSSProperties = { margin: 0, paddingLeft: 22, display: 'grid', gap: 10, lineHeight: 1.8, overflowWrap: 'anywhere' };
const categoryLabel: Record<string, string> = {
  creation: '创作主线',
  crosscut: '横切保障',
  quality: '质量闭环',
};

const ruleTitle = (rule: string, index: number): string => {
  const heading = rule.split(/[：:；;。]/, 1)[0].trim();
  return heading.length > 28 ? `${heading.slice(0, 26)}…` : heading || `规则 ${index + 1}`;
};

const PlatformStandardsPage: React.FC = () => {
  const [list, setList] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.getWithRetry('/module-standards')
      .then(res => {
        const data = ((res as any).data ?? res) as { standards?: Standard[] };
        setList(data.standards || []);
      })
      .catch((e: any) => {
        setList([]);
        setError(e?.message || '执行规则读取失败');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 32, color: 'var(--color-text-muted)' }}>正在加载执行规则…</div>;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 24px', minWidth: 0, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>执行标准</h1>
        <span style={{ ...tag, background: 'rgba(34,197,94,0.14)', color: '#16a34a' }}>只读 · 所有作品共用</span>
        <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 'var(--font-size-xs)' }}>刷新</button>
      </div>

      <p style={{ margin: '0 0 16px', color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
        唯一规范文档为仓库根目录 QUALITY_EXECUTION.md。本页只展示当前代码对应的可执行镜像；运行时不能由模型重新归纳并改写硬标准。
      </p>

      {error && <div style={{ ...card, color: '#b91c1c' }}>{error}</div>}

      {list.map((s, index) => {
        const open = openKey === s.moduleKey;
        return (
          <React.Fragment key={s.moduleKey}>
            {(index === 0 || list[index - 1].category !== s.category) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 12px', paddingBottom: 10, borderBottom: '1px solid var(--color-border)' }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{categoryLabel[s.category] || s.category}</h2>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{list.filter(item => item.category === s.category).length} 个模块</span>
              </div>
            )}
            <div style={card}>
              <button type="button" aria-expanded={open} onClick={() => setOpenKey(open ? null : s.moduleKey)} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%', padding: 0, border: 0, background: 'transparent', color: 'var(--color-text-primary)', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ fontWeight: 700, fontSize: 15, minWidth: 100 }}>{s.moduleName}</span>
                <span style={tag}>v{s.version}</span>
                {s.seedBaselineVersion !== undefined && <span style={{ ...tag, background: 'rgba(148,163,184,0.14)', color: 'var(--color-text-muted)' }}>seed {s.seedBaselineVersion}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{open ? '收起 ▲' : '展开 ▼'}</span>
              </button>
              {open && (
                <div style={{ marginTop: 18, borderTop: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)', lineHeight: 1.8, overflowWrap: 'anywhere' }}>
                  <div style={section}><h3 style={sectionTitle}>模块目标</h3><p style={{ margin: 0 }}>{s.purpose}</p></div>
                  <div style={section}><h3 style={sectionTitle}>标准步骤</h3><ol style={itemList}>{s.steps.map((st, i) => <li key={i}><b>{st.name}</b>{st.goal ? `：${st.goal}` : ''}</li>)}</ol></div>
                  <div style={section}><h3 style={sectionTitle}>硬性要求</h3><ul style={itemList}>{s.requirements.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  <div style={section}><h3 style={sectionTitle}>规则纪律 · {s.rules.length} 条</h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {s.rules.map((x, i) => <details key={i} style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{ruleTitle(x, i)}</summary>
                        <p style={{ margin: '10px 0 2px', whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{x}</p>
                      </details>)}
                    </div>
                  </div>
                  {s.qualityBar && <div style={section}><h3 style={sectionTitle}>质量门槛</h3><p style={{ margin: 0 }}>{s.qualityBar}</p></div>}
                  <p style={{ margin: '10px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    来源：{s.source || 'code'}{s.changeNote ? ` · ${s.changeNote}` : ''}
                  </p>
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default PlatformStandardsPage;
