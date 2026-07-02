/**
 * WeeklySummaryPage - 每周写作总结
 *
 * 统一设计，不区分长短篇。
 * 功能：
 * 1. 本周写作进度（已完成章数、字数统计）
 * 2. 连贯性检查（调用 AI）
 * 3. 下周计划（从大纲获取未完成章节）
 * 4. 伏笔状态（待回收/已回收统计）
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const WeeklySummaryPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // 本周日期范围
  const [weekOffset, setWeekOffset] = useState(0); // 0=本周, -1=上周, 1=下周
  const [weekRange, setWeekRange] = useState({ start: '', end: '' });

  // 数据
  const [project, setProject] = useState<any>(null);
  const [outline, setOutline] = useState<any[]>([]); // 大纲章节
  const [foreshadowings, setForeshadowings] = useState<any[]>([]); // 伏笔
  const [chapters, setChapters] = useState<any[]>([]); // 已完成章节

  // 连贯性检查
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<any>(null);

  // 计算本周日期范围
  useEffect(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=周日, 1=周一...
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + weekOffset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    setWeekRange({
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0],
    });
  }, [weekOffset]);

  // 加载数据
  useEffect(() => {
    if (!projectId) return;
    loadData();
  }, [projectId, weekOffset]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // 1. 获取项目信息
      const projRes = await api.get(`/projects/${projectId}`);
      setProject(projRes.data);

      // 2. 获取大纲（用于下周计划）
      try {
        const outlineRes = await api.get(`/outlines?projectId=${projectId}&level=chapter`);
        setOutline((outlineRes.data as any[]) || []);
      } catch (e) { /* 大纲可能为空 */ }

      // 3. 获取伏笔
      try {
        const fsRes = await api.get(`/foreshadowings?projectId=${projectId}`);
        setForeshadowings((fsRes.data as any[]) || []);
      } catch (e) { /* 伏笔可能为空 */ }

      // 4. 获取已完成章节（调用章节API或项目统计）
      try {
        const chRes = await api.get(`/projects/${projectId}/chapters`);
        setChapters((chRes.data as any[]) || []);
      } catch (e) {
        // 如果章节API不存在，用空数组
        setChapters([]);
      }
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, weekOffset]);

  // 连贯性检查
  const handleConsistencyCheck = useCallback(async () => {
    if (!projectId || chapters.length === 0) {
      setError('请先完成至少一章，再执行连贯性检查');
      return;
    }

    setChecking(true);
    setCheckResult(null);
    try {
      // 调用 stage2-consistency-check 模板
      const result = await api.post('/chain/templates/execute/stage2-consistency-check', {
        user_input: {
          projectId,
          chapters: chapters.slice(-3), // 检查最近3章
          checkItems: ['name_consistency', 'timeline_consistency', 'foreshadowing_consistency'],
        },
      });
      setCheckResult(result.data);
    } catch (err: any) {
      setError(err.message || '检查失败');
    } finally {
      setChecking(false);
    }
  }, [projectId, chapters]);

  // 计算统计
  const stats = {
    totalChapters: outline.length,
    completedChapters: chapters.length,
    pendingChapters: outline.length - chapters.length,
    totalWords: chapters.reduce((sum, ch) => sum + (ch.wordCount || (ch.content || '').length), 0),
    thisWeekPlanned: 5, // 默认本周计划5章（可从项目设置获取）
    completionRate: outline.length > 0 ? Math.round((chapters.length / outline.length) * 100) : 0,
  };

  // 伏笔统计
  const fsStats = {
    total: foreshadowings.length,
    pending: foreshadowings.filter((f: any) => f.status === 'pending' || !f.status).length,
    recovered: foreshadowings.filter((f: any) => f.status === 'recovered').length,
  };

  // 下周计划（未完成章节，取前5章）
  const nextWeekChapters = outline
    .filter((ch: any) => !chapters.some((c: any) => c.outlineId === ch.id || c.chapterNumber === ch.chapterNumber))
    .slice(0, 5);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#8a8aa0' }}>
        加载中...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 顶部导航 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <button onClick={() => navigate(`/project/${projectId}/dashboard`)} style={styles.backButton}>
            ← 返回首页
          </button>
          <h2 style={{ margin: '8px 0 4px 0', color: '#e0e0e0' }}>📅 每周写作总结</h2>
          <p style={{ margin: 0, color: '#8a8aa0', fontSize: '14px' }}>
            {weekRange.start} ~ {weekRange.end}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setWeekOffset(weekOffset - 1)} style={styles.weekButton}>← 上周</button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} style={styles.weekButton}>本周</button>
          )}
          <button onClick={() => setWeekOffset(weekOffset + 1)} style={styles.weekButton}>下周 →</button>
        </div>
      </div>

      {error && (
        <div style={styles.errorBox}>{error}</div>
      )}

      {/* 统计卡片 */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{stats.completedChapters}</div>
          <div style={styles.statLabel}>已完成章节</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{stats.totalWords.toLocaleString()}</div>
          <div style={styles.statLabel}>总字数</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{stats.completionRate}%</div>
          <div style={styles.statLabel}>完成进度</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{stats.pendingChapters}</div>
          <div style={styles.statLabel}>待完成章节</div>
        </div>
      </div>

      {/* 主要内容区 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '24px' }}>
        {/* 左侧：下周计划 + 伏笔状态 */}
        <div>
          {/* 下周计划 */}
          <div style={styles.sectionBox}>
            <h3 style={styles.sectionTitle}>📋 下周计划</h3>
            {nextWeekChapters.length === 0 ? (
              <p style={styles.emptyText}>所有章节已完成，或暂无大纲数据</p>
            ) : (
              <ul style={styles.chapterList}>
                {nextWeekChapters.map((ch: any, idx: number) => (
                  <li key={idx} style={styles.chapterItem}>
                    <span style={styles.chapterNumber}>第{ch.chapterNumber || idx + 1}章</span>
                    <span style={styles.chapterTitle}>{ch.title || '未命名章节'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 伏笔状态 */}
          <div style={styles.sectionBox}>
            <h3 style={styles.sectionTitle}>🎯 伏笔状态</h3>
            <div style={styles.fsStats}>
              <div style={styles.fsStatItem}>
                <span style={styles.fsStatNumber}>{fsStats.total}</span>
                <span style={styles.fsStatLabel}>总数</span>
              </div>
              <div style={styles.fsStatItem}>
                <span style={{ ...styles.fsStatNumber, color: '#ffd700' }}>{fsStats.pending}</span>
                <span style={styles.fsStatLabel}>待回收</span>
              </div>
              <div style={styles.fsStatItem}>
                <span style={{ ...styles.fsStatNumber, color: '#00ff88' }}>{fsStats.recovered}</span>
                <span style={styles.fsStatLabel}>已回收</span>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：连贯性检查 */}
        <div>
          <div style={styles.sectionBox}>
            <h3 style={styles.sectionTitle}>🔍 连贯性检查</h3>
            <p style={{ color: '#8a8aa0', fontSize: '14px', marginBottom: '12px' }}>
              检查最近章节的命名一致性、时间线连贯性、伏笔回收情况
            </p>
            <button
              onClick={handleConsistencyCheck}
              disabled={checking || chapters.length === 0}
              style={styles.checkButton}
            >
              {checking ? '检查中...' : '开始检查'}
            </button>

            {checkResult && (
              <div style={styles.checkResult}>
                <h4 style={{ margin: '12px 0 8px 0', color: '#e0e0e0' }}>检查结果</h4>
                {(checkResult.issues || []).length === 0 ? (
                  <p style={{ color: '#00ff88' }}>✅ 未发现连贯性问题</p>
                ) : (
                  <ul style={styles.issueList}>
                    {(checkResult.issues || []).map((issue: any, idx: number) => (
                      <li key={idx} style={styles.issueItem}>
                        <span style={{ color: issue.severity === 'high' ? '#ff4444' : '#ffd700' }}>
                          {issue.type}：
                        </span>
                        {issue.description}
                        {issue.suggestion && (
                          <span style={{ color: '#8a8aa0', marginLeft: '8px' }}>
                            → {issue.suggestion}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  backButton: {
    background: 'none',
    border: 'none',
    color: '#8a8aa0',
    cursor: 'pointer',
    padding: '4px 0',
    fontSize: '14px',
  },
  weekButton: {
    padding: '6px 12px',
    background: '#2a2a3e',
    border: '1px solid #3a3a5e',
    borderRadius: '6px',
    color: '#e0e0e0',
    cursor: 'pointer',
  },
  errorBox: {
    padding: '12px',
    background: 'rgba(255,68,68,0.1)',
    border: '1px solid #ff4444',
    borderRadius: '8px',
    color: '#ff4444',
    marginBottom: '16px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  statCard: {
    background: '#1a1a2e',
    border: '1px solid #2a2a4e',
    borderRadius: '12px',
    padding: '20px',
    textAlign: 'center',
  },
  statNumber: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#e94560',
    margin: '0 0 4px 0',
  },
  statLabel: {
    fontSize: '14px',
    color: '#8a8aa0',
    margin: 0,
  },
  sectionBox: {
    background: '#1a1a2e',
    border: '1px solid #2a2a4e',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '20px',
  },
  sectionTitle: {
    margin: '0 0 16px 0',
    color: '#e0e0e0',
    fontSize: '18px',
  },
  emptyText: {
    color: '#8a8aa0',
    fontSize: '14px',
  },
  chapterList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  chapterItem: {
    padding: '8px 12px',
    background: '#2a2a3e',
    borderRadius: '6px',
    marginBottom: '8px',
    display: 'flex',
    justifyContent: 'space-between',
  },
  chapterNumber: {
    color: '#e94560',
    fontWeight: 'bold',
    marginRight: '12px',
  },
  chapterTitle: {
    color: '#e0e0e0',
  },
  fsStats: {
    display: 'flex',
    justifyContent: 'space-around',
    textAlign: 'center',
  },
  fsStatItem: {
    display: 'flex',
    flexDirection: 'column',
  },
  fsStatNumber: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#e0e0e0',
  },
  fsStatLabel: {
    fontSize: '12px',
    color: '#8a8aa0',
  },
  checkButton: {
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #e94560, #ff6b6b)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  checkResult: {
    marginTop: '16px',
    padding: '12px',
    background: '#2a2a3e',
    borderRadius: '8px',
  },
  issueList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  issueItem: {
    padding: '8px',
    background: 'rgba(255,68,68,0.05)',
    borderRadius: '6px',
    marginBottom: '6px',
    fontSize: '14px',
    color: '#e0e0e0',
  },
};

export default WeeklySummaryPage;
