/**
 * ProjectListPage - 项目列表页
 * 显示所有项目卡片，支持搜索过滤和创建新项目
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { useIdeaLabStore } from '../stores/ideaLabStore';
import { openProject } from '../lib/openProject';
import { getGenerationRecovery, startFailedProjectRecovery } from '../lib/generationRecovery';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import type {
  Project,
  ProjectType,
  CreationSource,
  WorkflowStage,
  IdeaStatus,
} from '@novel/shared';
import {
  EMPTY_EXECUTION_STANDARDS,
  missingExecutionStandards,
  targetWordsBlockingReason,
  toExecutionStandardsPayload,
  platformLabel as platformLabelOf,
  type ExecutionStandardsValue,
  type ExecutionStandardsPayload,
} from '../lib/executionStandards';
import ExecutionStandardsForm from '../components/ExecutionStandardsForm';

// ============================================================
// 常量
// ============================================================

const TYPE_LABELS: Record<ProjectType, string> = {
  short_story: '短篇',
  long_novel: '长篇',
  script: '剧本',
};

const TYPE_COLORS: Record<ProjectType, string> = {
  short_story: 'var(--color-success)',
  long_novel: 'var(--color-accent)',
  script: 'var(--color-warning)',
};

const CREATION_SOURCE_LABELS: Record<CreationSource, string> = {
  inspiration: '灵感',
  idea_discovery: '灵感发现',
  idea: '想法',
  import: '导入',
  blank: '空白',
};

const CREATION_SOURCE_FALLBACKS: Record<string, string> = {
  // 这里曾有过第二份 idea_discovery 创建来源定义，后果是已创建项目只靠回退文案识别；现由共享枚举统一管理。
  inspiration_discovery: '灵感发现',
};


const WORKFLOW_STAGE_LABELS: Record<string, string> = {
  topic: '题材',
  idea_or_inspiration: '想法孵化',
  world_setting: '世界观',
  character: '角色',
  outline: '大纲',
  volume: '分卷',
  chapter: '章节',
  writing: '写作',
};

const STATUS_LABELS: Record<string, string> = {
  idea: '构思中',
  world_building: '构思中',
  outlining: '构思中',
  writing: '创作中',
  editing: '创作中',
  published: '已完成',
};

const STATUS_COLORS: Record<string, string> = {
  generation_failed: 'rgba(248, 113, 113, 0.16)',
  idea: 'rgba(243, 156, 18, 0.2)',
  world_building: 'rgba(243, 156, 18, 0.2)',
  outlining: 'rgba(243, 156, 18, 0.2)',
  writing: 'rgba(233, 69, 96, 0.2)',
  editing: 'rgba(233, 69, 96, 0.2)',
  published: 'rgba(46, 204, 113, 0.2)',
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  generation_failed: '#fca5a5',
  idea: 'var(--color-warning)',
  world_building: 'var(--color-warning)',
  outlining: 'var(--color-warning)',
  writing: 'var(--color-accent)',
  editing: 'var(--color-accent)',
  published: 'var(--color-success)',
};

const USER_STATUS_LABELS: Record<string, string> = {
  creating: '资料生成中',
  generation_failed: '生成失败 · 不可写作',
  active: '可继续创作',
  idea: '构思中',
  world_building: '构思中',
  outlining: '构思中',
  writing: '创作中',
  editing: '创作中',
  published: '已完成',
};

// ============================================================
// 工具函数
// ============================================================

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}小时前`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}天前`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}个月前`;

  return `${Math.floor(diffMonths / 12)}年前`;
}

function formatWordCount(current: number): string {
  if (current >= 10000) {
    return `${(current / 10000).toFixed(1)}万字`;
  }
  return `${current.toLocaleString()}字`;
}

// ============================================================
// 子组件
// ============================================================

interface ProjectCardProps {
  project: Project;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  retryBusy: boolean;
  retryDisabled: boolean;
  recoveryRunning?: boolean;
  retryMessage?: string;
  selected: boolean;
  onSelectionChange: (id: string, selected: boolean) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onSelect, onDelete, onRetry, retryBusy, retryDisabled, recoveryRunning = false, retryMessage, selected, onSelectionChange }) => {
  const [isHovered, setIsHovered] = useState(false);
  const failed = project.status === 'generation_failed';
  const progress = 0;
  const statusLabel = recoveryRunning ? '正在重新生成 · 查看进度' : USER_STATUS_LABELS[project.status] || project.status;
  const statusBgColor = STATUS_COLORS[project.status] || 'rgba(108,108,128,0.2)';
  const statusTextColor = STATUS_TEXT_COLORS[project.status] || 'var(--color-text-muted)';
  const creationLabel = CREATION_SOURCE_LABELS[project.creationSource]
    || CREATION_SOURCE_FALLBACKS[String(project.creationSource)]
    || '作者创建';
  const platformText = platformLabelOf(project.targetPlatform) || project.targetPlatform;
  const stageLabel = WORKFLOW_STAGE_LABELS[project.currentWorkflowStage] || '';

  return (
    <div
      style={{ ...cardStyles.card, ...(failed ? cardStyles.failedCard : {}) }}
      onClick={() => onSelect(project.id)}
      onMouseEnter={(e) => {
        setIsHovered(true);
        e.currentTarget.style.borderColor = failed ? 'rgba(248,113,113,0.55)' : 'var(--color-accent)';
        e.currentTarget.style.transform = failed ? 'none' : 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        setIsHovered(false);
        e.currentTarget.style.borderColor = failed ? 'rgba(148,163,184,0.28)' : 'var(--color-border)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={cardStyles.header}>
        <label
          style={cardStyles.selection}
          title={`选择“${project.title}”`}
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            aria-label={`选择项目 ${project.title}`}
            onChange={(event) => onSelectionChange(project.id, event.target.checked)}
            style={cardStyles.checkbox}
          />
        </label>
        <h3 style={{ ...cardStyles.title, ...(failed ? cardStyles.failedTitle : {}) }}>{project.title}</h3>
        <div style={cardStyles.headerRight}>
          <span
            style={{
              ...cardStyles.typeBadge,
              backgroundColor: TYPE_COLORS[project.type] || 'var(--color-text-muted)',
            }}
          >
            {TYPE_LABELS[project.type] || project.type}
          </span>
          <button
            style={{
              ...cardStyles.deleteBtn,
              opacity: isHovered || failed ? 1 : 0,
              pointerEvents: isHovered || failed ? 'auto' : 'none',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(project.id);
            }}
            title="删除项目"
          >
            🗑
          </button>
        </div>
      </div>

      <div style={cardStyles.metaRow}>
        <span style={cardStyles.metaTag}>{creationLabel}</span>
        {stageLabel && <><span style={cardStyles.metaDivider}>·</span><span style={cardStyles.metaTag}>{stageLabel}</span></>}
        <span style={cardStyles.metaDivider}>·</span>
        <span style={cardStyles.metaTag}>{platformText}</span>
      </div>

      {project.description && (
        <p style={cardStyles.description}>{project.description}</p>
      )}

      <div style={cardStyles.progressSection}>
        <div style={cardStyles.progressBar}>
          <div
            style={{
              ...cardStyles.progressFill,
              width: `${progress}%`,
              backgroundColor: progress >= 100 ? 'var(--color-success)' : 'var(--color-accent, var(--color-accent))',
            }}
          />
        </div>
        <span style={cardStyles.wordCount}>
          {formatWordCount(project.wordCount)}
        </span>
      </div>

      <div style={cardStyles.footer}>
        <div style={cardStyles.tags}>
          <span
            style={{
              ...cardStyles.statusTag,
              backgroundColor: statusBgColor,
              color: statusTextColor,
            }}
          >
            {statusLabel}
          </span>
        </div>
        <span style={cardStyles.time}>
          {formatRelativeTime(project.updatedAt)}
        </span>
      </div>

      {failed && (
        <div style={cardStyles.failedActions} onClick={(event) => event.stopPropagation()}>
          <span style={cardStyles.failedHint}>{recoveryRunning ? '创作资料正在生成，可随时查看实时进度。' : '创建未完成；可查看诊断或重新生成。'}</span>
          <button
            type="button"
            style={{ ...cardStyles.retryBtn, opacity: retryDisabled ? 0.55 : 1 }}
            disabled={retryDisabled && !recoveryRunning}
            onClick={() => onRetry(project.id)}
            aria-label={`${recoveryRunning ? '查看进度' : '重新生成'} ${project.title}`}
          >{recoveryRunning ? '查看进度' : retryBusy ? '正在启动…' : '重新生成'}</button>
          {retryMessage && <span role="alert" style={cardStyles.retryMessage}>{retryMessage}</span>}
        </div>
      )}
    </div>
  );
};

const cardStyles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: 'var(--color-bg-secondary, var(--color-bg-secondary))',
    borderRadius: 'var(--radius-lg, 12px)',
    border: '1px solid var(--color-border, var(--color-border))',
    padding: '20px',
    cursor: 'pointer',
    transition: 'border-color 0.2s, transform 0.15s',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  failedCard: {
    backgroundColor: 'rgba(29,34,48,0.72)',
    borderColor: 'rgba(148,163,184,0.28)',
    borderStyle: 'dashed',
  },
  failedTitle: {
    color: 'var(--color-text-muted)',
  },
  failedActions: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    borderTop: '1px solid rgba(148,163,184,0.18)',
    paddingTop: 12,
  },
  failedHint: {
    color: 'var(--color-text-muted)',
    fontSize: 12,
    flex: '1 1 180px',
  },
  retryBtn: {
    border: '1px solid rgba(248,113,113,0.52)',
    borderRadius: 7,
    backgroundColor: 'rgba(248,113,113,0.13)',
    color: '#fecaca',
    fontSize: 13,
    fontWeight: 700,
    padding: '7px 12px',
    cursor: 'pointer',
  },
  retryMessage: {
    color: '#fca5a5',
    fontSize: 12,
    flexBasis: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  selection: {
    width: 24,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.035)',
    flexShrink: 0,
    cursor: 'pointer',
  },
  checkbox: {
    width: 16,
    height: 16,
    accentColor: 'var(--color-accent)',
    cursor: 'pointer',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--color-text-primary, var(--color-text-primary))',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  },
  typeBadge: {
    fontSize: 'var(--font-size-xs)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm, 4px)',
    color: 'var(--color-white)',
    fontWeight: 500,
    flexShrink: 0,
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  metaTag: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-muted, var(--color-text-muted))',
    fontWeight: 400,
  },
  metaDivider: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-muted, var(--color-text-muted))',
    opacity: 0.4,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-accent, var(--color-accent))',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '2px 4px',
    borderRadius: 'var(--radius-sm, 4px)',
    lineHeight: 1,
    transition: 'opacity 0.15s, background-color 0.15s',
    flexShrink: 0,
  },
  description: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-muted, var(--color-text-muted))',
    lineHeight: 1.5,
    margin: 0,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  progressSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  progressBar: {
    height: '4px',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },
  wordCount: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-secondary, var(--color-text-secondary))',
    fontFamily: 'var(--font-mono, monospace)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tags: {
    display: 'flex',
    gap: '6px',
  },
  statusTag: {
    fontSize: 'var(--font-size-xs)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm, 4px)',
    fontWeight: 500,
  },
  time: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-muted, var(--color-text-muted))',
  },
};

// ============================================================
// 创建项目对话框（四步式流程）
// ============================================================

interface CreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    type: ProjectType;
    creationSource: CreationSource;
    currentWorkflowStage: WorkflowStage;
    ideaStatus: IdeaStatus;
    ideaSeed?: string;
    description?: string;
    /**
     * 六维执行标准（平台/分类/基调/文风/流派/视角 + 目标总字数 + 分类体量取舍依据）。
     * 创建载荷里不再有「只带平台 + 一个字数」的旧形状：那不是执行标准，
     * 按它建出来的项目从一开始就缺标准，只能在项目卡片事后补救。
     */
    standards: ExecutionStandardsPayload;
  }) => void;
}

const CREATION_SOURCE_OPTIONS: { value: CreationSource; label: string; desc: string }[] = [
  {
    value: 'inspiration',
    label: '从灵感开始',
    desc: '适合还没有明确故事，只想从热点、题材、脑洞、灵感卡中挑选方向。',
  },
  {
    value: 'idea',
    label: '从想法开始',
    desc: '适合你已经有一句模糊想法，继续明确题材、主角、核心冲突、故事背景和卖点。',
  },
  {
    value: 'import',
    label: '导入已有资料',
    desc: '适合你已经有大纲、角色、世界观、正文片段或 .novel 项目包。',
  },
  {
    value: 'blank',
    label: '空白创建',
    desc: '适合你自己手动填写项目资料。',
  },
];

const PROJECT_TYPE_OPTIONS: { value: ProjectType; label: string; desc: string }[] = [
  {
    value: 'short_story',
    label: '短篇',
    desc: '适合短故事、平台短篇、反转故事，流程为题材 → 大纲 → 正文。',
  },
  {
    value: 'long_novel',
    label: '长篇',
    desc: '适合连载小说、长篇网文，流程为设定 → 世界观 → 人物 → 总纲 → 分卷 → 章节 → 正文。',
  },
];


const CreateDialog: React.FC<CreateDialogProps> = ({ isOpen, onClose, onCreate }) => {
  const [step, setStep] = useState(1);
  const [creationSource, setCreationSource] = useState<CreationSource>('blank');
  const [projectType, setProjectType] = useState<ProjectType>('long_novel');
  // 执行标准：与创建向导、项目执行标准页共用同一份控件与同一份判据（components/ExecutionStandardsForm）。
  // 这里不再自建「平台卡片 + 目标字数输入框」那一套：那是第二份标准，也是两套口径的来源。
  const [standards, setStandards] = useState<ExecutionStandardsValue>(EMPTY_EXECUTION_STANDARDS);
  const [title, setTitle] = useState('');
  const [ideaSeed, setIdeaSeed] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 成稿单元（短篇/长篇）不是六维之一，但它是「分类」维体量判据的适用前提：
  // 平台实测体量是按成稿单元分开采集的，不带它，判据会按「未知即从严」拿长篇区间拦短篇。
  useEffect(() => {
    setStandards((prev) => (prev.projectType === projectType ? prev : { ...prev, projectType }));
  }, [projectType]);

  if (!isOpen) return null;

  const reset = () => {
    setStep(1);
    setCreationSource('blank');
    setProjectType('long_novel');
    setStandards(EMPTY_EXECUTION_STANDARDS);
    setTitle('');
    setIdeaSeed('');
    setDescription('');
    setErrors({});
  };

  // 第 3 步（执行标准）就是执行前提本身：六维缺任何一维、或「分类」维体量判据未满足，
  // 都不允许往下走 —— 用的就是后端创建入口的那两份判据（missingExecutionStandards / targetWordsVerdict），
  // 不是前端自算的第二套规则。
  const standardsProblems = (): string[] => {
    const problems = missingExecutionStandards(standards);
    const block = targetWordsBlockingReason(standards);
    return block ? [...problems, block] : problems;
  };

  const validateStep3 = (): boolean => {
    const problems = standardsProblems();
    setErrors((prev) => ({ ...prev, standards: problems.join('；') }));
    return problems.length === 0;
  };

  const validateStep4 = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (creationSource === 'idea') {
      // 从想法开始：原始想法必填，标题可选
      if (!ideaSeed.trim()) {
        newErrors.ideaSeed = '请输入原始想法';
      }
    } else {
      // 其他来源：标题必填
      if (!title.trim()) {
        newErrors.title = '请输入作品标题';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreate = () => {
    // 标准是被反复改动过的：这里再判一次并退回第 3 步，而不是让一个已经缺标准的载荷发出去。
    if (!validateStep3()) {
      setStep(3);
      return;
    }
    if (!validateStep4()) return;
    const workflowStage =
      projectType === 'short_story' ? 'topic' : 'idea_or_inspiration';
    const ideaStatusValue = creationSource === 'idea' ? 'draft' : 'none';
    onCreate({
      title: title.trim(),
      type: projectType,
      creationSource,
      currentWorkflowStage: workflowStage,
      ideaStatus: ideaStatusValue,
      ideaSeed: creationSource === 'idea' ? ideaSeed.trim() : undefined,
      description: description.trim() || undefined,
      standards: toExecutionStandardsPayload(standards),
    });
    reset();
  };

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      reset();
      onClose();
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleNext = () => {
    // 第 3 步（执行标准）和最终创建共用同一份判据 validateStep3：
    // 六维缺任何一维、或「分类」维体量判据未满足，都不允许进入下一步 ——
    // 这里不再有前端自算的第二套「平台」规则（旧 platformStandardProblem 已并入六维校验）。
    if (step === 3 && !validateStep3()) return;
    setStep((s) => Math.min(s + 1, 4));
  };
  const handlePrev = () => setStep((s) => Math.max(s - 1, 1));

  return (
    <div style={dialogStyles.backdrop} onClick={handleBackdrop}>
      <div style={dialogStyles.dialog} role="dialog" aria-modal="true" aria-labelledby="create-project-title">
        <div style={dialogStyles.header}>
          <div>
            <h2 id="create-project-title" style={dialogStyles.title}>创建新作品</h2>
            <p style={dialogStyles.subtitle}>
              选择一个开始方式，后续将根据短篇或长篇自动进入对应创作流程。
            </p>
          </div>
          <button style={dialogStyles.closeBtn} onClick={handleClose}>
            ✕
          </button>
        </div>

        {/* 步骤指示器 */}
        <div style={dialogStyles.steps}>
          {['开始方式', '作品类型', '执行标准', '基础信息'].map((label, i) => (
            <div key={i} style={dialogStyles.stepItem}>
              <div
                style={{
                  ...dialogStyles.stepDot,
                  backgroundColor: step > i + 1 ? 'var(--color-success)' : step === i + 1 ? 'var(--color-accent, var(--color-accent))' : 'rgba(255,255,255,0.1)',
                  color: step > i + 1 ? 'var(--color-white)' : step === i + 1 ? 'var(--color-white)' : 'var(--color-text-muted, var(--color-text-muted))',
                }}
              >
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span
                style={{
                  ...dialogStyles.stepLabel,
                  color: step === i + 1 ? 'var(--color-text-primary, var(--color-text-primary))' : 'var(--color-text-muted, var(--color-text-muted))',
                }}
              >
                {label}
              </span>
              {i < 3 && <div style={dialogStyles.stepLine} />}
            </div>
          ))}
        </div>

        <div style={dialogStyles.stepContent}>
          {/* Step 1: 创建来源 */}
          {step === 1 && (
            <div style={dialogStyles.stepBody}>
              <h3 style={dialogStyles.stepTitle}>你想从哪里开始？</h3>
              <div style={dialogStyles.cardGrid}>
                {CREATION_SOURCE_OPTIONS.map((opt) => (
                  <div
                    key={opt.value}
                    style={{
                      ...dialogStyles.selectCard,
                      borderColor: creationSource === opt.value ? 'var(--color-accent, var(--color-accent))' : 'var(--color-border, var(--color-border))',
                      backgroundColor: creationSource === opt.value ? 'rgba(233,69,96,0.08)' : 'var(--color-bg-primary, var(--color-bg-primary))',
                    }}
                    onClick={() => setCreationSource(opt.value)}
                  >
                    <span style={dialogStyles.cardLabel}>{opt.label}</span>
                    <span style={dialogStyles.cardDesc}>{opt.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: 作品类型 */}
          {step === 2 && (
            <div style={dialogStyles.stepBody}>
              <h3 style={dialogStyles.stepTitle}>你要创作什么类型？</h3>
              <div style={dialogStyles.cardGrid}>
                {PROJECT_TYPE_OPTIONS.map((opt) => (
                  <div
                    key={opt.value}
                    style={{
                      ...dialogStyles.selectCard,
                      borderColor: projectType === opt.value ? 'var(--color-accent, var(--color-accent))' : 'var(--color-border, var(--color-border))',
                      backgroundColor: projectType === opt.value ? 'rgba(233,69,96,0.08)' : 'var(--color-bg-primary, var(--color-bg-primary))',
                    }}
                    onClick={() => setProjectType(opt.value)}
                  >
                    <span style={dialogStyles.cardLabel}>{opt.label}</span>
                    <span style={dialogStyles.cardDesc}>{opt.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: 执行标准（平台/分类/基调/文风/流派/视角）—— 与创建向导、项目执行标准页同一份控件 */}
          {step === 3 && (
            <div style={dialogStyles.stepBody}>
              <h3 style={dialogStyles.stepTitle}>执行标准</h3>
              <ExecutionStandardsForm
                value={standards}
                onChange={(next) => {
                  setStandards(next);
                  setErrors((prev) => ({ ...prev, standards: '' }));
                }}
                heading="这六项是创建前提，不是封面信息"
                note="它们随创建请求写进创作宪法，框架层与正文层都按它们执行：换了平台或分类，体量区间、写作口径、读者预期就跟着换。缺任何一维都建不出项目。"
              />
              {errors.standards && <span style={dialogStyles.error}>{errors.standards}</span>}
            </div>
          )}

          {/* Step 4: 基础信息 */}
          {step === 4 && (
            <div style={dialogStyles.stepBody}>
              <h3 style={dialogStyles.stepTitle}>基础信息</h3>
              <div style={dialogStyles.form}>
                <div style={dialogStyles.field}>
                  <label style={dialogStyles.label}>
                    {creationSource === 'idea' ? '作品标题（可选）' : '作品标题 *'}
                  </label>
                  <input
                    style={{
                      ...dialogStyles.input,
                      ...(errors.title ? dialogStyles.inputError : {}),
                    }}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="输入作品标题..."
                    autoFocus
                  />
                  {errors.title && <span style={dialogStyles.error}>{errors.title}</span>}
                </div>

                {creationSource === 'idea' && (
                  <div style={dialogStyles.field}>
                    <label style={dialogStyles.label}>原始想法 *</label>
                    <textarea
                      style={{
                        ...dialogStyles.textarea,
                        ...(errors.ideaSeed ? dialogStyles.inputError : {}),
                      }}
                      value={ideaSeed}
                      onChange={(e) => { setIdeaSeed(e.target.value); if (errors.ideaSeed) setErrors({}); }}
                      placeholder="写下你的想法，哪怕只是一句话。AI 会通过追问帮你完善成可创作的作品设定。"
                      rows={3}
                    />
                    {errors.ideaSeed && <span style={dialogStyles.error}>{errors.ideaSeed}</span>}
                  </div>
                )}

                <div style={dialogStyles.field}>
                  <label style={dialogStyles.label}>简短描述（可选）</label>
                  <textarea
                    style={dialogStyles.textarea}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="简要描述你的作品..."
                    rows={2}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={dialogStyles.actions}>
          {step > 1 && (
            <button type="button" style={dialogStyles.secondaryBtn} onClick={handlePrev}>
              上一步
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < 4 ? (
            <button type="button" style={dialogStyles.submitBtn} onClick={handleNext}>
              下一步
            </button>
          ) : (
            <button type="button" style={dialogStyles.submitBtn} onClick={handleCreate}>
              {creationSource === 'idea' ? '开始孵化' : '创建作品'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const dialogStyles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: 'var(--color-bg-secondary, var(--color-bg-secondary))',
    borderRadius: 'var(--radius-lg, 12px)',
    border: '1px solid var(--color-border, var(--color-border))',
    padding: '24px',
    width: '600px',
    maxWidth: '90vw',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    color: 'var(--color-text-primary, var(--color-text-primary))',
    margin: 0,
  },
  subtitle: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-muted, var(--color-text-muted))',
    margin: '6px 0 0 0',
    lineHeight: 1.4,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted, var(--color-text-muted))',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 'var(--radius-sm, 4px)',
    flexShrink: 0,
  },
  steps: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '24px',
    gap: '0',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0',
  },
  stepDot: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 600,
    flexShrink: 0,
  },
  stepLabel: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 500,
    marginLeft: '6px',
    marginRight: '4px',
  },
  stepLine: {
    width: '36px',
    height: '1px',
    backgroundColor: 'var(--color-border, var(--color-border))',
    margin: '0 2px',
  },
  stepContent: {
    minHeight: '200px',
  },
  stepBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  stepTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text-primary, var(--color-text-primary))',
    margin: 0,
  },
  cardGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  selectCard: {
    padding: '14px 16px',
    border: '1px solid var(--color-border, var(--color-border))',
    borderRadius: 'var(--radius-md, 8px)',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background-color 0.15s',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  cardLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text-primary, var(--color-text-primary))',
  },
  cardDesc: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-muted, var(--color-text-muted))',
    lineHeight: 1.4,
  },
  platformGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
  },
  platformCard: {
    padding: '12px',
    border: '1px solid var(--color-border, var(--color-border))',
    borderRadius: 'var(--radius-md, 8px)',
    cursor: 'pointer',
    textAlign: 'center',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 500,
    color: 'var(--color-text-primary, var(--color-text-primary))',
    transition: 'border-color 0.15s, background-color 0.15s',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-secondary, var(--color-text-secondary))',
    fontWeight: 500,
  },
  input: {
    padding: '8px 12px',
    backgroundColor: 'var(--color-bg-primary, var(--color-bg-primary))',
    border: '1px solid var(--color-border, var(--color-border))',
    borderRadius: 'var(--radius-md, 8px)',
    color: 'var(--color-text-primary, var(--color-text-primary))',
    fontSize: '14px',
    fontFamily: 'var(--font-family, sans-serif)',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  inputError: {
    borderColor: 'var(--color-accent, var(--color-accent))',
  },
  textarea: {
    padding: '8px 12px',
    backgroundColor: 'var(--color-bg-primary, var(--color-bg-primary))',
    border: '1px solid var(--color-border, var(--color-border))',
    borderRadius: 'var(--radius-md, 8px)',
    color: 'var(--color-text-primary, var(--color-text-primary))',
    fontSize: '14px',
    fontFamily: 'var(--font-family, sans-serif)',
    outline: 'none',
    resize: 'vertical',
  },
  select: {
    padding: '10px 12px',
    backgroundColor: 'var(--color-bg-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    cursor: 'pointer',
    width: '100%',
    WebkitAppearance: 'menulist',
  },
  error: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-accent, var(--color-accent))',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '20px',
  },
  secondaryBtn: {
    padding: '8px 20px',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-border, var(--color-border))',
    borderRadius: 'var(--radius-md, 8px)',
    color: 'var(--color-text-secondary, var(--color-text-secondary))',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
  },
  submitBtn: {
    padding: '8px 24px',
    backgroundColor: 'var(--color-accent, var(--color-accent))',
    border: 'none',
    borderRadius: 'var(--radius-md, 8px)',
    color: 'var(--color-white)',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
  },
};

// ============================================================
// 搜索/过滤栏
// ============================================================

interface SearchFilterProps {
  searchQuery: string;
  typeFilter: ProjectType | 'all';
  onSearchChange: (query: string) => void;
  onTypeChange: (type: ProjectType | 'all') => void;
}

const SearchFilter: React.FC<SearchFilterProps> = ({
  searchQuery,
  typeFilter,
  onSearchChange,
  onTypeChange,
}) => {
  return (
    <div style={filterStyles.container}>
      <div style={filterStyles.searchWrap}>
        <span style={filterStyles.searchIcon}>🔍</span>
        <input
          style={filterStyles.searchInput}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索项目..."
        />
        {searchQuery && (
          <button
            style={filterStyles.clearBtn}
            onClick={() => onSearchChange('')}
          >
            ✕
          </button>
        )}
      </div>

      <div style={filterStyles.typeFilters}>
        <button
          style={{
            ...filterStyles.typeBtn,
            ...(typeFilter === 'all' ? filterStyles.typeBtnActive : {}),
          }}
          onClick={() => onTypeChange('all')}
        >
          全部
        </button>
        {[
          { value: 'short_story' as ProjectType, label: '短篇' },
          { value: 'long_novel' as ProjectType, label: '长篇' },
          { value: 'script' as ProjectType, label: '剧本' },
        ].map((opt) => (
          <button
            key={opt.value}
            style={{
              ...filterStyles.typeBtn,
              ...(typeFilter === opt.value ? filterStyles.typeBtnActive : {}),
            }}
            onClick={() => onTypeChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const filterStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '24px',
  },
  searchWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    fontSize: '14px',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '10px 36px 10px 36px',
    backgroundColor: 'var(--color-bg-secondary, var(--color-bg-secondary))',
    border: '1px solid var(--color-border, var(--color-border))',
    borderRadius: 'var(--radius-md, 8px)',
    color: 'var(--color-text-primary, var(--color-text-primary))',
    fontSize: '14px',
    fontFamily: 'var(--font-family, sans-serif)',
    outline: 'none',
  },
  clearBtn: {
    position: 'absolute',
    right: '8px',
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted, var(--color-text-muted))',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px',
  },
  typeFilters: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  typeBtn: {
    padding: '4px 14px',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-border, var(--color-border))',
    borderRadius: 'var(--radius-sm, 4px)',
    color: 'var(--color-text-secondary, var(--color-text-secondary))',
    fontSize: 'var(--font-size-xs)',
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
    transition: 'all 0.15s',
  },
  typeBtnActive: {
    backgroundColor: 'var(--color-accent, var(--color-accent))',
    borderColor: 'var(--color-accent, var(--color-accent))',
    color: 'var(--color-white)',
  },
};

// ============================================================
// 主组件
// ============================================================

const ProjectListPage: React.FC = () => {
  const {
    projects,
    searchQuery,
    typeFilter,
    fetchProjects,
    setSearchQuery,
    setTypeFilter,
    createProject,
    selectProject,
    deleteProjects,
    getFilteredProjects,
  } = useProjectStore();

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [retryingProjectId, setRetryingProjectId] = useState<string | null>(null);
  const [retryMessages, setRetryMessages] = useState<Record<string, string>>({});
  const [runningRecoveries, setRunningRecoveries] = useState<Record<string, boolean>>({});
  const { createDraft } = useIdeaLabStore();

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // 服务端审计是运行状态唯一来源；从进度页返回或重开窗口后仍可找回当前任务。
  useEffect(() => {
    const failedIds = projects.filter(project => project.status === 'generation_failed').map(project => project.id);
    let cancelled = false;
    void Promise.all(failedIds.map(async id => {
      try { return [id, Boolean((await getGenerationRecovery(id))?.running)] as const; }
      catch { return [id, false] as const; }
    })).then(entries => {
      if (!cancelled) setRunningRecoveries(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [projects]);

  // 从工作台“新建项目”跳入（/projects?new=1）时自动打开创建弹窗
  useEffect(() => {
    if (searchParams.get('new') === '1') setIsDialogOpen(true);
  }, [searchParams]);

  const filteredProjects = getFilteredProjects();
  const filteredIds = filteredProjects.map(project => project.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedProjectIds.has(id));

  const handleCreate = async (data: {
    title: string;
    type: ProjectType;
    creationSource: CreationSource;
    currentWorkflowStage: WorkflowStage;
    ideaStatus: IdeaStatus;
    ideaSeed?: string;
    description?: string;
    standards: ExecutionStandardsPayload;
  }) => {
    if (data.creationSource === 'inspiration') {
      // 「从灵感开始」的唯一入口是发现向导（/discover）：热点/题材/脑洞/灵感卡都在那里，
      // 六维执行标准也在同一步选全，并由 /chain/create-project-async 在创建前一次判完。
      // 此前这里还留着一条「只选平台就直接建项目」的老路径：同一个意图两个入口、两套标准，
      // 项目库里就会混进没有执行标准的项目，所以那条路删掉，不再保留。
      setIsDialogOpen(false);
      navigate('/discover');
      return;
    }

    if (data.creationSource === 'idea') {
      // 从想法开始 → 创建 Idea Draft 并跳转 Idea Lab（那里收齐其余四维后再转项目）
      try {
        const draft = await createDraft({
          rawIdea: data.ideaSeed || '',
          projectType: data.type,
          targetPlatform: data.standards.targetPlatform,
          customPlatformNote: data.standards.customPlatformNote,
          targetWords: data.standards.targetWords || 0,
          title: data.title || '',
          description: data.description || '',
        });
        setIsDialogOpen(false);
        navigate(`/idea-lab/${draft.id}`);
      } catch (err: any) {
        console.error('[ProjectList] 创建想法草稿失败:', err);
        alert(err?.message || '创建想法草稿失败，请重试');
      }
      return;
    }

    // 直接创建（空白 / 导入资料）：带齐六维执行标准，与创建向导同一份载荷。
    const project = await createProject({
      title: data.title,
      type: data.type,
      creationSource: data.creationSource,
      currentWorkflowStage: data.currentWorkflowStage,
      ideaStatus: data.ideaStatus,
      description: data.description,
      ...data.standards,
    });
    setIsDialogOpen(false);
    await openProject(project.id, project.title, navigate);
  };

  const handleSelectProject = async (id: string) => {
    if (runningRecoveries[id]) {
      const project = projects.find(item => item.id === id);
      navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });
      return;
    }
    try {
      await selectProject(id);
      // selectProject 设置 currentProject 到 store，从中获取标题
      const p = useProjectStore.getState().currentProject;
      if (p) {
        await openProject(p.id, p.title, navigate);
      } else {
        console.error('[ProjectList] selectProject 成功但 currentProject 为 null, id=', id);
        // 尝试重新 fetch 一次
        await useProjectStore.getState().fetchProject(id);
        const p2 = useProjectStore.getState().currentProject;
        if (p2) {
          await openProject(p2.id, p2.title, navigate);
        } else {
          alert('无法加载项目数据，请检查后端服务是否正常运行');
        }
      }
    } catch (err: any) {
      console.error('[ProjectList] 选择项目失败:', err);
      alert(err?.message || '打开项目失败，请重试');
    }
  };

  const handleDeleteRequest = (id: string) => {
    setDeleteTargets([id]);
  };

  const handleRetryProject = async (id: string) => {
    const project = projects.find(item => item.id === id);
    if (runningRecoveries[id]) {
      navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });
      return;
    }
    if (retryingProjectId) return;
    setRetryingProjectId(id);
    setRetryMessages(current => ({ ...current, [id]: '' }));
    try {
      await startFailedProjectRecovery(id);
      setRunningRecoveries(current => ({ ...current, [id]: true }));
      navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });
    } catch (error: any) {
      const audit = await getGenerationRecovery(id).catch(() => null);
      if (audit?.running) {
        setRunningRecoveries(current => ({ ...current, [id]: true }));
        navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });
        return;
      }
      setRetryMessages(current => ({ ...current, [id]: `启动失败：${error?.message || '请查看项目诊断'}` }));
      await fetchProjects();
    } finally {
      setRetryingProjectId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteTargets.length === 0 || deleting) return;
    setDeleting(true);
    const result = await deleteProjects(deleteTargets);
    setDeleting(false);
    setDeleteTargets([]);
    setSelectedProjectIds(current => {
      const next = new Set(current);
      result.deleted.forEach(id => next.delete(id));
      return next;
    });
    if (result.failed.length > 0) {
      alert(`已删除 ${result.deleted.length} 个项目，${result.failed.length} 个删除失败。请稍后重试失败项。`);
    }
  };

  const setProjectSelected = (id: string, selected: boolean) => {
    setSelectedProjectIds(current => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelectedProjectIds(current => {
      const next = new Set(current);
      if (allFilteredSelected) filteredIds.forEach(id => next.delete(id));
      else filteredIds.forEach(id => next.add(id));
      return next;
    });
  };

  return (
    <div style={pageStyles.container}>
      <div style={pageStyles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={pageStyles.pageTitle}>我的项目</h1>
        </div>
        <button
          style={pageStyles.createBtn}
          onClick={() => setIsDialogOpen(true)}
        >
          + 新建项目
        </button>
      </div>

      <SearchFilter
        searchQuery={searchQuery}
        typeFilter={typeFilter}
        onSearchChange={setSearchQuery}
        onTypeChange={setTypeFilter}
      />


      {projects.length > 0 && (
        <div style={pageStyles.selectionBar}>
          <label style={pageStyles.selectAllLabel}>
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleAllFiltered}
              disabled={filteredIds.length === 0}
              aria-label="全选当前项目列表"
              style={cardStyles.checkbox}
            />
            <span>{searchQuery || typeFilter !== 'all' ? `全选当前筛选（${filteredIds.length}）` : `全选（${filteredIds.length}）`}</span>
          </label>
          <span style={pageStyles.selectionCount}>已选 {selectedProjectIds.size} 个</span>
          <button
            type="button"
            style={{ ...pageStyles.bulkDeleteBtn, opacity: selectedProjectIds.size > 0 ? 1 : 0.45 }}
            disabled={selectedProjectIds.size === 0 || deleting}
            onClick={() => setDeleteTargets([...selectedProjectIds])}
          >
            删除所选
          </button>
        </div>
      )}

      {filteredProjects.length === 0 ? (
        projects.length === 0 ? (
          <EmptyState
            icon={<span>📝</span>}
            title="还没有项目"
            description="创建第一个项目，开始你的创作之旅"
            actionLabel="创建第一个项目"
            onAction={() => setIsDialogOpen(true)}
          />
        ) : (
          <div style={pageStyles.noResults}>
            <p>没有找到匹配的项目</p>
          </div>
        )
      ) : (
        <div style={pageStyles.grid}>
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onSelect={handleSelectProject}
              onDelete={handleDeleteRequest}
              onRetry={handleRetryProject}
              retryBusy={retryingProjectId === project.id}
              retryDisabled={retryingProjectId !== null}
              recoveryRunning={Boolean(runningRecoveries[project.id])}
              retryMessage={retryMessages[project.id]}
              selected={selectedProjectIds.has(project.id)}
              onSelectionChange={setProjectSelected}
            />
          ))}
        </div>
      )}

      <CreateDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onCreate={handleCreate}
      />

      <ConfirmDialog
        open={deleteTargets.length > 0}
        title={deleteTargets.length > 1 ? `删除 ${deleteTargets.length} 个项目` : '删除项目'}
        description={deleteTargets.length > 1
          ? `确定删除选中的 ${deleteTargets.length} 个项目吗？所有章节和设定数据将被永久删除，此操作不可撤销。`
          : '确定要删除这个项目吗？所有章节和设定数据将被永久删除，此操作不可撤销。'}
        confirmText={deleting ? '删除中…' : '确认删除'}
        cancelText="取消"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => { if (!deleting) setDeleteTargets([]); }}
      />
    </div>
  );
};

const pageStyles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '32px 24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  pageTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--color-text-primary, var(--color-text-primary))',
    margin: 0,
  },
  createBtn: {
    padding: '10px 24px',
    backgroundColor: 'var(--color-accent, var(--color-accent))',
    border: 'none',
    borderRadius: 'var(--radius-md, 8px)',
    color: 'var(--color-white)',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
    transition: 'background-color 0.15s',
  },
  selectionBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    padding: '8px 12px',
    margin: '12px 0 16px',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  selectAllLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--color-text-secondary)',
    fontSize: 14,
    cursor: 'pointer',
  },
  selectionCount: {
    marginLeft: 'auto',
    color: 'var(--color-text-muted)',
    fontSize: 13,
  },
  bulkDeleteBtn: {
    padding: '7px 14px',
    border: '1px solid rgba(239,68,68,0.45)',
    borderRadius: 7,
    backgroundColor: 'rgba(239,68,68,0.1)',
    color: '#f87171',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '16px',
  },
  noResults: {
    textAlign: 'center',
    padding: '40px',
    color: 'var(--color-text-muted, var(--color-text-muted))',
    fontSize: '14px',
  },
};

export default ProjectListPage;
