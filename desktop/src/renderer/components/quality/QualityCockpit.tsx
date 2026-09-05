import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const labels: Record<string, string> = { project: '项目', world: '世界观', character: '角色', outline: '大纲', chapter: '正文', refinement: '精修',
  platform: '平台', category: '分类', tone: '基调', style: '风格', genre: '流派', pov: '视角', context: '上下文', logic: '逻辑', completeness: '完整度', prose: '文体',
  running: '进行中', success: '生成完成', failed: '失败', cancelled: '已取消', passed: '通过', blocked: '已阻断', not_evaluated: '未评估',
  blocking: '阻断', high: '严重', medium: '一般', low: '轻微', info: '提示' };
type Dimension = { score: number | null; status: string; reason: string; evidence: string[] };
type Score = { overallScore: number | null; coverage: number; dimensions: Record<string, Dimension> };
type Cockpit = {
  scores: Record<string, Score | null>; scope: string;
  runs: Array<{ id: string; stage: string; status: string; gate_status: string; constitution_revision: number; started_at: string; duration_ms: number | null; total_tokens?: number | null; error: string | null }>;
  issues: Array<{ id: string; severity: string; summary: string; evidence: string }>;
  trend: Array<{ at: string; stage: string; score: number | null; coverage: number }>;
  repairs?: Array<{ id: string; stage: string; status: string; reason: string; before_score: number | null; after_score: number | null; before_text?: string; after_text?: string }>;
};
export function QualityCockpit({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Cockpit | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    const load = async () => {
      try {
        const res = await api.get<any>(`/generation-metrics/cockpit?projectId=${encodeURIComponent(projectId)}`);
        if (active) { setData(res?.data ?? res); setError(''); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : '质量数据加载失败'); }
    };
    void load(); const timer = setInterval(() => { void load(); }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [projectId, refresh]);
  return <section aria-label="质量驾驶舱" style={{ marginBottom: 24, padding: 16, border: '1px solid var(--color-bg-elevated)', borderRadius: 8 }}>
    <h2 style={{ fontSize: 20, fontWeight: 700, display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>质量驾驶舱 <button style={{ padding: '4px 12px', border: '1px solid var(--color-bg-elevated)', borderRadius: 4, fontSize: 14 }} onClick={() => setRefresh(v => v + 1)}>刷新</button></h2>
    {error && <p role="alert">{error}</p>}
    {!data ? <p>{error ? '暂时无法读取质量数据' : '正在读取质量数据…'}</p> : <>
      <p>{data.scope}。未评估不代表通过；综合分只在所需维度均有证据时显示。</p>
      {['project', 'world', 'character', 'outline', 'chapter', 'refinement'].map(stage => {
        const score = data.scores[stage];
        return <details key={stage} open={!!score} style={{ margin: '12px 0' }}>
          <summary>{labels[stage]} · {score?.overallScore == null ? '未评估' : `${score.overallScore} 分`} {score && `· 已评估 ${Math.round(score.coverage * 100)}% 维度`}</summary>
          {score && <table style={{ width: '100%', textAlign: 'left' }}><thead><tr><th>维度</th><th>分数</th><th>依据</th></tr></thead><tbody>
            {Object.entries(score.dimensions).map(([key, d]) => <tr key={key}>
              <td>{labels[key] || key}</td><td>{d.status === 'not_applicable' ? '不适用' : d.score ?? '未评估'}</td>
              <td>{d.reason}{d.evidence.length > 0 && <blockquote>{d.evidence.join('；')}</blockquote>}</td>
            </tr>)}
          </tbody></table>}
        </details>;
      })}
      <details><summary>未解决问题（{data.issues.length}）</summary>
        {data.issues.length === 0 ? <p>暂无已记录问题。请结合评估覆盖率判断。</p> : data.issues.map(i => <p key={i.id}><strong>{labels[i.severity] || i.severity}</strong> · {i.summary}{i.evidence && <q>{i.evidence}</q>}</p>)}
      </details>
      <details><summary>生成进度与卡点（{data.runs.length} 次）</summary>
        {data.runs.map(r => <p key={r.id}>{labels[r.stage]} · {labels[r.status]} · Gate：{labels[r.gate_status] || r.gate_status} · 宪法 v{r.constitution_revision ?? '未知'} · {r.duration_ms === null ? '耗时待结算' : `${(r.duration_ms / 1000).toFixed(1)} 秒`}{` · Token：${r.total_tokens ?? '未报告'}`}{r.error && ` · ${r.error}`}</p>)}
      </details>
      <details><summary>评分趋势（按时间和阶段）</summary>
        {data.trend.length ? data.trend.map((t, i) => <p key={i}>{new Date(t.at).toLocaleString()} · {labels[t.stage]} · {t.score ?? '未评估'} · 覆盖率 {Math.round(t.coverage * 100)}%</p>) : <p>暂无评分记录</p>}
      </details>
      <details><summary>修复结果</summary>{data.repairs?.length ? data.repairs.map(r => <details key={r.id}><summary>{labels[r.stage]} · {r.status === 'accepted' ? '已接受' : '已回滚'} · {r.before_score ?? '未评估'} → {r.after_score ?? '未评估'} · {r.reason}</summary><p>修复前</p><pre style={{ whiteSpace: 'pre-wrap' }}>{r.before_text || '未记录'}</pre><p>修复候选</p><pre style={{ whiteSpace: 'pre-wrap' }}>{r.after_text || '未生成有效候选'}</pre></details>) : <p>暂无自动修复记录</p>}</details>
    </>}
  </section>;
}
