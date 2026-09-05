/**
 * PlatformStandardsPage — 最新执行标准（当前生效，唯一参与执行）
 * 与"标准发展历程"物理分页：本页只展示 status=active 的最新标准。
 * 归纳为【变化驱动】：后端检测到某模块有新生成变化（新增样本+指标实质变化/新避坑经验/代码基线升级）时
 * 会自动归纳；手动"立即重新归纳"按钮默认禁用，只有该模块 dirty 时才点亮并展示原因。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface Step { name: string; goal: string }
interface Standard {
  moduleKey: string; moduleName: string; category: string; scenarios: string[];
  purpose: string; steps: Step[]; requirements: string[]; rules: string[]; qualityBar: string;
  version: number; changeNote: string; source: string; lastSummarizedAt: string | null;
}
interface ModuleStatus {
  moduleKey: string; moduleName: string; category: string; version: number;
  running: boolean; dirty: boolean; autoEligible: boolean; reasons: string[]; lastSummarizedAt: string | null;
}

const card: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-secondary,#fff)', border: '1px solid var(--color-border,#e5e7eb)',
  borderRadius: 12, padding: 18, marginBottom: 14,
};
const tag: React.CSSProperties = { fontSize: 'var(--font-size-xs)', padding: '2px 8px', borderRadius: 999, backgroundColor: 'rgba(96,165,250,0.14)', color: '#3b82f6' };

const categoryLabel: Record<string, string> = {
  creation: '创作主线', crosscut: '横切保障', quality: '质量闭环',
};

const PlatformStandardsPage: React.FC = () => {
  const navigate = useNavigate();
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
        setOpenKey(prev => prev ?? (standards[0]?.moduleKey || null));
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
    if (!ds?.dirty) { setMsg('该模块暂无新变化，系统检测到变化后会自动归纳、也才允许手动归纳。'); return; }
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
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>最新执行标准</h1>
        <span style={{ ...tag, background: 'rgba(34,197,94,0.14)', color: '#16a34a' }}>● 当前唯一生效 · 所有模型版本统一执行</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 'var(--font-size-xs)' }}>刷新</button>
          <button onClick={() => navigate('/standards-history')} style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 'var(--font-size-xs)' }}>标准发展历程 →</button>
        </div>
      </div>
      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 14 }}>
        归纳为<b>变化驱动</b>，不按固定时间：某模块自上次归纳以来新增足够真实生成、且指标出现实质变化（一次到位率下降/失败或截断增多/字数缺口扩大/出现新卡点/新增避坑经验），或代码标准基线升级时，系统会<b>自动归纳</b>并立即注入所有对应生成场景；旧版归档到「发展历程」，仅作回顾、不参与执行。手动按钮仅在该模块检测到变化时可用。
      </p>
      {dirtyCount > 0 && (
        <div style={{ padding: '9px 14px', marginBottom: 14, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 'var(--font-size-xs)', color: '#b45309' }}>
          检测到 {dirtyCount} 个模块出现新的生成变化，将自动归纳；也可展开对应卡片，在原因提示处手动立即归纳。
        </div>
      )}
      {msg && <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 8, backgroundColor: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', fontSize: 'var(--font-size-xs)' }}>{msg}</div>}

      {list.map(s => {
        const open = openKey === s.moduleKey;
        const ds = statusMap[s.moduleKey];
        const isDirty = !!ds?.dirty;
        const isRunning = !!ds?.running || busyKey === s.moduleKey;
        return (
          <div key={s.moduleKey} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setOpenKey(open ? null : s.moduleKey)}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{s.moduleName}</span>
              <span style={tag}>v{s.version}</span>
              <span style={tag}>{categoryLabel[s.category] || s.category}</span>
              {isDirty && !isRunning && (
                <span style={{ ...tag, backgroundColor: 'rgba(245,158,11,0.16)', color: '#b45309' }}>● 检测到新变化</span>
              )}
              {isRunning && (
                <span style={{ ...tag, backgroundColor: 'rgba(59,130,246,0.16)', color: '#2563eb' }}>归纳中…</span>
              )}
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{s.scenarios.join(' / ')}</span>
              <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{open ? '收起 ▲' : '展开 ▼'}</span>
            </div>
            {open && (
              <div style={{ marginTop: 12, fontSize: 'var(--font-size-xs)', lineHeight: 1.7 }}>
                <p style={{ margin: '0 0 10px' }}><b>模块目标：</b>{s.purpose}</p>
                <b>标准步骤</b>
                <ol style={{ margin: '6px 0 12px', paddingLeft: 20 }}>
                  {s.steps.map((st, i) => <li key={i}><b>{st.name}</b>{st.goal ? `：${st.goal}` : ''}</li>)}
                </ol>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div><b>硬性要求</b>
                    <ul style={{ paddingLeft: 18, margin: '6px 0' }}>{s.requirements.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                  <div><b>规则纪律</b>
                    <ul style={{ paddingLeft: 18, margin: '6px 0' }}>{s.rules.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                </div>
                {s.qualityBar && <p style={{ margin: '8px 0' }}><b>质量门槛：</b><span style={{ color: '#b45309' }}>{s.qualityBar}</span></p>}
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
                    title={isDirty ? (ds?.reasons?.join('；') || '检测到新变化，可立即归纳') : '默认禁用：系统检测到该模块有新生成变化后才允许手动归纳（正常情况会自动归纳）'}
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
        );
      })}
    </div>
  );
};

export default PlatformStandardsPage;
