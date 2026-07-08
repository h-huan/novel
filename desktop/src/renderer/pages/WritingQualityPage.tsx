import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

const apiPayload = <T,>(res: any): T => res?.data ?? res;

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
  issueCount: number;
  openIssueCount: number;
  highIssueCount: number;
  resolvedIssueCount: number;
  chapterLocked: boolean;
  attention?: AttentionResult;
  createdAt: string;
}

interface RevisionResult {
  id: string;
  issueId: string;
  beforeText: string;
  afterText: string;
  reason: string;
  diff: Array<{ type: string; before: string; after: string }>;
  remainingRisk: string;
  canApply: boolean;
  locked?: boolean;
  applied: boolean;
  recheckResult?: any;
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
  originalText: string;
  suggestedText: string;
  tags: string[];
  status: string;
  latestRevision?: RevisionResult | null;
  revisions?: RevisionResult[];
  navigation?: { label?: string; path?: string; target?: string };
  recheckResult?: any;
  createdAt: string;
  resolvedAt: string | null;
}

interface AttentionResult {
  slipAwayRiskScore: number;
  level: string;
  checkpoints: Array<{ name: string; score: number; pass: boolean; issue?: string }>;
  shortStoryWindows: Array<{ start: number; end: number; score: number; risk: string }>;
  longReadThroughPromises: Array<{ name: string; present: boolean; suggestion: string }>;
  reasons: string[];
  revisionPlan: string[];
  alternativeOpenings: string[];
}

const OPEN_STATUSES = new Set(['open', 'planned', 'refined', 'recheck_failed']);

const WritingQualityPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const storageKey = projectId ? `phase69:wq:${projectId}` : 'phase69:wq';

  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [reports, setReports] = useState<QualityReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<QualityReport | null>(null);
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState('');
  const [activeTab, setActiveTab] = useState<'reports' | 'detail'>('reports');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [revisionResult, setRevisionResult] = useState<RevisionResult | null>(null);
  const [recheckResult, setRecheckResult] = useState<any>(null);
  const [attention, setAttention] = useState<AttentionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [busyIssueId, setBusyIssueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const persistView = useCallback((patch: Record<string, unknown>) => {
    try {
      const oldValue = JSON.parse(localStorage.getItem(storageKey) || '{}');
      localStorage.setItem(storageKey, JSON.stringify({ ...oldValue, ...patch }));
    } catch {
      localStorage.setItem(storageKey, JSON.stringify(patch));
    }
  }, [storageKey]);

  const restoreView = useCallback(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch {
      return {};
    }
  }, [storageKey]);

  const loadChapters = useCallback(async () => {
    if (!projectId) return;
    const res = await api.get<any>(`/projects/${projectId}/chapters`);
    const data = apiPayload<ChapterSummary[]>(res) || [];
    setChapters(data);
    const saved = restoreView();
    if (saved.selectedChapterId && data.some(ch => ch.id === saved.selectedChapterId)) {
      setSelectedChapterId(saved.selectedChapterId);
    } else if (!selectedChapterId && data[0]) {
      setSelectedChapterId(data[0].id);
    }
  }, [projectId, restoreView, selectedChapterId]);

  const loadReports = useCallback(async () => {
    if (!projectId || !selectedChapterId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>(`/projects/${projectId}/writing-quality/reports?chapterId=${selectedChapterId}&limit=50`);
      const data = apiPayload<QualityReport[]>(res) || [];
      setReports(data);
      const saved = restoreView();
      const reportToRestore = data.find(r => r.id === saved.selectedReportId);
      if (reportToRestore) {
        setSelectedReport(reportToRestore);
      }
    } catch (err: any) {
      setError(`加载报告失败：${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [projectId, restoreView, selectedChapterId]);

  const selectReport = useCallback(async (report: QualityReport) => {
    if (!projectId) return;
    setSelectedReport(report);
    setActiveTab('detail');
    setLoading(true);
    setError(null);
    persistView({ selectedReportId: report.id, activeTab: 'detail' });
    try {
      const res = await api.get<any>(`/projects/${projectId}/writing-quality/reports/${report.id}`);
      const data = apiPayload<{ report: QualityReport; issues: QualityIssue[] }>(res);
      setSelectedReport(data?.report || report);
      setIssues(data?.issues || []);
      setAttention(data?.report?.attention || null);
      const saved = restoreView();
      const issue = data?.issues?.find(i => i.id === saved.selectedIssueId);
      if (issue) {
        setSelectedIssueId(issue.id);
        setRevisionResult(issue.latestRevision || null);
        setRecheckResult(issue.recheckResult || issue.latestRevision?.recheckResult || null);
      }
    } catch (err: any) {
      setError(`加载报告详情失败：${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [persistView, projectId, restoreView]);

  useEffect(() => {
    loadChapters().catch((err: any) => setError(`加载章节失败：${err.message || String(err)}`));
  }, [loadChapters]);

  useEffect(() => {
    loadReports();
    persistView({ selectedChapterId });
  }, [loadReports, persistView, selectedChapterId]);

  useEffect(() => {
    const saved = restoreView();
    if (saved.activeTab === 'detail') setActiveTab('detail');
  }, [restoreView]);

  const stats = useMemo(() => ({
    totalReports: reports.length,
    openIssues: reports.reduce((sum, r) => sum + (r.openIssueCount || 0), 0),
    highIssues: reports.reduce((sum, r) => sum + (r.highIssueCount || 0), 0),
    resolvedIssues: reports.reduce((sum, r) => sum + (r.resolvedIssueCount || 0), 0),
  }), [reports]);

  const filteredIssues = issues.filter(issue => {
    if (filterSeverity !== 'all' && issue.severity !== filterSeverity) return false;
    if (filterType !== 'all' && issue.issueType !== filterType) return false;
    return true;
  });

  const selectIssue = (issue: QualityIssue) => {
    setSelectedIssueId(issue.id);
    setRevisionResult(issue.latestRevision || null);
    setRecheckResult(issue.recheckResult || issue.latestRevision?.recheckResult || null);
    persistView({ selectedIssueId: issue.id });
  };

  const refreshSelectedReport = async () => {
    await loadReports();
    if (selectedReport) await selectReport(selectedReport);
  };

  const handleAnalyze = async () => {
    if (!selectedChapterId || !projectId) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await api.post<any>(`/projects/${projectId}/writing-quality/analyze`, { chapterId: selectedChapterId });
      const data = apiPayload<any>(res);
      await loadReports();
      if (data?.report) await selectReport(data.report as QualityReport);
    } catch (err: any) {
      setError(`质量诊断失败：${err.message || String(err)}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAttention = async () => {
    if (!selectedChapterId || !projectId) return;
    setError(null);
    try {
      const res = await api.post<any>(`/projects/${projectId}/writing-quality/attention`, { chapterId: selectedChapterId, mode: 'auto' });
      const data = apiPayload<{ attention: AttentionResult }>(res);
      setAttention(data.attention);
      setActiveTab('detail');
    } catch (err: any) {
      setError(`注意力检查失败：${err.message || String(err)}`);
    }
  };

  const updateIssueStatus = async (issue: QualityIssue, status: string) => {
    if (!projectId) return;
    setBusyIssueId(issue.id);
    try {
      await api.post(`/projects/${projectId}/writing-quality/issues/${issue.id}/status`, { status });
      await refreshSelectedReport();
    } catch (err: any) {
      setError(`更新 issue 状态失败：${err.message || String(err)}`);
    } finally {
      setBusyIssueId(null);
    }
  };

  const handleRefine = async (issue: QualityIssue) => {
    if (!projectId) return;
    selectIssue(issue);
    setBusyIssueId(issue.id);
    try {
      const res = await api.post<any>(`/projects/${projectId}/writing-quality/issues/${issue.id}/refine`, { mode: 'generate_patch' });
      const data = apiPayload<{ revision: RevisionResult }>(res);
      setRevisionResult(data.revision || null);
      await refreshSelectedReport();
    } catch (err: any) {
      setError(`生成精修建议失败：${err.message || String(err)}`);
    } finally {
      setBusyIssueId(null);
    }
  };

  const handleApplyRevision = async (revisionId: string) => {
    if (!projectId) return;
    try {
      const res = await api.post<any>(`/projects/${projectId}/writing-quality/revisions/${revisionId}/apply`, {});
      const data = apiPayload<any>(res);
      if (data?.needsRecheck) {
        const recheckRes = await api.post<any>(`/projects/${projectId}/writing-quality/revisions/${revisionId}/recheck`, {});
        setRecheckResult(apiPayload<{ result: any }>(recheckRes)?.result || null);
      }
      setRevisionResult(prev => prev ? { ...prev, applied: true } : prev);
      await refreshSelectedReport();
    } catch (err: any) {
      setError(`应用精修失败：${err.message || String(err)}`);
    }
  };

  const handleIssueRecheck = async (issue: QualityIssue) => {
    if (!projectId) return;
    selectIssue(issue);
    setBusyIssueId(issue.id);
    try {
      const res = await api.post<any>(`/projects/${projectId}/writing-quality/issues/${issue.id}/recheck`, {});
      const data = apiPayload<{ result: any }>(res);
      setRecheckResult(data.result || null);
      await refreshSelectedReport();
    } catch (err: any) {
      setError(`单项复检失败：${err.message || String(err)}`);
    } finally {
      setBusyIssueId(null);
    }
  };

  const jumpToIssueTarget = (issue: QualityIssue) => {
    if (issue.navigation?.path) navigate(issue.navigation.path);
  };

  const statusLabel = (status: string) => ({
    open: '待处理',
    planned: '已计划',
    refined: '已出方案',
    applied: '已应用',
    recheck_passed: '复检通过',
    recheck_failed: '复检未过',
    ignored: '已忽略',
    archived: '已归档',
    resolved: '已解决',
  }[status] || status);

  const severityColor = (severity: string) => ({
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#22c55e',
  }[severity] || '#94a3b8');

  const styles: Record<string, React.CSSProperties> = {
    container: { padding: 24, maxWidth: 1440, margin: '0 auto', color: '#e2e8f0', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' },
    header: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 24, fontWeight: 700 },
    subtitle: { fontSize: 13, color: '#94a3b8', marginTop: 4 },
    row: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
    panel: { background: '#111827', border: '1px solid #334155', borderRadius: 8, padding: 16, marginBottom: 16 },
    card: { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 14, marginBottom: 12 },
    selectedCard: { borderColor: '#60a5fa' },
    select: { background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '8px 10px', minWidth: 180 },
    button: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontWeight: 600 },
    ghostButton: { background: '#0f172a', color: '#dbeafe', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' },
    smallButton: { background: '#0f172a', color: '#dbeafe', border: '1px solid #334155', borderRadius: 6, padding: '5px 9px', cursor: 'pointer', fontSize: 12 },
    muted: { color: '#94a3b8', fontSize: 13 },
    text: { color: '#cbd5e1', fontSize: 14, lineHeight: 1.7 },
    badge: { display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700 },
    block: { background: '#020617', border: '1px solid #1e293b', borderRadius: 6, padding: 10, whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 },
    error: { background: 'rgba(239,68,68,.12)', color: '#fecaca', border: '1px solid rgba(239,68,68,.35)', borderRadius: 8, padding: 12, marginBottom: 16 },
    stat: { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '12px 16px', minWidth: 130 },
    statValue: { fontSize: 24, fontWeight: 800 },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>写作质量诊断中心</div>
          <div style={styles.subtitle}>Phase 6.9：注意力引擎、单项复检、精修恢复与创作位置跳转</div>
        </div>
        <button style={styles.ghostButton} onClick={() => navigate(`/project/${projectId}/dashboard`)}>返回项目</button>
      </div>

      <div style={styles.panel}>
        <div style={styles.row}>
          <select style={styles.select} value={selectedChapterId} onChange={event => {
            setSelectedChapterId(event.target.value);
            setSelectedReport(null);
            setIssues([]);
            persistView({ selectedChapterId: event.target.value, selectedReportId: '', selectedIssueId: '' });
          }}>
            <option value="">选择章节</option>
            {chapters.map(ch => (
              <option key={ch.id} value={ch.id}>第{ch.volumeIndex}卷 第{ch.chapterIndex}章 {ch.title} [{ch.status}]</option>
            ))}
          </select>
          <button style={{ ...styles.button, opacity: analyzing || !selectedChapterId ? .55 : 1 }} disabled={analyzing || !selectedChapterId} onClick={handleAnalyze}>
            {analyzing ? '诊断中...' : '诊断当前章节'}
          </button>
          <button style={styles.ghostButton} onClick={handleAttention} disabled={!selectedChapterId}>前三屏生死线检查</button>
          <button style={styles.ghostButton} onClick={loadReports}>刷新报告</button>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={{ ...styles.row, marginBottom: 16 }}>
        <div style={styles.stat}><div style={styles.statValue}>{stats.totalReports}</div><div style={styles.muted}>报告</div></div>
        <div style={styles.stat}><div style={{ ...styles.statValue, color: '#f97316' }}>{stats.openIssues}</div><div style={styles.muted}>待处理</div></div>
        <div style={styles.stat}><div style={{ ...styles.statValue, color: '#ef4444' }}>{stats.highIssues}</div><div style={styles.muted}>高风险</div></div>
        <div style={styles.stat}><div style={{ ...styles.statValue, color: '#22c55e' }}>{stats.resolvedIssues}</div><div style={styles.muted}>已闭环</div></div>
      </div>

      <div style={{ ...styles.row, borderBottom: '1px solid #334155', marginBottom: 16 }}>
        <button style={activeTab === 'reports' ? styles.button : styles.ghostButton} onClick={() => setActiveTab('reports')}>报告列表</button>
        <button style={activeTab === 'detail' ? styles.button : styles.ghostButton} onClick={() => setActiveTab('detail')} disabled={!selectedReport}>问题详情</button>
      </div>

      {attention && (
        <div style={styles.panel}>
          <div style={{ ...styles.row, justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700 }}>前三屏生死线</div>
            <span style={{ ...styles.badge, background: attention.level === 'high' ? '#7f1d1d' : attention.level === 'medium' ? '#713f12' : '#14532d', color: '#fff' }}>
              滑走风险 {attention.slipAwayRiskScore}
            </span>
          </div>
          <div style={{ ...styles.row, marginTop: 10 }}>
            {attention.checkpoints.map(item => (
              <span key={item.name} style={{ ...styles.badge, background: item.pass ? '#064e3b' : '#7f1d1d', color: '#fff' }}>
                {item.name} {item.score}
              </span>
            ))}
          </div>
          {attention.reasons.length > 0 && <div style={{ ...styles.text, marginTop: 10 }}>{attention.reasons.slice(0, 4).join('；')}</div>}
          <div style={{ ...styles.row, alignItems: 'stretch', marginTop: 12 }}>
            <div style={{ flex: 1, minWidth: 260 }}><div style={styles.muted}>修改方案</div><div style={styles.block}>{attention.revisionPlan.join('\n')}</div></div>
            <div style={{ flex: 1, minWidth: 260 }}><div style={styles.muted}>替代开头建议</div><div style={styles.block}>{attention.alternativeOpenings.join('\n')}</div></div>
          </div>
        </div>
      )}

      {loading && <div style={styles.panel}>加载中...</div>}

      {!loading && activeTab === 'reports' && (
        <div>
          {reports.length === 0 && <div style={styles.panel}>暂无报告。选择章节后可以先做“前三屏生死线检查”，再诊断当前章节。</div>}
          {reports.map(report => (
            <div key={report.id} style={{ ...styles.card, ...(selectedReport?.id === report.id ? styles.selectedCard : {}) }} onClick={() => selectReport(report)}>
              <div style={{ ...styles.row, justifyContent: 'space-between' }}>
                <div>
                  <strong>{report.title}</strong>
                  <span style={{ ...styles.badge, marginLeft: 8, background: '#0f172a', color: '#bfdbfe' }}>{report.overallLevel}</span>
                  {report.chapterLocked && <span style={{ ...styles.badge, marginLeft: 8, background: '#7f1d1d', color: '#fff' }}>LOCKED</span>}
                </div>
                <span style={styles.muted}>{new Date(report.createdAt).toLocaleString()}</span>
              </div>
              <div style={{ ...styles.text, marginTop: 8 }}>{report.summary}</div>
              <div style={{ ...styles.muted, marginTop: 8 }}>问题 {report.issueCount}，待处理 {report.openIssueCount}，已闭环 {report.resolvedIssueCount}</div>
            </div>
          ))}
        </div>
      )}

      {!loading && activeTab === 'detail' && selectedReport && (
        <div>
          <div style={{ ...styles.row, marginBottom: 12 }}>
            <select style={styles.select} value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
              <option value="all">全部严重度</option>
              <option value="critical">critical</option>
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
            <select style={styles.select} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">全部类型</option>
              {[...new Set(issues.map(i => i.issueType))].map(type => <option key={type} value={type}>{type}</option>)}
            </select>
            <span style={styles.muted}>显示 {filteredIssues.length} / {issues.length}</span>
          </div>

          {filteredIssues.map(issue => (
            <div key={issue.id} style={{ ...styles.card, ...(selectedIssueId === issue.id ? styles.selectedCard : {}) }} onClick={() => selectIssue(issue)}>
              <div style={{ ...styles.row, justifyContent: 'space-between' }}>
                <div>
                  <strong>{issue.title}</strong>
                  <span style={{ ...styles.badge, marginLeft: 8, background: `${severityColor(issue.severity)}22`, color: severityColor(issue.severity) }}>{issue.severity}</span>
                  <span style={{ ...styles.badge, marginLeft: 6, background: OPEN_STATUSES.has(issue.status) ? '#713f12' : '#14532d', color: '#fff' }}>{statusLabel(issue.status)}</span>
                </div>
                <span style={styles.muted}>{issue.issueType}</span>
              </div>
              <div style={{ ...styles.text, marginTop: 8 }}>{issue.summary}</div>
              {issue.evidence && <div style={{ marginTop: 8 }}><div style={styles.muted}>证据</div><div style={styles.block}>{issue.evidence}</div></div>}
              {issue.suggestion && <div style={{ ...styles.text, marginTop: 8 }}>建议：{issue.suggestion}</div>}
              <div style={{ ...styles.row, marginTop: 12 }}>
                <button style={styles.smallButton} disabled={busyIssueId === issue.id} onClick={event => { event.stopPropagation(); updateIssueStatus(issue, 'planned'); }}>计划处理</button>
                <button style={styles.smallButton} disabled={busyIssueId === issue.id} onClick={event => { event.stopPropagation(); handleRefine(issue); }}>生成方案</button>
                <button style={styles.smallButton} disabled={busyIssueId === issue.id} onClick={event => { event.stopPropagation(); handleIssueRecheck(issue); }}>单项复检</button>
                <button style={styles.smallButton} onClick={event => { event.stopPropagation(); jumpToIssueTarget(issue); }}>{issue.navigation?.label || '正文定位'}</button>
                <button style={styles.smallButton} disabled={busyIssueId === issue.id} onClick={event => { event.stopPropagation(); updateIssueStatus(issue, 'ignored'); }}>忽略</button>
                <button style={styles.smallButton} disabled={busyIssueId === issue.id} onClick={event => { event.stopPropagation(); updateIssueStatus(issue, 'archived'); }}>归档</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {revisionResult && (
        <div style={styles.panel}>
          <div style={{ ...styles.row, justifyContent: 'space-between' }}>
            <strong>精修建议</strong>
            <span style={{ ...styles.badge, background: revisionResult.canApply ? '#064e3b' : '#7f1d1d', color: '#fff' }}>
              {revisionResult.locked ? 'locked 只读' : revisionResult.canApply ? '可应用' : '建议模式'}
            </span>
          </div>
          <div style={{ ...styles.text, marginTop: 8 }}>{revisionResult.reason}</div>
          <div style={{ ...styles.row, alignItems: 'stretch', marginTop: 12 }}>
            <div style={{ flex: 1, minWidth: 280 }}><div style={styles.muted}>修改前</div><div style={styles.block}>{revisionResult.beforeText}</div></div>
            <div style={{ flex: 1, minWidth: 280 }}><div style={styles.muted}>修改后</div><div style={styles.block}>{revisionResult.afterText}</div></div>
          </div>
          <div style={{ ...styles.row, marginTop: 12 }}>
            {!revisionResult.applied && revisionResult.canApply && <button style={styles.button} onClick={() => handleApplyRevision(revisionResult.id)}>应用精修</button>}
            {revisionResult.applied && <span style={{ ...styles.badge, background: '#14532d', color: '#fff' }}>已应用</span>}
            {!revisionResult.canApply && <span style={styles.muted}>locked 章节只能诊断和建议，不能 apply。</span>}
          </div>
        </div>
      )}

      {recheckResult && (
        <div style={styles.panel}>
          <strong>复检结果</strong>
          <span style={{ ...styles.badge, marginLeft: 8, background: recheckResult.level === 'pass' ? '#14532d' : '#713f12', color: '#fff' }}>{recheckResult.level}</span>
          <div style={{ ...styles.text, marginTop: 8 }}>{recheckResult.summary}</div>
        </div>
      )}
    </div>
  );
};

export default WritingQualityPage;
