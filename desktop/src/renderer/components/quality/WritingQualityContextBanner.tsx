import React from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

interface QualityRouteState {
  from?: string;
  reportId?: string;
  issueId?: string;
  chapterId?: string;
  evidence?: string;
  evidencePreview?: string;
  paragraphIndex?: number | null;
  sentenceIndex?: number | null;
  returnTo?: string;
}

const WritingQualityContextBanner: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state || {}) as QualityRouteState;
  const source = state.from || searchParams.get('source');

  if (source !== 'writing-quality') return null;

  const issueId = state.issueId || searchParams.get('issueId') || '';
  const reportId = state.reportId || searchParams.get('reportId') || '';
  const chapterId = state.chapterId || searchParams.get('chapterId') || '';
  const evidencePreview = state.evidencePreview
    || state.evidence?.slice(0, 120)
    || searchParams.get('evidencePreview')
    || '无证据片段';
  const returnTo = state.returnTo || (projectId ? `/project/${projectId}/writing-quality` : '/');

  return (
    <div style={styles.banner}>
      <div style={styles.content}>
        <strong>来自写作质检</strong>
        <span>问题 {issueId || '未指定'}</span>
        {reportId && <span>报告 {reportId.slice(0, 8)}</span>}
        {chapterId && <span>章节 {chapterId.slice(0, 8)}</span>}
        <span style={styles.preview}>证据片段：{evidencePreview}</span>
      </div>
      <button type="button" style={styles.button} onClick={() => navigate(returnTo)}>
        返回质检
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  banner: {
    margin: '0 0 14px',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(59,130,246,0.28)',
    background: 'rgba(37,99,235,0.12)',
    color: '#dbeafe',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    fontSize: 13,
  },
  content: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  preview: {
    color: '#bfdbfe',
  },
  button: {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid rgba(147,197,253,0.36)',
    background: '#0f172a',
    color: '#dbeafe',
    cursor: 'pointer',
  },
};

export default WritingQualityContextBanner;
