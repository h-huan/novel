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
      <div style={styles.reason}>{reason}</div>
      {labels.length > 0 && (
        <div style={styles.assets}>
          缺少：{labels.join('、')}
        </div>
      )}
      {recommendedNextAction && (
        <div style={styles.nextAction}>{recommendedNextAction}</div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '10px 12px',
    borderRadius: 6,
    border: '1px solid rgba(248,196,113,0.28)',
    backgroundColor: 'rgba(248,196,113,0.08)',
    color: '#f8c471',
    fontSize: 12,
    lineHeight: 1.6,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 12,
    fontWeight: 700,
    color: '#f8c471',
  },
  closeButton: {
    width: 22,
    height: 22,
    borderRadius: 4,
    border: '1px solid rgba(248,196,113,0.25)',
    backgroundColor: 'rgba(0,0,0,0.12)',
    color: '#f8c471',
    cursor: 'pointer',
    lineHeight: 1,
  },
  reason: {
    color: '#f3d59a',
  },
  assets: {
    marginTop: 4,
    color: '#e2b86a',
  },
  nextAction: {
    marginTop: 4,
    color: '#f8c471',
    fontWeight: 600,
  },
};

export default WorkflowBlockedNotice;
