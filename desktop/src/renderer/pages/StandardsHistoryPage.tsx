/**
 * StandardsHistoryPage — 标准发展历程（只读历史归档）
 * 与"最新执行标准"物理分页：本页仅回顾每个模块标准的演进，明确不参与任何生成执行。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

interface Version {
  id: string; moduleKey: string; moduleName: string; version: number;
  changeNote: string; trigger: string; snapshot: any; metricsSnapshot: any; createdAt: string;
}

const triggerLabel: Record<string, { text: string; color: string; bg: string }> = {
  seed: { text: '初始基线', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  scheduled: { text: '自动归纳', color: '#2563eb', bg: 'rgba(96,165,250,0.14)' },
  manual: { text: '手动归纳', color: '#7c3aed', bg: 'rgba(167,139,250,0.16)' },
};

const StandardsHistoryPage: React.FC = () => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [moduleKey, setModuleKey] = useState<string>('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/module-standards/history' + (moduleKey ? `?moduleKey=${moduleKey}` : ''))
      .then(res => {
        const data = ((res as any).data ?? res) as { versions: Version[] };
        setVersions(data.versions || []);
      })
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [moduleKey]);

  const modules = useMemo(() => {
    const m = new Map<string, string>();
    versions.forEach(v => m.set(v.moduleKey, v.moduleName));
    return [...m.entries()];
  }, [versions]);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>标准发展历程</h1>
        <span style={{ fontSize: 'var(--font-size-xs)', padding: '2px 8px', borderRadius: 999, background: 'rgba(107,114,128,0.14)', color: '#6b7280' }}>只读历史归档 · 不参与执行</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={moduleKey} onChange={e => setModuleKey(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, fontSize: 'var(--font-size-xs)' }}>
            <option value="">全部模块</option>
            {modules.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ padding: '10px 14px', marginBottom: 18, borderRadius: 8, background: 'rgba(107,114,128,0.08)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)' }}>
        这里保留每个功能模块标准的历史版本，仅用于回顾标准如何随真实生成数据迭代；当前真正注入生成、被所有模型执行的是「最新执行标准」页的 active 版本，历史版本不会被调用。
      </div>

      {loading ? <div style={{ color: 'var(--color-text-muted)' }}>加载中…</div> : versions.length === 0 ? (
        <div style={{ color: 'var(--color-text-muted)' }}>暂无历史版本。</div>
      ) : (
        <div style={{ borderLeft: '2px solid var(--color-border)', paddingLeft: 18 }}>
          {versions.map(v => {
            const t = triggerLabel[v.trigger] || { text: v.trigger, color: '#6b7280', bg: 'rgba(107,114,128,0.12)' };
            const open = expanded === v.id;
            return (
              <div key={v.id} style={{ position: 'relative', marginBottom: 16 }}>
                <span style={{ position: 'absolute', left: -24, top: 4, width: 10, height: 10, borderRadius: '50%', background: t.color }} />
                <div style={{ background: 'var(--color-bg-secondary,#fff)', border: '1px solid var(--color-border,#e5e7eb)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <b>{v.moduleName}</b>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>v{v.version}</span>
                    <span style={{ fontSize: 'var(--font-size-xs)', padding: '2px 8px', borderRadius: 999, color: t.color, background: t.bg }}>{t.text}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{new Date(v.createdAt).toLocaleString()}</span>
                  </div>
                  {v.changeNote && <p style={{ margin: '8px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)' }}>{v.changeNote}</p>}
                  {(v.snapshot || v.metricsSnapshot) && (
                    <>
                      <button onClick={() => setExpanded(open ? null : v.id)} style={{ marginTop: 8, fontSize: 'var(--font-size-xs)', padding: '3px 10px', borderRadius: 6, cursor: 'pointer' }}>
                        {open ? '收起快照' : '查看该版标准全文 / 当时指标'}
                      </button>
                      {open && (
                        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <pre style={{ background: 'rgba(127,127,127,0.07)', borderRadius: 8, padding: 10, fontSize: 'var(--font-size-xs)', overflow: 'auto', maxHeight: 320, margin: 0 }}>
                            {JSON.stringify(v.snapshot, null, 2)}
                          </pre>
                          <pre style={{ background: 'rgba(127,127,127,0.07)', borderRadius: 8, padding: 10, fontSize: 'var(--font-size-xs)', overflow: 'auto', maxHeight: 320, margin: 0 }}>
                            {v.metricsSnapshot ? JSON.stringify(v.metricsSnapshot, null, 2) : '（无指标快照）'}
                          </pre>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StandardsHistoryPage;
