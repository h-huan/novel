import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const labels: Record<string, string> = {
  project: '项目', world: '世界观', character: '角色', outline: '大纲', chapter: '正文', refinement: '精修',
  platform: '平台', category: '分类', tone: '基调', style: '风格', genre: '流派', pov: '视角',
  context: '上下文', logic: '逻辑', completeness: '完整度', prose: '文体',
  length: '字数', structure: '结构', pacing: '节奏', payoff: '回报', retention: '留存',
  character_voice: '人物声音', world_rules: '世界规则', timeline: '时间线',
  blocking: '阻断', high: '严重', medium: '一般', low: '轻微', info: '提示',
};
type Dimension = { score: number | null; status: string; reason: string; evidence: string[] };
type Score = { overallScore: number | null; coverage: number; dimensions: Record<string, Dimension> };
type Cockpit = {
  scope: string;
  scores: Record<string, Score | null>;
  issues: Array<{ id: string; severity: string; summary: string; evidence: string }>;
  repairs?: Array<{ id: string; stage: string; status: string; reason: string; before_score: number | null; after_score: number | null; before_text?: string; after_text?: string }>;
  trend?: Array<{ at: string; stage: string; score: number | null; coverage: number }>;
  issuePareto?: Array<{ ruleId: string; count: number }>;
  issueStageDistribution?: Array<{ stage: string; count: number }>;
  strategyStats?: Array<{ strategyId: string; attempts: number; accepted: number; rollbacks: number; successRate: number | null; destructionRate: number | null; avgImprovement: number | null }>;
  modelPromptCompare?: Array<{ model: string; promptVersion: string; runs: number; passRate: number | null; avgLatencyMs: number | null }>;
  bottlenecks?: Array<{ id: string; stage: string; status: string; gate_status: string; error?: string }>;
  benchmark?: { available: boolean; resultStatus: string; groups: Array<{ storyType: string; platform: string; samples: number; labeled: number; pending: number; precision: number | null; recall: number | null; falsePositives: number; falseNegatives: number; repairSuccessRate: number | null; destructionRate: number | null; status: string }> };
};

const pct = (value: number | null | undefined) => value == null ? '待样本' : `${Math.round(value * 100)}%`;

export function QualityCockpit({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Cockpit | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    api.get<any>(`/generation-metrics/cockpit?projectId=${encodeURIComponent(projectId)}`)
      .then(res => { if (active) { setData(res?.data ?? res); setError(''); } })
      .catch(() => { if (active) setError('质量数据加载失败，请重试。'); });
    return () => { active = false; };
  }, [projectId, refresh]);

  return <section aria-label="作品质量" style={{ marginBottom: 24, padding: 16, border: '1px solid var(--color-bg-elevated)', borderRadius: 8 }}>
    <h2 style={{ fontSize: 20, fontWeight: 700, display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
      作品质量
      <button onClick={() => setRefresh(value => value + 1)}>刷新</button>
    </h2>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p>正在读取作品质量…</p>}
    {data && <>
      <p>{data.scope}。只有取得原文证据的维度才会显示分数，未评估不代表通过。</p>
      {['project', 'world', 'character', 'outline', 'chapter', 'refinement'].map(stage => {
        const score = data.scores[stage];
        return <details key={stage} open={!!score} style={{ margin: '12px 0' }}>
          <summary>{labels[stage]} · {score?.overallScore == null ? '未评估' : `${score.overallScore} 分`}{score && ` · 覆盖 ${Math.round(score.coverage * 100)}%`}</summary>
          {score && <table style={{ width: '100%', textAlign: 'left' }}>
            <thead><tr><th>维度</th><th>分数</th><th>依据</th></tr></thead>
            <tbody>{Object.entries(score.dimensions).map(([key, dimension]) => <tr key={key}>
              <td>{labels[key] || key}</td>
              <td>{dimension.status === 'not_applicable' ? '不适用' : dimension.score ?? '未评估'}</td>
              <td>{dimension.reason}{dimension.evidence.length > 0 && <blockquote>{dimension.evidence.join('；')}</blockquote>}</td>
            </tr>)}</tbody>
          </table>}
        </details>;
      })}
      <details><summary>待处理问题（{data.issues.length}）</summary>
        {data.issues.length === 0 ? <p>没有已记录问题，请同时查看评估覆盖率。</p> : data.issues.map(issue => <p key={issue.id}>
          <strong>{labels[issue.severity] || issue.severity}</strong> · {issue.summary}{issue.evidence && <q>{issue.evidence}</q>}
        </p>)}
      </details>
      <details><summary>修复结果</summary>
        {data.repairs?.length ? data.repairs.map(repair => <details key={repair.id}>
          <summary>{labels[repair.stage]} · {repair.status === 'accepted' ? '已接受' : '已回滚'} · {repair.before_score ?? '未评估'} → {repair.after_score ?? '未评估'} · {repair.reason}</summary>
          <p>修复前</p><pre style={{ whiteSpace: 'pre-wrap' }}>{repair.before_text || '未记录'}</pre>
          <p>修复候选</p><pre style={{ whiteSpace: 'pre-wrap' }}>{repair.after_text || '未生成有效候选'}</pre>
        </details>) : <p>暂无自动修复记录。</p>}
      </details>
      <details><summary>质量趋势（{data.trend?.length || 0}）</summary>
        {data.trend?.length ? <table style={{ width: '100%', textAlign: 'left' }}><thead><tr><th>时间</th><th>阶段</th><th>分数</th><th>覆盖</th></tr></thead>
          <tbody>{data.trend.map((item, index) => <tr key={`${item.at}-${index}`}><td>{new Date(item.at).toLocaleString()}</td><td>{labels[item.stage] || item.stage}</td><td>{item.score ?? '未评估'}</td><td>{pct(item.coverage)}</td></tr>)}</tbody></table> : <p>暂无可比较的评分记录。</p>}
      </details>
      <details><summary>Issue Pareto 与阶段分布</summary>
        <h3>问题排行</h3>{data.issuePareto?.length ? <ol>{data.issuePareto.map(item => <li key={item.ruleId}>{item.ruleId} · {item.count}</li>)}</ol> : <p>暂无问题。</p>}
        <h3>问题阶段</h3>{data.issueStageDistribution?.length ? <ul>{data.issueStageDistribution.map(item => <li key={item.stage}>{labels[item.stage] || item.stage} · {item.count}</li>)}</ul> : <p>暂无阶段问题。</p>}
      </details>
      <details><summary>修复策略成功率</summary>
        {data.strategyStats?.length ? <table style={{ width: '100%', textAlign: 'left' }}><thead><tr><th>策略</th><th>尝试</th><th>接受/回滚</th><th>成功率</th><th>破坏率</th><th>平均改善</th></tr></thead>
          <tbody>{data.strategyStats.map(item => <tr key={item.strategyId}><td>{item.strategyId}</td><td>{item.attempts}</td><td>{item.accepted}/{item.rollbacks}</td><td>{pct(item.successRate)}</td><td>{pct(item.destructionRate)}</td><td>{item.avgImprovement ?? '待样本'}</td></tr>)}</tbody></table> : <p>暂无真实修复样本。</p>}
      </details>
      <details><summary>模型与 Prompt 对比</summary>
        {data.modelPromptCompare?.length ? <table style={{ width: '100%', textAlign: 'left' }}><thead><tr><th>模型</th><th>Prompt 版本</th><th>运行</th><th>通过率</th><th>平均耗时</th></tr></thead>
          <tbody>{data.modelPromptCompare.map(item => <tr key={`${item.model}-${item.promptVersion}`}><td>{item.model}</td><td><code>{item.promptVersion.slice(0, 10)}</code></td><td>{item.runs}</td><td>{pct(item.passRate)}</td><td>{item.avgLatencyMs == null ? '待样本' : `${item.avgLatencyMs} ms`}</td></tr>)}</tbody></table> : <p>暂无可比较运行。</p>}
      </details>
      <details><summary>卡点下钻（{data.bottlenecks?.length || 0}）</summary>
        {data.bottlenecks?.length ? data.bottlenecks.map(item => <p key={item.id}>{labels[item.stage] || item.stage} · {item.status} · {item.gate_status}{item.error ? ` · ${item.error}` : ''}</p>) : <p>暂无运行卡点。</p>}
      </details>
      <details><summary>真实 Benchmark</summary>
        <p>{data.benchmark?.available ? '仅统计已录入的真实样本。' : '尚无真实样本，框架已就绪，结果标记为待样本。'}</p>
        {data.benchmark?.groups.map(group => <p key={`${group.storyType}-${group.platform}`}>
          {group.storyType === 'long_novel' ? '长篇' : '短篇'} × {group.platform} · 样本 {group.samples} · 已标注 {group.labeled} · precision {pct(group.precision)} · recall {pct(group.recall)} · 误报 {group.falsePositives} · 漏报 {group.falseNegatives} · 修复成功 {pct(group.repairSuccessRate)} · 破坏率 {pct(group.destructionRate)}
        </p>)}
      </details>
    </>}
  </section>;
}
