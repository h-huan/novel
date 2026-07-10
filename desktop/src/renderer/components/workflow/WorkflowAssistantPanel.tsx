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
import { clearProjectFlowState } from '../../stores/projectStore';

// ========== 颜色常量 ==========

const colors = {
  panelBg: 'rgba(255,255,255,0.03)',
  sectionBg: 'rgba(255,255,255,0.035)',
  sectionBgStrong: 'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.08)',
  text: '#eaeaea',
  muted: '#8a8aa0',
  weak: '#6c6c80',
  warning: '#f59e0b',
  danger: '#ef4444',
  success: '#22c55e',
  info: '#60a5fa',
};

const STAGE_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  done:    { bg: 'rgba(34,197,94,0.08)', fg: colors.success, border: 'rgba(34,197,94,0.35)' },
  current: { bg: 'rgba(96,165,250,0.10)', fg: colors.info, border: 'rgba(96,165,250,0.4)' },
  next:    { bg: 'rgba(245,158,11,0.08)', fg: colors.warning, border: 'rgba(245,158,11,0.35)' },
  locked:  { bg: 'rgba(255,255,255,0.025)', fg: colors.weak, border: 'rgba(255,255,255,0.08)' },
  warning: { bg: 'rgba(245,158,11,0.08)', fg: colors.warning, border: 'rgba(245,158,11,0.35)' },
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
                  {i + 1}
                </div>
                <span style={{ ...stageBarStyles.label, color: colors.fg }}>{s.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

const stageBarStyles: Record<string, React.CSSProperties> = {
  container: {
    overflow: 'hidden',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
    padding: '8px 10px',
    minWidth: '72px',
    backgroundColor: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 8,
  },
  dot: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    border: '2px solid',
    flexShrink: 0,
  },
  label: {
    fontSize: '11px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
};

// ========== 主组件 ==========

interface WorkflowAssistantPanelProps {
  projectId: string;
}

const WorkflowAssistantPanel: React.FC<WorkflowAssistantPanelProps> = ({ projectId }) => {
  const navigate = useNavigate();
  const { data, loading, error, fetchGuard, advanceStage, resetStage } = useWorkflowGuardStore();
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

  const handleReset = useCallback(async () => {
    setAdvanceError('');
    try {
      clearProjectFlowState(projectId);
      await resetStage(projectId);
    } catch (err: any) {
      setAdvanceError(err?.message || '重置流程位置失败');
    }
  }, [projectId, resetStage]);

  if (loading && !data) {
    return (
      <div style={panelStyles.container}>
        <div style={panelStyles.headerRow}>
          <h3 style={panelStyles.title}>创作流程助手</h3>
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
          <h3 style={panelStyles.title}>创作流程助手</h3>
          <button style={panelStyles.refreshBtn} onClick={handleRefresh}>刷新</button>
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
        <h3 style={panelStyles.title}>创作流程助手</h3>
        <button style={panelStyles.refreshBtn} onClick={handleRefresh} title="刷新流程状态">
          刷新
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
          <button
            type="button"
            style={panelStyles.refreshBtn}
            onClick={handleReset}
            disabled={loading}
          >
            重置流程位置
          </button>
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
          <div style={panelStyles.sectionLabel}>提醒</div>
          {warnings.map((w, i) => (
            <div key={i} style={panelStyles.warningItem}>
              {w.message}
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
              <div
                key={m.key}
                style={{
                  ...panelStyles.missingItem,
                  borderColor: m.severity === 'required' ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)',
                  color: m.severity === 'required' ? colors.danger : colors.warning,
                }}
              >
                <span style={panelStyles.missingLabel}>{m.label}</span>
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
    backgroundColor: colors.panelBg,
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    padding: '16px',
    marginTop: '20px',
    marginBottom: '20px',
    boxSizing: 'border-box',
    maxWidth: '100%',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px',
  },
  title: {
    fontSize: '15px',
    fontWeight: 700,
    color: colors.text,
    margin: 0,
  },
  refreshBtn: {
    height: 32,
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    color: colors.muted,
    fontSize: '12px',
    cursor: 'pointer',
    padding: '0 12px',
    fontFamily: 'var(--font-family, sans-serif)',
  },
  section: {
    marginBottom: '14px',
    padding: '12px',
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.sectionBg,
  },
  sectionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: colors.muted,
    letterSpacing: 0,
    marginBottom: '8px',
  },
  currentStageBadge: {
    padding: '5px 12px',
    borderRadius: 999,
    backgroundColor: 'rgba(96,165,250,0.10)',
    border: '1px solid rgba(96,165,250,0.35)',
    color: colors.info,
    fontSize: '13px',
    fontWeight: 600,
  },
  suggestionText: {
    fontSize: '13px',
    color: colors.text,
    lineHeight: 1.7,
    margin: 0,
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  doneTag: {
    padding: '5px 9px',
    borderRadius: 999,
    fontSize: '12px',
    fontWeight: 500,
    backgroundColor: 'rgba(34,197,94,0.08)',
    border: '1px solid rgba(34,197,94,0.35)',
    color: colors.success,
  },
  missingList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  missingItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: colors.muted,
    flexWrap: 'wrap',
    padding: '6px 9px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  missingLabel: {
    fontWeight: 700,
    color: 'inherit',
  },
  missingReason: {
    fontSize: '12px',
    color: colors.muted,
    fontStyle: 'normal',
  },
  actionGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  actionBtn: {
    minHeight: 32,
    padding: '0 13px',
    backgroundColor: 'rgba(96,165,250,0.08)',
    border: '1px solid rgba(96,165,250,0.25)',
    borderRadius: 8,
    color: colors.info,
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
    transition: 'background-color 0.15s',
  },
  advanceBtn: {
    minHeight: 34,
    marginTop: '12px',
    padding: '0 14px',
    backgroundColor: 'rgba(96,165,250,0.12)',
    border: '1px solid rgba(96,165,250,0.4)',
    borderRadius: 8,
    color: colors.info,
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
  },
  advanceError: {
    marginTop: '8px',
    fontSize: '12px',
    color: colors.warning,
  },
  blockedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  blockedItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '10px 12px',
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderRadius: 8,
    border: '1px solid rgba(239,68,68,0.22)',
  },
  blockedLabel: {
    fontSize: '12px',
    color: colors.text,
    fontWeight: 700,
  },
  blockedReason: {
    fontSize: '12px',
    color: colors.muted,
    fontStyle: 'normal',
    lineHeight: 1.5,
  },
  warningItem: {
    padding: '10px 12px',
    backgroundColor: 'rgba(245,158,11,0.07)',
    border: '1px solid rgba(245,158,11,0.24)',
    borderRadius: 8,
    fontSize: '12px',
    color: colors.warning,
    lineHeight: 1.5,
    marginBottom: '6px',
  },
};

export default WorkflowAssistantPanel;
