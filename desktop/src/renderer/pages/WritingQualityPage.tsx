/**
 * WritingQualityPage - Phase 6.1 写作质量诊断与精修页面
 *
 * 功能：
 * - 章节选择与质量诊断
 * - 质量报告列表
 * - 问题列表查看与操作
 * - 局部精修建议与 diff 展示
 * - 精修应用与复查
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface ChapterSummary {
  id: string;
  volumeIndex: number;
  chapterIndex: number;
  title: string;
  wordCount: number;
  status: string;
}

interface QualityReport {
  id: string;
  projectId: string;
  chapterId: string;
  title: string;
  summary: string;
  overallLevel: string;
  overallScore: number | null;
  status: string;
  issueCount?: number;
  chapterLocked?: boolean;
  createdAt: string;
}

interface QualityIssue {
  id: string;
  reportId: string;
  projectId: string;
  chapterId: string;
  issueType: string;
  severity: string;
  title: string;
  summary: string;
  evidence: string;
  suggestion: string;
  paragraphIndex: number | null;
  sentenceIndex: number | null;
  startOffset: number | null;
  endOffset: number | null;
  originalText: string;
  suggestedText: string;
  tags: string[];
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}

interface RevisionResult {
  id: string;
  beforeText: string;
  afterText: string;
  reason: string;
  diff: Array<{ type: string; before: string; after: string }>;
  remainingRisk: string;
  canApply: boolean;
  locked: boolean;
  applied: boolean;
}

const WritingQualityPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // State
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [reports, setReports] = useState<QualityReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<QualityReport | null>(null);
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [refiningIssueId, setRefiningIssueId] = useState<string | null>(null);
  const [revisionResult, setRevisionResult] = useState<RevisionResult | null>(null);
  const [recheckResult, setRecheckResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'reports' | 'issues' | 'detail'>('reports');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  // Stats
  const [stats, setStats] = useState({ totalReports: 0, openIssues: 0, highIssues: 0, resolvedIssues: 0 });

  // Load chapters
  useEffect(() => {
    if (!projectId) return;
    loadChapters();
  }, [projectId]);

  const loadChapters = async () => {
    try {
      const res = await api.get<any>(`/projects/${projectId}/chapters`);
      const data = Array.isArray(res.data) ? res.data : (res as any);
      setChapters(data);
    } catch (err: any) {
      setError('加载章节列表失败: ' + (err.message || String(err)));
    }
  };

  // Load reports when chapter changes
  useEffect(() => {
    if (!projectId || !selectedChapterId) return;
    loadReports();
  }, [projectId, selectedChapterId]);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const queryStr = selectedChapterId ? `?chapterId=${selectedChapterId}&limit=50` : '?limit=50';
      const res = await api.get<any>(`/projects/${projectId}/writing-quality/reports${queryStr}`);
      const data = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
      setReports(data);

      // Calculate stats
      let openIssues = 0;
      let highIssues = 0;
      let resolvedIssues = 0;
      for (const r of data) {
        if (r.status === 'open') {
          // Need to load details for accurate counts, but use approximate
        }
      }
    } catch (err: any) {
      setError('加载报告失败: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  const selectReport = async (report: QualityReport) => {
    setSelectedReport(report);
    setActiveTab('detail');
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>(`/projects/${projectId}/writing-quality/reports/${report.id}`);
      const data = (res as any).data || res;
      setIssues(data.issues || []);
      // Update stats
      const allIssues = data.issues || [];
      setStats({
        totalReports: reports.length,
        openIssues: allIssues.filter((i: QualityIssue) => i.status === 'open').length,
        highIssues: allIssues.filter((i: QualityIssue) =>
          i.status === 'open' && (i.severity === 'high' || i.severity === 'critical'),
        ).length,
        resolvedIssues: allIssues.filter((i: QualityIssue) => i.status === 'resolved').length,
      });
    } catch (err: any) {
      setError('加载报告详情失败: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedChapterId) {
      setError('请先选择一个章节');
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const res = await api.post<any>(`/projects/${projectId}/writing-quality/analyze`, {
        chapterId: selectedChapterId,
      });
      const data = (res as any).data || res;
      await loadReports();
      if (data.report) {
        await selectReport(data.report);
      }
    } catch (err: any) {
      setError('质量诊断失败: ' + (err.message || String(err)));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleResolve = async (issueId: string) => {
    try {
      await api.post(`/projects/${projectId}/writing-quality/issues/${issueId}/resolve`);
      // Refresh
      if (selectedReport) await selectReport(selectedReport);
    } catch (err: any) {
      setError('标记失败: ' + (err.message || String(err)));
    }
  };

  const handleRefine = async (issueId: string) => {
    setRefiningIssueId(issueId);
    setRevisionResult(null);
    try {
      const res = await api.post<any>(`/projects/${projectId}/writing-quality/issues/${issueId}/refine`, {
        mode: 'generate_patch',
      });
      const data = (res as any).data || res;
      setRevisionResult(data.revision || data);
    } catch (err: any) {
      setError('精修建议生成失败: ' + (err.message || String(err)));
    } finally {
      setRefiningIssueId(null);
    }
  };

  const handleApplyRevision = async (revisionId: string) => {
    try {
      const res = await api.post<any>(`/projects/${projectId}/writing-quality/revisions/${revisionId}/apply`);
      const data = (res as any).data || res;
      if (data.success) {
        setRevisionResult((prev) => prev ? { ...prev, applied: true } : null);
        // Trigger recheck
        if (data.needsRecheck) {
          const recheckRes = await api.post<any>(`/projects/${projectId}/writing-quality/revisions/${revisionId}/recheck`);
          const recheckData = (recheckRes as any).data || recheckRes;
          setRecheckResult(recheckData.result || recheckData);
        }
      }
    } catch (err: any) {
      setError('应用精修失败: ' + (err.message || String(err)));
    }
  };

  // Filter issues
  const filteredIssues = issues.filter(i => {
    if (filterSeverity !== 'all' && i.severity !== filterSeverity) return false;
    if (filterType !== 'all' && i.issueType !== filterType) return false;
    return true;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#ef4444';
      case 'high': return '#f97316';
      case 'medium': return '#eab308';
      case 'low': return '#22c55e';
      default: return '#6c6c80';
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return '#ef4444';
      case 'high': return '#f97316';
      case 'medium': return '#eab308';
      case 'low': return '#22c55e';
      default: return '#6c6c80';
    }
  };

  const getIssueTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      reader_hook: '开篇钩子',
      retention_point: '留存点',
      emotional_payoff: '情绪回报',
      meme_point: '记忆点',
      chapter_hook: '章节钩子',
      pacing_risk: '节奏风险',
      low_retention: '低留存',
      needs_payoff: '需回报',
      needs_hook: '需钩子',
      ai_pattern_risk: 'AI模板',
      template_repetition: '模板重复',
      too_abstract: '太抽象',
      too_expository: '说明过多',
      flat_dialogue: '对话平淡',
      same_voice_characters: '角色同声',
      lack_of_subtext: '缺潜台词',
      repeated_emotion_action: '重复情绪',
      low_specificity: '细节不足',
      over_explained: '过度解释',
      needs_detail: '需细节',
      needs_character_voice: '需角色声音',
      needs_asymmetry: '需差异性',
    };
    return labels[type] || type;
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      padding: '24px',
      maxWidth: '1400px',
      margin: '0 auto',
      color: '#e2e8f0',
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '24px',
    },
    title: {
      fontSize: '24px',
      fontWeight: 700,
      color: '#f1f5f9',
    },
    subtitle: {
      fontSize: '13px',
      color: '#94a3b8',
      marginTop: '4px',
    },
    statsRow: {
      display: 'flex',
      gap: '16px',
      marginBottom: '24px',
      flexWrap: 'wrap' as const,
    },
    statCard: {
      background: '#1e293b',
      borderRadius: '10px',
      padding: '16px 20px',
      minWidth: '140px',
      border: '1px solid #334155',
    },
    statValue: {
      fontSize: '28px',
      fontWeight: 700,
      color: '#f1f5f9',
    },
    statLabel: {
      fontSize: '12px',
      color: '#94a3b8',
      marginTop: '4px',
    },
    controls: {
      display: 'flex',
      gap: '12px',
      marginBottom: '20px',
      alignItems: 'center',
      flexWrap: 'wrap' as const,
    },
    select: {
      padding: '8px 12px',
      borderRadius: '8px',
      border: '1px solid #334155',
      background: '#1e293b',
      color: '#e2e8f0',
      fontSize: '14px',
      minWidth: '180px',
    },
    button: {
      padding: '8px 18px',
      borderRadius: '8px',
      border: 'none',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      background: '#3b82f6',
      color: '#fff',
      transition: 'all 0.2s',
    },
    buttonSecondary: {
      padding: '8px 18px',
      borderRadius: '8px',
      border: '1px solid #334155',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      background: '#1e293b',
      color: '#e2e8f0',
      transition: 'all 0.2s',
    },
    buttonDanger: {
      padding: '8px 18px',
      borderRadius: '8px',
      border: 'none',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      background: '#ef4444',
      color: '#fff',
    },
    buttonSmall: {
      padding: '4px 12px',
      borderRadius: '6px',
      border: '1px solid #334155',
      fontSize: '12px',
      fontWeight: 500,
      cursor: 'pointer',
      background: '#1e293b',
      color: '#e2e8f0',
    },
    reportCard: {
      background: '#1e293b',
      borderRadius: '10px',
      padding: '16px',
      marginBottom: '12px',
      border: '1px solid #334155',
      cursor: 'pointer',
      transition: 'border-color 0.2s',
    },
    reportCardSelected: {
      borderColor: '#3b82f6',
    },
    reportHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px',
    },
    reportTitle: {
      fontSize: '16px',
      fontWeight: 600,
      color: '#f1f5f9',
    },
    reportMeta: {
      fontSize: '12px',
      color: '#94a3b8',
      marginTop: '4px',
    },
    issueCard: {
      background: '#1e293b',
      borderRadius: '10px',
      padding: '16px',
      marginBottom: '12px',
      border: '1px solid #334155',
    },
    issueHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '8px',
    },
    issueTitle: {
      fontSize: '15px',
      fontWeight: 600,
      color: '#f1f5f9',
    },
    badge: {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 600,
      textTransform: 'uppercase' as const,
    },
    tabRow: {
      display: 'flex',
      gap: '4px',
      marginBottom: '20px',
      borderBottom: '1px solid #334155',
      paddingBottom: '8px',
    },
    tab: {
      padding: '8px 16px',
      borderRadius: '6px 6px 0 0',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      color: '#94a3b8',
      border: 'none',
      background: 'transparent',
      transition: 'all 0.2s',
    },
    tabActive: {
      color: '#3b82f6',
      borderBottom: '2px solid #3b82f6',
      fontWeight: 600,
    },
    sectionBox: {
      background: '#1e293b',
      borderRadius: '10px',
      padding: '20px',
      marginBottom: '16px',
      border: '1px solid #334155',
    },
    sectionTitle: {
      fontSize: '18px',
      fontWeight: 600,
      color: '#f1f5f9',
      marginBottom: '12px',
    },
    text: {
      fontSize: '14px',
      color: '#cbd5e1',
      lineHeight: '1.7',
    },
    textMuted: {
      fontSize: '13px',
      color: '#94a3b8',
    },
    textBlock: {
      background: '#0f172a',
      borderRadius: '8px',
      padding: '12px',
      fontSize: '13px',
      color: '#e2e8f0',
      whiteSpace: 'pre-wrap' as const,
      lineHeight: '1.6',
      marginTop: '8px',
      border: '1px solid #1e293b',
    },
    diffAdd: {
      background: 'rgba(34, 197, 94, 0.15)',
      color: '#4ade80',
      padding: '2px 4px',
      borderRadius: '3px',
    },
    diffDelete: {
      background: 'rgba(239, 68, 68, 0.15)',
      color: '#f87171',
      padding: '2px 4px',
      borderRadius: '3px',
      textDecoration: 'line-through',
    },
    loading: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
      color: '#94a3b8',
      fontSize: '15px',
    },
    errorBanner: {
      background: 'rgba(239, 68, 68, 0.12)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '8px',
      padding: '12px 16px',
      marginBottom: '16px',
      color: '#fca5a5',
      fontSize: '14px',
    },
    emptyState: {
      textAlign: 'center' as const,
      padding: '60px 20px',
      color: '#94a3b8',
      fontSize: '15px',
    },
    noteBox: {
      background: 'rgba(59, 130, 246, 0.08)',
      border: '1px solid rgba(59, 130, 246, 0.2)',
      borderRadius: '8px',
      padding: '10px 14px',
      marginBottom: '16px',
      fontSize: '12px',
      color: '#93c5fd',
    },
    actions: {
      display: 'flex',
      gap: '8px',
      marginTop: '12px',
      flexWrap: 'wrap' as const,
    },
    tag: {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      background: '#334155',
      color: '#94a3b8',
      marginRight: '4px',
    },
    filterBar: {
      display: 'flex',
      gap: '8px',
      marginBottom: '12px',
      flexWrap: 'wrap' as const,
      alignItems: 'center',
    },
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>写作质量诊断中心</div>
          <div style={styles.subtitle}>质量诊断不等于状态确稿 —— 本页关注写作质量，状态事实请前往状态确稿中心确认</div>
        </div>
        <button
          style={styles.buttonSecondary}
          onClick={() => navigate(`/project/${projectId}/dashboard`)}
        >
          返回项目
        </button>
      </div>

      {/* Note */}
      <div style={styles.noteBox}>
        质量诊断中心用于发现正文的写作质量问题（钩子、节奏、对话、AI味等），并提供局部精修建议。
        <strong>locked 章节只能诊断不能修改</strong>。
        角色/世界观/时间线/伏笔等长期状态事实请前往 <strong>状态确稿中心</strong>。
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <select
          style={styles.select}
          value={selectedChapterId}
          onChange={(e) => setSelectedChapterId(e.target.value)}
        >
          <option value="">-- 选择章节 --</option>
          {chapters.map((ch) => (
            <option key={ch.id} value={ch.id}>
              第{ch.volumeIndex}卷 第{ch.chapterIndex}章 {ch.title} [{ch.status}]
            </option>
          ))}
        </select>
        <button
          style={{
            ...styles.button,
            opacity: analyzing || !selectedChapterId ? 0.6 : 1,
            cursor: analyzing || !selectedChapterId ? 'not-allowed' : 'pointer',
          }}
          onClick={handleAnalyze}
          disabled={analyzing || !selectedChapterId}
        >
          {analyzing ? '诊断中...' : '诊断当前章节'}
        </button>
        <button style={styles.buttonSecondary} onClick={loadReports}>
          刷新报告
        </button>
      </div>

      {/* Error */}
      {error && <div style={styles.errorBanner}>{error}</div>}

      {/* Loading */}
      {loading && <div style={styles.loading}>加载中...</div>}

      {/* No data */}
      {!loading && reports.length === 0 && !error && (
        <div style={styles.emptyState}>
          <p>暂无质量诊断报告</p>
          <p style={{ fontSize: '13px', color: '#64748b' }}>
            选择一个章节，点击「诊断当前章节」开始质量分析
          </p>
        </div>
      )}

      {/* Reports list */}
      {!loading && reports.length > 0 && (
        <div>
          {/* Tabs */}
          <div style={styles.tabRow}>
            <button
              style={{ ...styles.tab, ...(activeTab === 'reports' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('reports')}
            >
              诊断报告 ({reports.length})
            </button>
            {selectedReport && (
              <button
                style={{ ...styles.tab, ...(activeTab === 'detail' ? styles.tabActive : {}) }}
                onClick={() => setActiveTab('detail')}
              >
                问题详情 ({issues.length})
              </button>
            )}
          </div>

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <div>
              {reports.map((report) => (
                <div
                  key={report.id}
                  style={{
                    ...styles.reportCard,
                    ...(selectedReport?.id === report.id ? styles.reportCardSelected : {}),
                  }}
                  onClick={() => selectReport(report)}
                >
                  <div style={styles.reportHeader}>
                    <div>
                      <span style={styles.reportTitle}>{report.title}</span>
                      <span
                        style={{
                          ...styles.badge,
                          marginLeft: '12px',
                          background: `${getLevelColor(report.overallLevel)}22`,
                          color: getLevelColor(report.overallLevel),
                        }}
                      >
                        {report.overallLevel.toUpperCase()}
                      </span>
                      {report.overallScore != null && (
                        <span style={{ ...styles.badge, marginLeft: '8px', background: '#334155', color: '#e2e8f0' }}>
                          评分: {report.overallScore}
                        </span>
                      )}
                    </div>
                    <span style={styles.reportMeta}>
                      {new Date(report.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={styles.text}>{report.summary}</div>
                  {report.chapterLocked && (
                    <div style={{ ...styles.badge, marginTop: '8px', background: '#ef444422', color: '#ef4444' }}>
                      LOCKED
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Detail Tab */}
          {activeTab === 'detail' && selectedReport && (
            <div>
              {/* Stats */}
              <div style={styles.statsRow}>
                <div style={styles.statCard}>
                  <div style={styles.statValue}>{stats.openIssues}</div>
                  <div style={styles.statLabel}>未解决问题</div>
                </div>
                <div style={{ ...styles.statCard, borderColor: '#f97316' }}>
                  <div style={{ ...styles.statValue, color: '#f97316' }}>{stats.highIssues}</div>
                  <div style={styles.statLabel}>高/严重风险</div>
                </div>
                <div style={{ ...styles.statCard, borderColor: '#22c55e' }}>
                  <div style={{ ...styles.statValue, color: '#22c55e' }}>{stats.resolvedIssues}</div>
                  <div style={styles.statLabel}>已解决</div>
                </div>
              </div>

              {/* Filters */}
              <div style={styles.filterBar}>
                <span style={styles.textMuted}>筛选:</span>
                <select
                  style={{ ...styles.select, minWidth: '120px' }}
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value)}
                >
                  <option value="all">所有严重度</option>
                  <option value="critical">严重</option>
                  <option value="high">高危</option>
                  <option value="medium">中危</option>
                  <option value="low">低危</option>
                </select>
                <select
                  style={{ ...styles.select, minWidth: '140px' }}
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <option value="all">所有类型</option>
                  <option value="reader_hook">开篇钩子</option>
                  <option value="pacing_risk">节奏风险</option>
                  <option value="ai_pattern_risk">AI模板</option>
                  <option value="flat_dialogue">对话平淡</option>
                  <option value="too_abstract">太抽象</option>
                  <option value="needs_hook">需钩子</option>
                  <option value="emotional_payoff">情绪回报</option>
                  <option value="too_expository">说明过多</option>
                  <option value="low_specificity">细节不足</option>
                </select>
                <span style={{ ...styles.textMuted, marginLeft: '8px' }}>
                  共 {filteredIssues.length} 个问题
                </span>
              </div>

              {/* Issues list */}
              <div>
                {filteredIssues.map((issue) => (
                  <div key={issue.id} style={styles.issueCard}>
                    <div style={styles.issueHeader}>
                      <div>
                        <div style={styles.issueTitle}>{issue.title}</div>
                        <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
                          <span style={{
                            ...styles.badge,
                            background: `${getSeverityColor(issue.severity)}22`,
                            color: getSeverityColor(issue.severity),
                          }}>
                            {issue.severity.toUpperCase()}
                          </span>
                          <span style={styles.tag}>
                            {getIssueTypeLabel(issue.issueType)}
                          </span>
                          {issue.tags.filter(t => t !== issue.issueType).slice(0, 3).map(tag => (
                            <span key={tag} style={styles.tag}>{getIssueTypeLabel(tag)}</span>
                          ))}
                          {issue.status === 'resolved' && (
                            <span style={{ ...styles.badge, background: '#22c55e22', color: '#22c55e' }}>
                              RESOLVED
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ ...styles.text, marginTop: '8px' }}>
                      {issue.summary}
                    </div>

                    {issue.evidence && (
                      <div style={{ marginTop: '8px' }}>
                        <span style={styles.textMuted}>证据：</span>
                        <div style={styles.textBlock}>{issue.evidence}</div>
                      </div>
                    )}

                    {issue.suggestion && (
                      <div style={{ marginTop: '8px' }}>
                        <span style={styles.textMuted}>建议：</span>
                        <div style={styles.text}>{issue.suggestion}</div>
                      </div>
                    )}

                    {issue.paragraphIndex != null && (
                      <div style={{ ...styles.textMuted, marginTop: '4px' }}>
                        定位：段落 {issue.paragraphIndex + 1}{issue.sentenceIndex != null ? `, 句子 ${issue.sentenceIndex + 1}` : ''}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={styles.actions}>
                      {issue.status !== 'resolved' && (
                        <>
                          <button
                            style={styles.buttonSmall}
                            onClick={() => handleResolve(issue.id)}
                          >
                            标记已解决
                          </button>
                          <button
                            style={{
                              ...styles.buttonSmall,
                              background: '#3b82f6',
                              color: '#fff',
                              opacity: refiningIssueId === issue.id ? 0.6 : 1,
                            }}
                            onClick={() => handleRefine(issue.id)}
                            disabled={refiningIssueId === issue.id}
                          >
                            {refiningIssueId === issue.id ? '生成中...' : '生成精修建议'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Revision result */}
              {revisionResult && (
                <div style={styles.sectionBox}>
                  <div style={styles.sectionTitle}>
                    精修建议
                    <span style={{
                      ...styles.badge,
                      marginLeft: '12px',
                      background: revisionResult.canApply ? '#22c55e22' : '#ef444422',
                      color: revisionResult.canApply ? '#22c55e' : '#ef4444',
                    }}>
                      {revisionResult.locked ? 'LOCKED - 只读' : revisionResult.canApply ? '可应用' : '建议模式'}
                    </span>
                  </div>

                  <div style={styles.text}>{revisionResult.reason}</div>

                  {/* Diff */}
                  <div style={{ marginTop: '16px' }}>
                    <div style={styles.textMuted}>修改对比 (Diff)：</div>
                    {revisionResult.diff.length > 0 ? (
                      <div style={{ ...styles.textBlock, marginTop: '8px' }}>
                        {revisionResult.diff.map((d, idx) => (
                          <div key={idx} style={{ marginBottom: '6px' }}>
                            <span style={{ fontSize: '11px', color: '#64748b', marginRight: '8px' }}>
                              [{d.type}]
                            </span>
                            {d.type === 'delete' && (
                              <span style={styles.diffDelete}>{d.before}</span>
                            )}
                            {d.type === 'insert' && (
                              <span style={styles.diffAdd}>{d.after}</span>
                            )}
                            {d.type === 'replace' && (
                              <>
                                <span style={styles.diffDelete}>{d.before}</span>
                                {' → '}
                                <span style={styles.diffAdd}>{d.after}</span>
                              </>
                            )}
                            {d.type === 'keep' && (
                              <span>{d.before}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ ...styles.textBlock, marginTop: '8px' }}>
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ ...styles.textMuted, marginBottom: '4px' }}>修改前 (Before)：</div>
                          <div style={{ ...styles.diffDelete }}>{revisionResult.beforeText}</div>
                        </div>
                        <div>
                          <div style={{ ...styles.textMuted, marginBottom: '4px' }}>修改后 (After)：</div>
                          <div style={{ ...styles.diffAdd }}>{revisionResult.afterText}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Apply button */}
                  {revisionResult.canApply && !revisionResult.applied && (
                    <div style={styles.actions}>
                      <button
                        style={styles.button}
                        onClick={() => handleApplyRevision(revisionResult.id)}
                      >
                        应用精修到章节
                      </button>
                    </div>
                  )}

                  {revisionResult.applied && (
                    <div style={{ ...styles.text, marginTop: '12px', color: '#22c55e' }}>
                      ✓ 精修已应用
                    </div>
                  )}

                  {revisionResult.locked && !revisionResult.canApply && (
                    <div style={{ ...styles.text, marginTop: '12px', color: '#f87171' }}>
                      此章节已锁定，无法自动应用修改
                    </div>
                  )}
                </div>
              )}

              {/* Recheck result */}
              {recheckResult && (
                <div style={styles.sectionBox}>
                  <div style={styles.sectionTitle}>
                    复查结果
                    <span style={{
                      ...styles.badge,
                      marginLeft: '12px',
                      background: recheckResult.level === 'pass' ? '#22c55e22' :
                        recheckResult.level === 'fail' ? '#ef444422' : '#eab30822',
                      color: recheckResult.level === 'pass' ? '#22c55e' :
                        recheckResult.level === 'fail' ? '#ef4444' : '#eab308',
                    }}>
                      {recheckResult.level.toUpperCase()}
                    </span>
                  </div>
                  <div style={styles.text}>{recheckResult.summary}</div>
                  {recheckResult.remainingIssues > 0 && (
                    <div style={{ ...styles.text, marginTop: '8px', color: '#f97316' }}>
                      仍有 {recheckResult.remainingIssues} 个问题待处理
                    </div>
                  )}
                  {recheckResult.newIssues > 0 && (
                    <div style={{ ...styles.text, marginTop: '4px', color: '#ef4444' }}>
                      新发现 {recheckResult.newIssues} 个问题
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WritingQualityPage;
