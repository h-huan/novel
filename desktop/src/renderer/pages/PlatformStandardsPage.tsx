/**
 * Read-only System Workflow Rule Registry view.
 * QUALITY_EXECUTION.md is the sole human normative entry; this page displays
 * the executable registry projection without re-summarising rules.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

interface Rule {
  id: string;
  name: string;
  category: string;
  level: 'P0' | 'P1' | 'P2' | 'P3';
  status: string;
  blocking: boolean;
  summary: string;
  details?: string[];
  scenarios: string[];
  consumers: string[];
  dependencies: string[];
  dependents: string[];
  implementationRefs: string[];
  parameterRefs: string[];
  evidencePolicy?: string | null;
  rulesetVersion: number;
  source: string;
}

const categoryLabel: Record<string, string> = {
  governance: '规则治理', authority: '事实权威', architecture: '小说架构', context: '上下文与连续性',
  generation: '生成', quality: '质量 Gate', repair: '修复', workflow: '工作流/保存', platform: '平台参数', learning: '历史经验/策略学习',
};
const categoryOrder = Object.keys(categoryLabel);
const card: React.CSSProperties = { background: 'var(--color-bg-secondary,#fff)', border: '1px solid var(--color-border,#e5e7eb)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 };
const tag: React.CSSProperties = { fontSize: 'var(--font-size-xs)', padding: '2px 8px', borderRadius: 999, background: 'rgba(96,165,250,.14)' };

const PlatformStandardsPage: React.FC = () => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    api.getWithRetry('/module-standards/rules')
      .then((res) => setRules((((res as any).data ?? res) as { rules?: Rule[] }).rules || []))
      .catch((e: any) => { setRules([]); setError(e?.message || '系统工作流规则读取失败'); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => categoryOrder.map((category) => ({
    category,
    rules: rules.filter((rule) => rule.category === category),
  })).filter((group) => group.rules.length), [rules]);

  if (loading) return <div style={{ padding: 32 }}>正在加载系统工作流规则…</div>;
  const version = rules[0]?.rulesetVersion;
  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>系统工作流规则</h1>
        {version !== undefined && <span style={tag}>ruleset v{version}</span>}
        <span style={{ ...tag, color: '#16a34a' }}>只读 · 全部作品共用</span>
        <button onClick={load} style={{ marginLeft: 'auto' }}>刷新</button>
      </div>
      <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
        唯一规范入口：QUALITY_EXECUTION.md。下方按 Rule ID 展示机器执行镜像；分类和场景只是过滤视图，不拥有第二套规则。
      </p>
      {error && <div style={{ ...card, color: '#b91c1c' }}>{error}</div>}
      {grouped.map((group) => (
        <section key={group.category} style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16 }}>{categoryLabel[group.category] || group.category} · {group.rules.length}</h2>
          {group.rules.map((rule) => {
            const open = openId === rule.id;
            return <div key={rule.id} style={card}>
              <button type="button" onClick={() => setOpenId(open ? null : rule.id)} style={{ width: '100%', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                <code>{rule.id}</code><strong>{rule.name}</strong><span style={tag}>{rule.level}</span>
                {rule.blocking && <span style={{ ...tag, color: '#b91c1c' }}>可阻断</span>}
                <span style={{ marginLeft: 'auto' }}>{open ? '收起 ▲' : '展开 ▼'}</span>
              </button>
              <p style={{ margin: '10px 0 0', lineHeight: 1.7 }}>{rule.summary}</p>
              {open && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                <p><b>适用场景：</b>{rule.scenarios.join(' / ')}</p>
                <p><b>消费者：</b>{rule.consumers.join(' / ')}</p>
                <p><b>依赖：</b>{rule.dependencies.length ? rule.dependencies.join(' / ') : '无'}</p>
                <p><b>受影响下游：</b>{rule.dependents.length ? rule.dependents.join(' / ') : '无'}</p>
                {rule.details && rule.details.length > 0 && <div><b>详细条款：</b><ul>{rule.details.map((detail) => <li key={detail}>{detail}</li>)}</ul></div>}
                {rule.parameterRefs.length > 0 && <p><b>参数源：</b>{rule.parameterRefs.join(' / ')}</p>}
                {rule.evidencePolicy && <p><b>证据要求：</b>{rule.evidencePolicy}</p>}
                <p style={{ overflowWrap: 'anywhere' }}><b>实现：</b>{rule.implementationRefs.join(' / ')}</p>
              </div>}
            </div>;
          })}
        </section>
      ))}
    </div>
  );
};

export default PlatformStandardsPage;
