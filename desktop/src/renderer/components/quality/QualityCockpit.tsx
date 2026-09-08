import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const labels: Record<string, string> = {
  project: '项目', world: '世界观', character: '角色', outline: '大纲', chapter: '正文', refinement: '精修',
  platform: '平台', category: '分类', tone: '基调', style: '风格', genre: '流派', pov: '视角',
  context: '上下文', logic: '逻辑', completeness: '完整度', prose: '文体',
  blocking: '阻断', high: '严重', medium: '一般', low: '轻微', info: '提示',
};
type Dimension = { score: number | null; status: string; reason: string; evidence: string[] };
type Score = { overallScore: number | null; coverage: number; dimensions: Record<string, Dimension> };
type Cockpit = {
  scope: string;
  scores: Record<string, Score | null>;
  issues: Array<{ id: string; severity: string; summary: string; evidence: string }>;
  repairs?: Array<{ id: string; stage: string; status: string; reason: string; before_score: number | null; after_score: number | null; before_text?: string; after_text?: string }>;
};

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
    </>}
  </section>;
}
