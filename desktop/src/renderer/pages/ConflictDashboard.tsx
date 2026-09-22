/**
 * ConflictDashboard - 冲突优先级可视化面板
 * 对接后端 /conflict-engine/* API
 *
 * 行为依据（项目执行标准：module-standards seed / QUALITY_EXECUTION.md 的冲突优先级与章节职责先于措辞）：
 * - R1 金字塔：锁定正文(P0) > 世界观(P1) > 基础设定/大纲(P2) > 未锁定正文(P3)
 * - R2 处理：高优先级可改 → 评估+用户确认；锁定 → 以高优先级为准自动修改低优先级
 * - R4 流程：高优先级不可变 → 自动修正低优先级；高优先级可改 → AI生成方案+用户确认
 *
 * 本面板提供每条矛盾的可执行操作：跳大纲编辑、AI 改写对齐、打开设定/角色/时间线、标记解决。
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import EmptyState from '../components/common/EmptyState';

type ConflictActionKind =
  | 'view_chapter'
  | 'regenerate_aligned_body'
  | 'open_outline_editor'
  | 'edit_world_setting'
  | 'edit_character'
  | 'view_timeline'
  | 'mark_resolved'
  | 'recheck';

interface ConflictAction {
  kind: ConflictActionKind;
  label: string;
  tone: 'primary' | 'secondary' | 'danger';
  reason: string;
}

interface ConflictItem {
  id: string;
  type: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'unresolved' | 'resolving' | 'resolved';
  level: 'P0' | 'P1' | 'P2' | 'P3';
  location: string;
  suggestion?: string;
  chapterIndex?: number | null;
  chapterId?: string | null;
  chapterStatus?: string | null;
  checkType?: string;
  source?: string;
  sourceLabel?: string;
  actions?: ConflictAction[];
}

const LEVEL_COLORS: Record<string, string> = { P0: 'var(--color-danger)', P1: 'var(--color-warning)', P2: 'var(--color-info)', P3: 'var(--color-text-muted)' };
const LEVEL_LABEL: Record<string, string> = { P0: '锁定正文', P1: '世界观', P2: '基础设定', P3: '未锁定正文' };
const PRIORITY_COLORS: Record<string, string> = { critical: 'var(--color-danger)', high: 'var(--color-warning)', medium: 'var(--color-info)', low: 'var(--color-text-muted)' };
const STATUS_COLORS: Record<string, string> = { unresolved: 'var(--color-danger)', resolving: 'var(--color-warning)', resolved: 'var(--color-success)' };
const STATUS_LABELS: Record<string, string> = { unresolved: '未解决', resolving: '处理中', resolved: '已解决' };
// 暗色主题下高对比度配色
const ACTION_TONE: Record<ConflictAction['tone'], { bg: string; border: string; color: string; hoverBg: string }> = {
  primary:   { bg: '#0d3320', border: 'var(--color-success)', color: '#d1f7c4', hoverBg: '#15502f' },
  secondary: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.18)', color: 'var(--color-text-primary)', hoverBg: 'rgba(255,255,255,0.10)' },
  danger:    { bg: '#3b1418', border: 'var(--color-accent)', color: '#ffd1d8', hoverBg: '#5a1d24' },
};

const ConflictDashboard: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [recheckMessage, setRecheckMessage] = useState<string | null>(null);
  const [cleaningStale, setCleaningStale] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  const loadConflicts = useCallback(async () => {
    setLoading(true); setActionError(null);
    try {
      const res = await api.get(`/conflicts?priority=&type=&status=&projectId=${projectId}`);
      const data = (res as any).data ?? res;
      if (data.conflicts) setConflicts(data.conflicts as ConflictItem[]);
    } catch { setActionError('矛盾查询失败，请重试。'); }
    setLoading(false);
  }, [projectId]);

  // 自动加载（首次挂载时）
  useEffect(() => {
    loadConflicts();
  }, [loadConflicts]);

  /**
   * 一键清理过期矛盾（用户铁律：矛盾点非最新版本和当前正文的矛盾要删除）
   * 调 DELETE /conflicts/stale?projectId=，删除所有 status=warning/error 且未解决的冲突。
   * 保留：已通过（pass）+ 已解决（resolved）。
   */
  const cleanupStaleConflicts = useCallback(async () => {
    if (!projectId) return;
    if (!window.confirm('确定清理所有过期矛盾（基于旧版本正文或已过期检测产生的未解决冲突）？\n\n将删除：status=warning/error 且未解决的冲突\n保留：已通过的检查 + 已解决的记录\n\n清理后请重新检测本章以生成最新冲突。')) return;
    setCleaningStale(true);
    try {
      const res = await api.delete(`/conflicts/stale?projectId=${projectId}`);
      const data = (res as any).data ?? res;
      const removed = Number(data?.removed || 0);
      setRecheckMessage(`已清理 ${removed} 条过期矛盾。下次「重新检测」会生成最新冲突。`);
      await loadConflicts();
    } catch (e: any) {
      setActionError(`清理失败：${e?.message || String(e)}`);
    } finally {
      setCleaningStale(false);
    }
  }, [projectId, loadConflicts]);

  /**
   * 执行一个动作：真实调用后端，不伪造结果。
   * - mark_resolved → POST /conflicts/:id/resolve
   * - recheck       → POST /conflicts/detect（带 chapterIndex），然后 reload
   * - 跳转类（view_chapter / open_outline_editor / edit_world_setting / edit_character / view_timeline）
   *   → 用 react-router 的 navigate 跳真实路径
   * - regenerate_aligned_body → 跳回写作页"生成下一章"面板，作者在面板里手动点"重写正文对齐大纲"
   */
  const runAction = useCallback(async (conflict: ConflictItem, action: ConflictAction) => {
    setActionError(null);
    setRecheckMessage(null);
    setBusyAction(action.kind);
    try {
      switch (action.kind) {
        case 'view_chapter':
        case 'regenerate_aligned_body':
        case 'open_outline_editor':
        case 'edit_world_setting':
        case 'edit_character':
        case 'view_timeline': {
          const target = routeForAction(conflict, action.kind, projectId);
          if (!target) { setActionError('无法定位跳转目标（缺少章节或项目 ID）'); return; }
          navigate(target);
          return;
        }
        case 'mark_resolved': {
          const r: any = await api.post(`/conflicts/${conflict.id}/resolve?projectId=${projectId}`, { note: `作者在前后矛盾 tab 标记解决 (${new Date().toISOString()})` });
          const data = r?.data ?? r;
          if (data?.error) { setActionError(`标记失败：${data.error}`); return; }
          await loadConflicts();
          return;
        }
        case 'recheck': {
          if (conflict.chapterIndex == null) { setActionError('本章序号未知，无法重新检测'); return; }
          const r: any = await api.post(`/conflicts/detect`, { projectId, chapterIndex: conflict.chapterIndex });
          const data = r?.data ?? r;
          const checked = Number(data?.checked || 0);
          setRecheckMessage(`已对第 ${conflict.chapterIndex} 章重跑一致性检测，发现 ${checked} 条记录`);
          await loadConflicts();
          return;
        }
      }
    } catch (e: any) {
      setActionError(`操作失败：${e?.message || String(e)}`);
    } finally {
      setBusyAction(null);
    }
  }, [projectId, navigate, loadConflicts]);

  const resolved = conflicts.filter(c => c.status === 'resolved').length;
  const resolveRate = conflicts.length > 0 ? Math.round((resolved / conflicts.length) * 100) : 0;
  const selected = conflicts.find(c => c.id === selectedId);

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--color-bg-primary)' }}>
      {/* 顶部 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)' }}>⚡ 冲突优先级</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={cleanupStaleConflicts} disabled={loading || cleaningStale}
            title="删除本章/全项目所有 status=warning/error 且未解决的过期冲突（基于旧版本正文或已过期检测产生的）"
            style={{ padding: '8px 16px', backgroundColor: 'rgba(243,156,18,0.12)', border: '1px solid rgba(243,156,18,0.3)', borderRadius: '6px', color: 'var(--color-warning)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {cleaningStale ? '清理中…' : '🧹 清理过期矛盾'}
          </button>
          <button onClick={loadConflicts} disabled={loading}
            style={{ padding: '8px 16px', backgroundColor: 'rgba(233,69,96,0.12)', border: '1px solid rgba(233,69,96,0.3)', borderRadius: '6px', color: 'var(--color-accent)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {loading ? '加载中...' : '🔄 刷新'}
          </button>
        </div>
      </div>

      {/* 优先级金字塔（按文档 R1：锁定正文 > 世界观 > 基础设定 > 未锁定正文） */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '8px' }}>
        {(['P0', 'P1', 'P2', 'P3'] as const).map(level => (
          <div key={level} style={{
            flex: level === 'P0' ? 1 : level === 'P1' ? 2 : level === 'P2' ? 3 : 4,
            padding: '8px', borderRadius: '6px', textAlign: 'center',
            backgroundColor: `${LEVEL_COLORS[level]}15`, border: `1px solid ${LEVEL_COLORS[level]}30`,
          }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: LEVEL_COLORS[level] }}>{level}</div>
            <div style={{ fontSize: '9px', color: 'var(--color-text-soft)', marginTop: '2px', fontWeight: 600 }}>
              {LEVEL_LABEL[level]}
            </div>
          </div>
        ))}
      </div>

      {/* 统计 */}
      <div style={{ display: 'flex', gap: '16px' }}>
        {[
          { label: '总冲突', value: conflicts.length, color: 'var(--color-text-primary)' },
          { label: '已解决', value: resolved, color: 'var(--color-success)' },
          { label: '解决率', value: `${resolveRate}%`, color: resolveRate > 70 ? 'var(--color-success)' : 'var(--color-warning)' },
          { label: '未解决', value: conflicts.filter(c => c.status !== 'resolved').length, color: 'var(--color-danger)' },
          { label: 'P0待处理', value: conflicts.filter(c => c.level === 'P0' && c.status !== 'resolved').length, color: 'var(--color-danger)' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, padding: '14px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center',
          }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '14px', color: 'var(--color-text-soft)', marginTop: '4px', fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 内容问题类别 */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px', color: 'var(--color-text-dim)', fontWeight: 600 }}>按来源筛选：</span>
        {[
          { key: 'all', label: '全部', count: conflicts.length },
          { key: 'deterministic', label: '叙事逻辑', count: conflicts.filter(c => !c.source || c.source === 'deterministic').length },
          { key: 'alignment_verifier', label: '大纲一致性', count: conflicts.filter(c => c.source === 'alignment_verifier').length },
          { key: 'alignment_verifier_hardline', label: '语言与内容规范', count: conflicts.filter(c => c.source === 'alignment_verifier_hardline' || c.source === 'hardline').length },
          { key: 'alignment_verifier_advisory', label: '文风建议', count: conflicts.filter(c => c.source === 'alignment_verifier_advisory').length },
          { key: 'alignment_verifier_source_conflict', label: '资料源冲突', count: conflicts.filter(c => c.source === 'alignment_verifier_source_conflict').length },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setSourceFilter(s.key)}
            style={{
              padding: '4px 12px',
              borderRadius: '14px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              border: `1px solid ${sourceFilter === s.key ? 'var(--color-accent)' : 'rgba(255,255,255,0.12)'}`,
              backgroundColor: sourceFilter === s.key ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.03)',
              color: sourceFilter === s.key ? 'var(--color-accent)' : 'var(--color-text-soft)',
            }}
          >
            {s.label} ({s.count})
          </button>
        ))}
      </div>

      {/* 列表+详情 */}
      <div style={{ display: 'flex', gap: '16px', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'auto' }}>
          {conflicts.length === 0 && (
            <EmptyState
              icon="⚡"
              title="暂无冲突"
              description="点击刷新按钮加载冲突数据，或继续写作让系统自动检测前后矛盾。"
              actionLabel="刷新"
              onAction={loadConflicts}
            />
          )}
          {conflicts
            .filter(c => {
              if (sourceFilter === 'all') return true;
              if (sourceFilter === 'deterministic') return !c.source || c.source === 'deterministic';
              if (sourceFilter === 'alignment_verifier') return c.source === 'alignment_verifier';
              if (sourceFilter === 'alignment_verifier_hardline') return c.source === 'alignment_verifier_hardline' || c.source === 'hardline';
              if (sourceFilter === 'alignment_verifier_advisory') return c.source === 'alignment_verifier_advisory';
              if (sourceFilter === 'alignment_verifier_source_conflict') return c.source === 'alignment_verifier_source_conflict';
              return true;
            })
            .map((c, idx) => (
            <div key={c.id} onClick={() => setSelectedId(c.id)}
              style={{
                padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', border: '1px solid',
                backgroundColor: selectedId === c.id ? 'rgba(233,69,96,0.08)' : 'rgba(255,255,255,0.02)',
                borderColor: selectedId === c.id ? 'rgba(233,69,96,0.3)' : 'rgba(255,255,255,0.06)',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', fontWeight: 600, minWidth: '24px' }}>#{idx + 1}</span>
                <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 700, backgroundColor: `${LEVEL_COLORS[c.level]}25`, color: LEVEL_COLORS[c.level] }}>{c.level}</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: PRIORITY_COLORS[c.priority], flexShrink: 0 }} />
                <span style={{ padding: '1px 6px', borderRadius: '3px', fontSize: '10px', backgroundColor: `${PRIORITY_COLORS[c.priority]}25`, color: PRIORITY_COLORS[c.priority], fontWeight: 600 }}>{c.type}</span>
                {c.sourceLabel && c.sourceLabel !== c.type && (
                  <span style={{ padding: '1px 6px', borderRadius: '3px', fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--color-text-soft)', fontWeight: 600 }}>{c.sourceLabel}</span>
                )}
                <span style={{ flex: 1, fontSize: '14px', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{c.description}</span>
                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: `${STATUS_COLORS[c.status]}25`, color: STATUS_COLORS[c.status], fontWeight: 700 }}>{STATUS_LABELS[c.status]}</span>
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div style={{ width: '360px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '16px', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>冲突详情</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px' }}>
              <div><span style={{ color: 'var(--color-text-soft)' }}>优先级: </span><span style={{ color: LEVEL_COLORS[selected.level], fontWeight: 700 }}>{selected.level} · {LEVEL_LABEL[selected.level]} · {selected.priority}</span></div>
              <div><span style={{ color: 'var(--color-text-soft)' }}>类型: </span><span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{selected.type}</span></div>
              <div><span style={{ color: 'var(--color-text-soft)' }}>描述: </span><p style={{ margin: '4px 0 0 0', color: 'var(--color-text-primary)', lineHeight: 1.6, fontWeight: 500 }}>{selected.description}</p></div>
              <div><span style={{ color: 'var(--color-text-soft)' }}>位置: </span><span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{selected.location}</span>{selected.chapterStatus === 'locked' && <span style={{ color: 'var(--color-danger)', marginLeft: 6, fontWeight: 700 }}>（已锁定）</span>}</div>
              <div><span style={{ color: 'var(--color-text-soft)' }}>状态: </span><span style={{ color: STATUS_COLORS[selected.status], fontWeight: 700 }}>{STATUS_LABELS[selected.status]}</span></div>
              {selected.source && (
                <div><span style={{ color: 'var(--color-text-soft)' }}>来源: </span><span style={{ color: 'var(--color-text-soft)', fontWeight: 600 }}>
                  {selected.source === 'alignment_verifier' ? '大纲一致性'
                    : selected.source === 'alignment_verifier_hardline' ? '语言与内容规范问题'
                    : selected.source === 'alignment_verifier_advisory' ? '文风建议（非阻断，不影响保存）'
                    : selected.source === 'alignment_verifier_source_conflict' ? '资料源冲突（世界档案 vs 详细大纲）'
                    : '确定性一致性检测'}
                </span></div>
              )}
              {selected.suggestion && (
                <div style={{ padding: '10px', backgroundColor: 'rgba(46,204,113,0.10)', borderRadius: '6px', border: '1px solid rgba(46,204,113,0.25)' }}>
                  <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '14px' }}>建议方案: </span>
                  <p style={{ margin: '4px 0 0 0', color: '#d1f7c4', fontSize: '14px', lineHeight: 1.6, fontWeight: 500 }}>{selected.suggestion}</p>
                </div>
              )}

              {/* 可执行操作（按文档 R1/R4 提供：跳编辑/AI重写/标记解决/重新检测） */}
              {(selected.actions?.length ?? 0) > 0 && (
                <div style={{ marginTop: 6, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '14px', color: 'var(--color-text-soft)', fontWeight: 700, marginBottom: 8 }}>可执行操作</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selected.actions!.map((a, i) => {
                      // 后端动作建议的 tone 可能未枚举，回退 secondary，避免 tone 为 undefined 后 .color/.bg 崩溃
                      const tone = ACTION_TONE[a.tone] ?? ACTION_TONE.secondary;
                      const isBusy = busyAction === a.kind;
                      return (
                        <button key={i}
                          title={a.reason}
                          disabled={busyAction !== null}
                          onClick={() => runAction(selected, a)}
                          style={{
                            padding: '8px 12px', borderRadius: 6, cursor: busyAction === null ? 'pointer' : 'not-allowed',
                            backgroundColor: tone.bg, border: `1px solid ${tone.border}`, color: tone.color,
                            fontSize: 14, fontWeight: 700, textAlign: 'left',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                            fontFamily: 'inherit', opacity: busyAction !== null && !isBusy ? 0.45 : 1,
                            transition: 'background-color 0.15s',
                          }}
                          onMouseEnter={e => { if (busyAction === null) (e.currentTarget as HTMLElement).style.backgroundColor = tone.hoverBg; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = tone.bg; }}>
                          <span>{isBusy ? '⏳ 处理中…' : a.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selected.level === 'P0' && (
                    <div style={{ marginTop: 8, padding: '8px 10px', backgroundColor: '#3b1418', border: '1px solid var(--color-accent)', borderRadius: 6, color: '#ffd1d8', fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
                      ⚠️ 本章已锁定。按文档 R1 金字塔，锁定正文（P0）优先级最高，AI 不可改；如需重写请先解锁。
                    </div>
                  )}
                </div>
              )}

              {actionError && (
                <div style={{ marginTop: 8, padding: '8px 10px', backgroundColor: '#3b1418', border: '1px solid var(--color-accent)', borderRadius: 6, color: '#ffd1d8', fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
                  {actionError}
                </div>
              )}
              {recheckMessage && (
                <div style={{ marginTop: 8, padding: '8px 10px', backgroundColor: 'rgba(46,204,113,0.10)', border: '1px solid rgba(46,204,113,0.25)', borderRadius: 6, color: '#d1f7c4', fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
                  {recheckMessage}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function routeForAction(c: ConflictItem, kind: ConflictActionKind, projectId?: string): string | null {
  if (!projectId) return null;
  switch (kind) {
    case 'view_chapter':
      if (c.chapterId) return `/project/${projectId}/writing?chapterId=${c.chapterId}`;
      if (c.chapterIndex != null) return `/project/${projectId}/writing?chapterIndex=${c.chapterIndex}`;
      return `/project/${projectId}/writing`;
    case 'regenerate_aligned_body':
      if (c.chapterId) return `/project/${projectId}/writing?chapterId=${c.chapterId}&action=regenerate_aligned`;
      if (c.chapterIndex != null) return `/project/${projectId}/writing?chapterIndex=${c.chapterIndex}&action=regenerate_aligned`;
      return null;
    case 'open_outline_editor':
      return `/project/${projectId}/outline`;
    case 'edit_world_setting':
      return `/project/${projectId}/world`;
    case 'edit_character':
      return `/project/${projectId}/characters`;
    case 'view_timeline':
      return `/project/${projectId}/timeline`;
  }
  return null;
}

export default ConflictDashboard;
