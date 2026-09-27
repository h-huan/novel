/**
 * PlatformStandardsPage — 最新执行标准（当前生效，唯一参与执行）
 * 本页只展示并维护 status=active 的唯一最新标准。
 * 后端只做确定性的变化检测；模型归纳必须由用户明确点击触发。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

interface Step { name: string; goal: string }
interface Standard {
  moduleKey: string; moduleName: string; category: string; scenarios: string[];
  purpose: string; steps: Step[]; requirements: string[]; rules: string[]; qualityBar: string;
  version: number; changeNote: string; source: string; lastSummarizedAt: string | null;
}
interface ModuleStatus {
  moduleKey: string; moduleName: string; category: string; version: number;
  running: boolean; dirty: boolean; reasons: string[]; lastSummarizedAt: string | null;
}

const card: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-secondary,#fff)', border: '1px solid var(--color-border,#e5e7eb)',
  borderRadius: 12, padding: '16px 20px', marginBottom: 12, minWidth: 0, overflowWrap: 'anywhere',
};
const tag: React.CSSProperties = { fontSize: 'var(--font-size-xs)', padding: '2px 8px', borderRadius: 999, backgroundColor: 'rgba(96,165,250,0.14)', color: '#3b82f6' };
const section: React.CSSProperties = { padding: '16px 0', borderBottom: '1px solid var(--color-border)' };
const sectionTitle: React.CSSProperties = { margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' };
const itemList: React.CSSProperties = { margin: 0, paddingLeft: 22, display: 'grid', gap: 10, lineHeight: 1.8, overflowWrap: 'anywhere' };

/** 只压缩展示，不改写执行中的规则原文。 */
const ruleTitle = (rule: string, index: number): string => {
  const heading = rule.split(/[：:；;。]/, 1)[0].trim();
  return heading.length > 28 ? `${heading.slice(0, 26)}…` : heading || `规则 ${index + 1}`;
};

const categoryLabel: Record<string, string> = {
  creation: '创作主线', crosscut: '横切保障', quality: '质量闭环',
};

const PlatformStandardsPage: React.FC = () => {
  const [list, setList] = useState<Standard[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, ModuleStatus>>({});
  const [dirtyCount, setDirtyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.getWithRetry('/module-standards')
      .then(res => {
        const data = ((res as any).data ?? res) as { standards: Standard[] };
        const standards = data.standards || [];
        setList(standards);
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  const loadStatus = useCallback(() => {
    api.get('/module-standards/status')
      .then(res => {
        const data = ((res as any).data ?? res) as { modules?: ModuleStatus[]; dirtyCount?: number };
        const map: Record<string, ModuleStatus> = {};
        (data.modules || []).forEach(m => { map[m.moduleKey] = m; });
        setStatusMap(map);
        setDirtyCount(data.dirtyCount || 0);
      })
      .catch(() => {
        // 后端重启后旧的“归纳中”不可能延续：连接失败时清掉残留 running，避免卡片永久转圈
        setStatusMap(prev => {
          let changed = false;
          const next: Record<string, ModuleStatus> = {};
          Object.keys(prev).forEach(key => {
            if (prev[key]?.running) { changed = true; next[key] = { ...prev[key], running: false }; }
            else next[key] = prev[key];
          });
          return changed ? next : prev;
        });
      });
  }, []);

  useEffect(() => {
    load();
    loadStatus();
    timer.current = setInterval(loadStatus, 8000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load, loadStatus]);

  const summarize = async (key: string) => {
    const ds = statusMap[key];
    if (!ds?.dirty) { setMsg('该模块暂无需要归纳的新变化。'); return; }
    setBusyKey(key); setMsg(null);
    try {
      const res = await api.post(`/module-standards/${key}/summarize`, {});
      const r = (res as any).data ?? res;
      if (r?.ok) { setMsg(`已归纳更新到 v${r.version}：${r.changeNote || ''}`); load(); loadStatus(); }
      else { setMsg(`归纳未完成：${r?.error || '请稍后再试（旧标准仍生效）'}`); }
    } catch (e: any) {
      setMsg(`归纳失败（旧标准仍生效）：${e?.message || e}`);
    } finally { setBusyKey(null); loadStatus(); }
  };

  if (loading) return <div style={{ padding: 32, color: 'var(--color-text-muted)' }}>正在加载执行标准…</div>;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 24px', minWidth: 0, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>系统工作流规则</h1>
        <span style={{ ...tag, background: 'rgba(34,197,94,0.14)', color: '#16a34a' }}>● 所有作品共用</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 'var(--font-size-xs)' }}>刷新</button>
        </div>
      </div>
      {dirtyCount > 0 && (
        <div style={{ padding: '9px 14px', marginBottom: 14, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 'var(--font-size-xs)', color: '#b45309' }}>
          检测到 {dirtyCount} 个模块出现新的生成变化。系统不会自动消耗模型额度；请展开对应卡片，按需手动归纳。
        </div>
      )}
      {msg && <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 8, backgroundColor: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', fontSize: 'var(--font-size-xs)' }}>{msg}</div>}

      {list.map((s, index) => {
        const open = openKey === s.moduleKey;
        const ds = statusMap[s.moduleKey];
        const isDirty = !!ds?.dirty;
        const isRunning = !!ds?.running || busyKey === s.moduleKey;
        return (
          <React.Fragment key={s.moduleKey}>
          {(index === 0 || list[index - 1].category !== s.category) && <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 12px', paddingBottom: 10, borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{categoryLabel[s.category] || s.category}</h2>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{list.filter(item => item.category === s.category).length} 个模块</span>
          </div>}
          <div style={card}>
            <button type="button" aria-expanded={open} onClick={() => setOpenKey(open ? null : s.moduleKey)} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%', padding: 0, border: 0, background: 'transparent', color: 'var(--color-text-primary)', textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ fontWeight: 700, fontSize: 15, minWidth: 100 }}>{s.moduleName}</span>
              <span style={tag}>v{s.version}</span>
              {isDirty && !isRunning && (
                <span style={{ ...tag, backgroundColor: 'rgba(245,158,11,0.16)', color: '#b45309' }}>● 检测到新变化</span>
              )}
              {isRunning && (
                <span style={{ ...tag, backgroundColor: 'rgba(59,130,246,0.16)', color: '#2563eb' }}>归纳中…</span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{open ? '收起 ▲' : '展开 ▼'}</span>
            </button>
            {open && (
              <div style={{ marginTop: 18, borderTop: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)', lineHeight: 1.8, overflowWrap: 'anywhere' }}>
                <div style={section}><h3 style={sectionTitle}>模块目标</h3><p style={{ margin: 0 }}>{s.purpose}</p></div>
                <div style={section}><h3 style={sectionTitle}>标准步骤</h3>
                <ol style={itemList}>
                  {s.steps.map((st, i) => <li key={i}><b>{st.name}</b>{st.goal ? `：${st.goal}` : ''}</li>)}
                </ol></div>
                <div style={section}><h3 style={sectionTitle}>硬性要求</h3>
                  <ul style={itemList}>{s.requirements.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
                <div style={section}><h3 style={sectionTitle}>规则纪律 · {s.rules.length} 条</h3>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {s.rules.map((x, i) => <details key={i} style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{ruleTitle(x, i)}</summary>
                      <p style={{ margin: '10px 0 2px', whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{x}</p>
                    </details>)}
                  </div>
                </div>
                {s.qualityBar && <div style={section}><h3 style={sectionTitle}>质量门槛</h3><p style={{ margin: 0, color: 'var(--color-text-primary)' }}>{s.qualityBar}</p></div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    上次归纳：{s.lastSummarizedAt ? new Date(s.lastSummarizedAt).toLocaleString() : '初始基线'} · 来源：{s.source}
                    {s.changeNote ? ` · ${s.changeNote}` : ''}
                  </span>
                  {isDirty && ds?.reasons?.length ? (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: '#b45309' }} title={ds.reasons.join('；')}>
                      变化：{ds.reasons.slice(0, 2).join('；')}{ds.reasons.length > 2 ? '…' : ''}
                    </span>
                  ) : null}
                  <button
                    disabled={!isDirty || isRunning}
                    onClick={() => summarize(s.moduleKey)}
                    title={isDirty ? (ds?.reasons?.join('；') || '检测到新变化，可立即归纳') : '系统检测到该模块有实质变化后才允许手动归纳'}
                    style={{
                      marginLeft: 'auto', padding: '5px 12px', borderRadius: 8, fontSize: 'var(--font-size-xs)',
                      cursor: isDirty && !isRunning ? 'pointer' : 'not-allowed',
                      backgroundColor: isDirty && !isRunning ? undefined : 'var(--color-bg-tertiary,#f3f4f6)',
                      color: isDirty && !isRunning ? undefined : 'var(--color-text-muted,#9ca3af)',
                      opacity: isDirty && !isRunning ? 1 : 0.7,
                    }}
                  >{isRunning ? '归纳中…' : isDirty ? '立即重新归纳' : '暂无新变化（默认禁用）'}</button>
                </div>
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
