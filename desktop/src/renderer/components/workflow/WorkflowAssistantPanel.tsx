/**
 * WorkflowAssistantPanel - 创作流程助手
 *
 * 在 ProjectDashboard 中显示，
 * 展示当前阶段、流程进度、缺失内容、允许/不建议操作。
 *
 * UI 命名：创作流程助手
 * 不要在 UI 中暴露 Workflow Guard
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkflowGuardStore } from '../../stores/workflowGuardStore';

// ========== 颜色常量 ==========

const STAGE_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  done:    { bg: 'rgba(46,204,113,0.08)', fg: '#2ecc71', border: 'rgba(46,204,113,0.2)' },
  current: { bg: 'rgba(233,69,96,0.12)',  fg: '#e94560', border: 'rgba(233,69,96,0.35)' },
  next:    { bg: 'rgba(52,152,219,0.08)', fg: '#3498db', border: 'rgba(52,152,219,0.2)' },
  locked:  { bg: 'rgba(255,255,255,0.02)',fg: '#6c6c80', border: 'rgba(255,255,255,0.06)' },
  warning: { bg: 'rgba(243,156,18,0.08)', fg: '#f39c12', border: 'rgba(243,156,18,0.2)' },
};

// ========== 路由映射 ==========

const ACTION_ROUTES: Record<string, string> = {
  enter_world: '/world',
  enter_character: '/characters',
  edit_character: '/characters',
  edit_world: '/world',
  edit_outline: '/outline',
  enter_outline: '/outline',
  generate_outline: '/outline',
  enter_volume: '/outline',
  enter_chapter: '/outline',
  enter_writing: '/writing',
  generate_body: '/writing',
  continue_body: '/writing',
  refine_body: '/refinement',
  enter_state: '/state',
};

function resolveActionRoute(projectId: string, action: AllowedActionDisplay): string {
  if (action.targetRoute) return action.targetRoute;
  const suffix = ACTION_ROUTES[action.key];
  if (suffix) return `/project/${projectId}${suffix}`;
  return '';
}

// ========== 类型 ==========

interface AllowedActionDisplay {
  key: string;
  label: string;
  targetRoute?: string;
}

interface BlockedActionDisplay {
  key: string;
  label: string;
  reason: string;
}

// ========== 子组件: 阶段地图条 ==========

interface StageBarProps {
  stages: Array<{ key: string; label: string; status: string }>;
}

const StageBar: React.FC<StageBarProps> = ({ stages }) => {
  return (
    <div style={stageBarStyles.container}>
      <div style={stageBarStyles.row}>
        {stages.map((s, i) => {
          const colors = STAGE_COLORS[s.status] || STAGE_COLORS.locked;
          const isLast = i === stages.length - 1;
          return (
            <React.Fragment key={s.key}>
              <div style={stageBarStyles.item}>
                <div
                  style={{
                    ...stageBarStyles.dot,
                    backgroundColor: colors.border,
                    borderColor: colors.fg,
                    color: colors.fg,
                  }}
                  title={s.label}
                >
                  {s.status === 'done' ? '✓' : s.status === 'current' ? '●' : '○'}
                </div>
                <span style={{ ...stageBarStyles.label, color: colors.fg }}>{s.label}</span>
              </div>
              {!isLast && <div style={stageBarStyles.line} />}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

const stageBarStyles: Record<string, React.CSSProperties> = {
  container: {
    overflowX: 'auto',
    paddingBottom: '4px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0',
    minWidth: 'max-content',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  dot: {
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 700,
    border: '2px solid',
    flexShrink: 0,
  },
  label: {
    fontSize: '10px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  line: {
    width: '16px',
    height: '1px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    margin: '0 2px',
    marginBottom: '18px',
  },
};

// ========== 主组件 ==========

interface WorkflowAssistantPanelProps {
  projectId: string;
}

const WorkflowAssistantPanel: React.FC<WorkflowAssistantPanelProps> = ({ projectId }) => {
  const navigate = useNavigate();
  const { data, loading, error, fetchGuard, advanceStage } = useWorkflowGuardStore();
  const [advanceError, setAdvanceError] = useState('');

  const handleRefresh = useCallback(() => {
    fetchGuard(projectId);
  }, [projectId, fetchGuard]);

  const handleAction = useCallback((action: AllowedActionDisplay) => {
    const route = resolveActionRoute(projectId, action);
    if (route) {
      navigate(route);
    }
  }, [projectId, navigate]);

  const nextStageLabel = useMemo(() => {
    if (!data?.recommendedNextStage) return '';
    return data.stageMap.find((stage) => stage.key === data.recommendedNextStage)?.label || data.recommendedNextStage;
  }, [data]);

  const handleAdvance = useCallback(async () => {
    if (!data?.recommendedNextStage || data.recommendedNextStage === data.currentStage) return;
    setAdvanceError('');
    try {
      await advanceStage(projectId, data.recommendedNextStage);
    } catch (err: any) {
      setAdvanceError(err?.message || '推进阶段失败');
    }
  }, [advanceStage, data, projectId]);

  if (loading && !data) {
    return (
      <div style={panelStyles.container}>
        <div style={panelStyles.headerRow}>
          <h3 style={panelStyles.title}>🎬 创作流程助手</h3>
        </div>
        <div style={{ padding: '16px', textAlign: 'center', color: '#6c6c80', fontSize: '13px' }}>
          加载中...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={panelStyles.container}>
        <div style={panelStyles.headerRow}>
          <h3 style={panelStyles.title}>🎬 创作流程助手</h3>
          <button style={panelStyles.refreshBtn} onClick={handleRefresh}>🔄</button>
        </div>
        <div style={{ padding: '16px', textAlign: 'center', color: '#e94560', fontSize: '13px' }}>
          加载失败，点击刷新重试
        </div>
      </div>
    );
  }

  if (!data) return null;

  const {
    currentStage,
    currentStageLabel,
    recommendedNextStage,
    recommendedNextAction,
    canProceed,
    stageMap,
    missingAssets,
    completedAssets,
    allowedActions,
    blockedActions,
    warnings,
  } = data;

  return (
    <div style={panelStyles.container}>
      {/* 头部 */}
      <div style={panelStyles.headerRow}>
        <h3 style={panelStyles.title}>🎬 创作流程助手</h3>
        <button style={panelStyles.refreshBtn} onClick={handleRefresh} title="刷新流程状态">
          🔄
        </button>
      </div>

      {/* 当前阶段 */}
      <div style={panelStyles.section}>
        <div style={panelStyles.sectionRow}>
          <span style={panelStyles.sectionLabel}>当前阶段</span>
          <span style={panelStyles.currentStageBadge}>{currentStageLabel}</span>
        </div>
      </div>

      {/* 下一步建议 */}
      {recommendedNextAction && (
        <div style={panelStyles.section}>
          <div style={panelStyles.sectionLabel}>下一步建议</div>
          <p style={panelStyles.suggestionText}>{recommendedNextAction}</p>
          {canProceed && recommendedNextStage && recommendedNextStage !== currentStage && (
            <button
              type="button"
              style={panelStyles.advanceBtn}
              onClick={handleAdvance}
              disabled={loading}
            >
              进入下一阶段：{nextStageLabel}
            </button>
          )}
          {advanceError && <div style={panelStyles.advanceError}>{advanceError}</div>}
        </div>
      )}

      {/* 流程进度 */}
      <div style={panelStyles.section}>
        <div style={panelStyles.sectionLabel}>流程进度</div>
        <StageBar stages={stageMap} />
      </div>

      {/* 警告 */}
      {warnings.length > 0 && (
        <div style={panelStyles.section}>
          {warnings.map((w, i) => (
            <div key={i} style={panelStyles.warningItem}>
              ⚠️ {w.message}
            </div>
          ))}
        </div>
      )}

      {/* 已完成资产 */}
      {completedAssets.length > 0 && (
        <div style={panelStyles.section}>
          <div style={panelStyles.sectionLabel}>已完成</div>
          <div style={panelStyles.tagList}>
            {completedAssets.map((a) => (
              <span key={a.key} style={panelStyles.doneTag}>✓ {a.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* 缺失资产 */}
      {missingAssets.length > 0 && (
        <div style={panelStyles.section}>
          <div style={panelStyles.sectionLabel}>待完善</div>
          <div style={panelStyles.missingList}>
            {missingAssets.map((m) => (
              <div key={m.key} style={panelStyles.missingItem}>
                <span style={panelStyles.missingIcon}>
                  {m.severity === 'required' ? '🔴' : '🟡'}
                </span>
                <span>{m.label}</span>
                <span style={panelStyles.missingReason}>{m.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 允许操作 */}
      {allowedActions.length > 0 && (
        <div style={panelStyles.section}>
          <div style={panelStyles.sectionLabel}>允许操作</div>
          <div style={panelStyles.actionGrid}>
            {allowedActions.map((action) => (
              <button
                key={action.key}
                style={panelStyles.actionBtn}
                onClick={() => handleAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 不建议操作 */}
      {blockedActions.length > 0 && (
        <div style={panelStyles.section}>
          <div style={panelStyles.sectionLabel}>暂不建议操作</div>
          <div style={panelStyles.blockedList}>
            {blockedActions.map((b) => (
              <div key={b.key} style={panelStyles.blockedItem}>
                <span style={panelStyles.blockedLabel}>{b.label}</span>
                <span style={panelStyles.blockedReason}>{b.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ========== 样式 ==========

const panelStyles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: 'var(--color-bg-secondary, #16213e)',
    borderRadius: 'var(--radius-lg, 12px)',
    border: '1px solid var(--color-border, #2a2a4a)',
    padding: '16px',
    marginTop: '24px',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  title: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--color-text-primary, #eaeaea)',
    margin: 0,
  },
  refreshBtn: {
    background: 'none',
    border: '1px solid var(--color-border, #2a2a4a)',
    borderRadius: 'var(--radius-sm, 4px)',
    color: 'var(--color-text-secondary, #a0a0b0)',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px 8px',
    fontFamily: 'var(--font-family, sans-serif)',
  },
  section: {
    marginBottom: '14px',
  },
  sectionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-muted, #6c6c80)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '6px',
  },
  currentStageBadge: {
    padding: '3px 12px',
    borderRadius: 'var(--radius-sm, 4px)',
    backgroundColor: 'rgba(233,69,96,0.15)',
    color: '#e94560',
    fontSize: '13px',
    fontWeight: 600,
  },
  suggestionText: {
    fontSize: '13px',
    color: 'var(--color-text-primary, #eaeaea)',
    lineHeight: 1.5,
    margin: 0,
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  doneTag: {
    padding: '3px 8px',
    borderRadius: 'var(--radius-sm, 4px)',
    fontSize: '11px',
    fontWeight: 500,
    backgroundColor: 'rgba(46,204,113,0.1)',
    color: '#2ecc71',
  },
  missingList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  missingItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--color-text-secondary, #a0a0b0)',
    flexWrap: 'wrap',
  },
  missingIcon: {
    fontSize: '10px',
    flexShrink: 0,
  },
  missingReason: {
    fontSize: '11px',
    color: 'var(--color-text-muted, #6c6c80)',
    fontStyle: 'italic',
  },
  actionGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  actionBtn: {
    padding: '6px 14px',
    backgroundColor: 'rgba(233,69,96,0.1)',
    border: '1px solid rgba(233,69,96,0.25)',
    borderRadius: 'var(--radius-sm, 4px)',
    color: '#e94560',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
    transition: 'background-color 0.15s',
  },
  advanceBtn: {
    marginTop: '8px',
    padding: '7px 12px',
    backgroundColor: 'rgba(52,152,219,0.12)',
    border: '1px solid rgba(52,152,219,0.35)',
    borderRadius: 'var(--radius-sm, 4px)',
    color: '#3498db',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
  },
  advanceError: {
    marginTop: '6px',
    fontSize: '11px',
    color: '#f8c471',
  },
  blockedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  blockedItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '8px 10px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 'var(--radius-sm, 4px)',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  blockedLabel: {
    fontSize: '12px',
    color: 'var(--color-text-muted, #6c6c80)',
    fontWeight: 500,
  },
  blockedReason: {
    fontSize: '11px',
    color: 'var(--color-text-muted, #6c6c80)',
    fontStyle: 'italic',
  },
  warningItem: {
    padding: '6px 10px',
    backgroundColor: 'rgba(243,156,18,0.08)',
    borderRadius: 'var(--radius-sm, 4px)',
    fontSize: '12px',
    color: '#f39c12',
    marginBottom: '4px',
  },
};

export default WorkflowAssistantPanel;
