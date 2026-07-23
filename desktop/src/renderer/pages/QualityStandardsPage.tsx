/**
 * QualityStandardsPage - H5 正文质量量化标准表
 * 展示11个写作质量维度的评分标准和说明
 * 对接 GET /refinement/quality/standards
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface QualityStandard {
  name: string;
  key: string;
  excellent: number;
  pass: number;
  fail: number;
  description: string;
  suggestion: string;
}

interface StandardWithScore extends QualityStandard {
  score: number;
  rating: '优秀' | '及格' | '不及格';
}

const QualityStandardsPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const [standards, setStandards] = useState<QualityStandard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 评分数据（从后端 API 获取）
  const [scores, setScores] = useState<Record<string, number>>({});

  useEffect(() => {
    loadStandards();
  }, []);

  const loadStandards = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<QualityStandard[]>('/refinement/quality/standards');
      const data = Array.isArray(res.data) ? res.data : (res as any);
      setStandards(data);
      
      // 从 API 初始化分数（如果后端返回评分数据）
      const initialScores: Record<string, number> = {};
      data.forEach((s: QualityStandard) => {
        // 量表页提供人工微调基线；章节实际评分由正文质量分析页保存并展示。
        initialScores[s.key] = 0;
      });
      setScores(initialScores);
    } catch (err: any) {
      setError(err.message || '加载标准失败');
      // 不加载 mock 数据，显示错误状态
      setStandards([]);
      setScores({});
    } finally {
      setLoading(false);
    }
  };

  const getRating = (key: string, score: number): '优秀' | '及格' | '不及格' => {
    const std = standards.find((s) => s.key === key);
    if (!std) return '及格';
    // AI痕迹指数：越低越好
    if (key === 'aiTraceIndex') {
      if (score <= std.excellent) return '优秀';
      if (score <= std.pass) return '及格';
      return '不及格';
    }
    if (score >= std.excellent) return '优秀';
    if (score >= std.pass) return '及格';
    return '不及格';
  };

  const getColorClass = (key: string, score: number): string => {
    const rating = getRating(key, score);
    if (rating === '优秀') return 'row-green';
    if (rating === '及格') return 'row-yellow';
    return 'row-red';
  };

  const getScoreBarColor = (key: string, score: number): string => {
    const rating = getRating(key, score);
    if (rating === '优秀') return '#22c55e';
    if (rating === '及格') return '#eab308';
    return '#ef4444';
  };

  const maxScore = (key: string): number => {
    return key === 'aiTraceIndex' ? 100 : 10;
  };

  const updateScore = (key: string, value: number) => {
    setScores((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>正文质量量化标准表</h1>
        <p style={styles.subtitle}>
          基于 H5 标准的 11 个写作质量维度评分体系
        </p>
      </div>

      {loading && (
        <div style={styles.loading}>加载中...</div>
      )}

      {error && !loading && (
        <div style={styles.error}>
          连接失败：{error}（请检查后端服务是否启动）
        </div>
      )}

      {/* 评分规则说明 */}
      <div style={styles.legendContainer}>
        <div style={styles.legendItem}>
          <span style={{ ...styles.legendDot, backgroundColor: '#22c55e' }} />
          <span>优秀（≥8分 / AI痕迹≤25）</span>
        </div>
        <div style={styles.legendItem}>
          <span style={{ ...styles.legendDot, backgroundColor: '#eab308' }} />
          <span>及格（6-7分 / AI痕迹≤40）</span>
        </div>
        <div style={styles.legendItem}>
          <span style={{ ...styles.legendDot, backgroundColor: '#ef4444' }} />
          <span>不及格（&lt;6分 / AI痕迹&gt;40）</span>
        </div>
      </div>

      {!loading && !error && standards.length === 0 && (
        <div style={styles.emptyState}>
          暂无质量标准数据，请检查后端 API 配置
        </div>
      )}

      {!loading && standards.length > 0 && (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, width: 20 }}>#</th>
                <th style={styles.th}>维度名称</th>
                <th style={{ ...styles.th, width: 100 }}>评分</th>
                <th style={{ ...styles.th, width: 100 }}>评级</th>
                <th style={{ ...styles.th, width: 120 }}>阈值范围</th>
                <th style={styles.th}>评分说明</th>
                <th style={styles.th}>改进建议</th>
              </tr>
            </thead>
            <tbody>
              {standards.map((std, index) => {
                const score = scores[std.key] ?? 0;
                const rating = getRating(std.key, score);
                const isAiIndex = std.key === 'aiTraceIndex';

                return (
                  <tr key={std.key} style={{ ...styles.tr, ...styles[getColorClass(std.key, score) as keyof typeof styles] }}>
                    <td style={styles.td}>{index + 1}</td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>
                      {std.name}
                      {isAiIndex && <span style={styles.aiBadge}>AI</span>}
                    </td>
                    <td style={styles.td}>
                      <div style={styles.scoreControl}>
                        <input
                          type="range"
                          min={isAiIndex ? 0 : 0}
                          max={maxScore(std.key)}
                          step={1}
                          value={score}
                          onChange={(e) => updateScore(std.key, Number(e.target.value))}
                          style={styles.slider}
                        />
                        <span
                          style={{
                            ...styles.scoreValue,
                            color: getScoreBarColor(std.key, score),
                          }}
                        >
                          {score}{isAiIndex ? '%' : ''}
                        </span>
                      </div>
                      {/* 进度条 */}
                      <div style={styles.barBg}>
                        <div
                          style={{
                            ...styles.barFill,
                            width: isAiIndex
                              ? `${Math.min(100, score)}%`
                              : `${(score / 10) * 100}%`,
                            backgroundColor: getScoreBarColor(std.key, score),
                          }}
                        />
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.ratingBadge,
                          backgroundColor:
                            rating === '优秀' ? '#22c55e' :
                            rating === '及格' ? '#eab308' : '#ef4444',
                        }}
                      >
                        {rating}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.thresholdInfo}>
                        {isAiIndex ? (
                          <>
                            <span style={styles.thresholdGreen}>优秀 ≤{std.excellent}</span>
                            <br />
                            <span style={styles.thresholdYellow}>及格 ≤{std.pass}</span>
                            <br />
                            <span style={styles.thresholdRed}>不及格 &gt;{std.pass}</span>
                          </>
                        ) : (
                          <>
                            <span style={styles.thresholdGreen}>优秀 ≥{std.excellent}</span>
                            <br />
                            <span style={styles.thresholdYellow}>及格 ≥{std.pass}</span>
                            <br />
                            <span style={styles.thresholdRed}>不及格 &lt;{std.pass}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td style={styles.td}>{std.description}</td>
                    <td style={styles.td}>{std.suggestion}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 页脚 */}
      <div style={styles.footer}>
        <p>标准来源：H5 正文质量量化标准表 | AI写作平台</p>
        {projectId && <p>项目ID: {projectId}</p>}
      </div>

      <style>{`
        .row-green { background-color: rgba(34, 197, 94, 0.08); }
        .row-yellow { background-color: rgba(234, 179, 8, 0.08); }
        .row-red { background-color: rgba(239, 68, 68, 0.08); }
        .row-green:hover { background-color: rgba(34, 197, 94, 0.15); }
        .row-yellow:hover { background-color: rgba(234, 179, 8, 0.15); }
        .row-red:hover { background-color: rgba(239, 68, 68, 0.15); }
        input[type='range'] { cursor: pointer; }
        input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #6366f1; cursor: pointer; }
        input[type='range']::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #6366f1; cursor: pointer; border: none; }
      `}</style>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
    fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
    color: '#e2e8f0',
    background: '#0f172a',
    minHeight: '100vh',
  },
  header: { marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: 700, color: '#f1f5f9', margin: '0 0 8px 0' },
  subtitle: { fontSize: '14px', color: '#94a3b8', margin: 0 },
  loading: { textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '16px' },
  error: {
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#fca5a5',
    marginBottom: '16px',
    fontSize: '14px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px',
    color: '#94a3b8',
    fontSize: '14px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  legendContainer: {
    display: 'flex',
    gap: '24px',
    marginBottom: '16px',
    padding: '12px 16px',
    background: '#1e293b',
    borderRadius: '8px',
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#cbd5e1' },
  legendDot: { width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block' },
  tableWrapper: { overflowX: 'auto', borderRadius: '8px', border: '1px solid #334155' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: {
    padding: '12px 12px',
    textAlign: 'left',
    background: '#1e293b',
    color: '#94a3b8',
    fontWeight: 600,
    borderBottom: '2px solid #334155',
    whiteSpace: 'nowrap',
  },
  tr: { borderBottom: '1px solid #1e293b' },
  td: { padding: '12px 12px', verticalAlign: 'middle' },
  scoreControl: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  slider: { flex: 1, height: '4px', accentColor: '#6366f1' },
  scoreValue: { fontWeight: 700, fontSize: '15px', minWidth: '36px', textAlign: 'right' as const },
  barBg: { height: '4px', background: '#334155', borderRadius: '2px', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '2px', transition: 'width 0.2s, background-color 0.2s' },
  ratingBadge: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
  },
  thresholdInfo: { fontSize: '12px', lineHeight: 1.8 },
  thresholdGreen: { color: '#4ade80' },
  thresholdYellow: { color: '#facc15' },
  thresholdRed: { color: '#f87171' },
  aiBadge: {
    display: 'inline-block',
    marginLeft: '6px',
    padding: '0 6px',
    borderRadius: '3px',
    background: '#6366f1',
    color: '#fff',
    fontSize: '10px',
    fontWeight: 700,
    verticalAlign: 'middle',
  },
  footer: {
    marginTop: '24px',
    padding: '12px',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '12px',
    borderTop: '1px solid #334155',
  },
};

export default QualityStandardsPage;
