import React from 'react';

interface WorkflowBlockedNoticeProps {
  title?: string;
  reason: string;
  missingAssets?: string[];
  recommendedNextAction?: string;
  onDismiss?: () => void;
}

const ASSET_LABELS: Record<string, string> = {
  projectId: '项目 ID',
  current_stage: '当前阶段',
  confirmed_idea: '确认题材/想法',
  outline: '大纲',
  world_setting: '世界观',
  main_character: '主角',
  book_outline: '总纲',
  volume_outline: '分卷',
  chapter_plan: '章节规划',
  body: '正文',
};

const WorkflowBlockedNotice: React.FC<WorkflowBlockedNoticeProps> = ({
  title = '暂不能执行该生成动作',
  reason,
  missingAssets = [],
  recommendedNextAction,
  onDismiss,
}) => {
  const labels = missingAssets.map((key) => ASSET_LABELS[key] || key);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>{title}</span>
        {onDismiss && (
          <button type="button" style={styles.closeButton} onClick={onDismiss} aria-label="关闭">
            ×
          </button>
        )}
      </div>
      <div style={styles.row}>
        <span style={styles.label}>原因</span>
        <span style={styles.value}>{reason}</span>
      </div>
      {labels.length > 0 && (
        <div style={styles.row}>
          <span style={styles.label}>缺少</span>
          <div style={styles.tagList}>
            {labels.map((label) => (
              <span key={label} style={styles.tag}>{label}</span>
            ))}
          </div>
        </div>
      )}
      {recommendedNextAction && (
        <div style={styles.row}>
          <span style={styles.label}>建议</span>
          <span style={styles.valueStrong}>{recommendedNextAction}</span>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '14px',
    borderRadius: 10,
    border: '1px solid rgba(239,68,68,0.35)',
    backgroundColor: 'rgba(239,68,68,0.06)',
    color: '#eaeaea',
    fontSize: 12,
    lineHeight: 1.6,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  title: {
    minWidth: 0,
    fontSize: 13,
    fontWeight: 700,
    color: '#ef4444',
  },
  closeButton: {
    width: 26,
    height: 26,
    flexShrink: 0,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: '#8a8aa0',
    cursor: 'pointer',
    lineHeight: 1,
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 8,
  },
  label: {
    width: 34,
    flexShrink: 0,
    color: '#8a8aa0',
    fontSize: 12,
    fontWeight: 700,
  },
  value: {
    color: '#eaeaea',
    fontSize: 12,
    lineHeight: 1.6,
    minWidth: 0,
  },
  valueStrong: {
    color: '#f59e0b',
    fontSize: 12,
    lineHeight: 1.6,
    fontWeight: 600,
    minWidth: 0,
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    minWidth: 0,
  },
  tag: {
    padding: '3px 8px',
    borderRadius: 999,
    border: '1px solid rgba(239,68,68,0.32)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    color: '#ef4444',
    fontSize: 12,
    fontWeight: 600,
  },
};

export default WorkflowBlockedNotice;
