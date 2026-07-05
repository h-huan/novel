/**
 * ProjectListPage - 项目列表页
 * 显示所有项目卡片，支持搜索过滤和创建新项目
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { useIdeaLabStore } from '../stores/ideaLabStore';
import { openProject } from '../lib/openProject';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import type {
  Project,
  ProjectType,
  CreationSource,
  TargetPlatform,
  WorkflowStage,
  IdeaStatus,
} from '@novel/shared';

// ============================================================
// 常量
// ============================================================

const TYPE_LABELS: Record<ProjectType, string> = {
  short_story: '短篇',
  long_novel: '长篇',
  script: '剧本',
};

const TYPE_COLORS: Record<ProjectType, string> = {
  short_story: '#2ecc71',
  long_novel: '#e94560',
  script: '#f39c12',
};

const CREATION_SOURCE_LABELS: Record<CreationSource, string> = {
  inspiration: '灵感',
  idea: '想法',
  import: '导入',
  blank: '空白',
};

const TARGET_PLATFORM_LABELS: Record<TargetPlatform, string> = {
  zhihu: '知乎盐选',
  fanqie: '番茄',
  qidian: '起点',
  douyin: '抖音',
  xiaohongshu: '小红书',
  custom: '自定义',
  generic: '通用',
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
  idea: 'rgba(243, 156, 18, 0.2)',
  world_building: 'rgba(243, 156, 18, 0.2)',
  outlining: 'rgba(243, 156, 18, 0.2)',
  writing: 'rgba(233, 69, 96, 0.2)',
  editing: 'rgba(233, 69, 96, 0.2)',
  published: 'rgba(46, 204, 113, 0.2)',
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  idea: '#f39c12',
  world_building: '#f39c12',
  outlining: '#f39c12',
  writing: '#e94560',
  editing: '#e94560',
  published: '#2ecc71',
};

const USER_STATUS_LABELS: Record<string, string> = {
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
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onSelect, onDelete }) => {
  const [isHovered, setIsHovered] = useState(false);
  const progress = 0;
  const statusLabel = USER_STATUS_LABELS[project.status] || project.status;
  const statusBgColor = STATUS_COLORS[project.status] || 'rgba(108,108,128,0.2)';
  const statusTextColor = STATUS_TEXT_COLORS[project.status] || '#6c6c80';
  const creationLabel = CREATION_SOURCE_LABELS[project.creationSource] || project.creationSource;
  const platformLabel = TARGET_PLATFORM_LABELS[project.targetPlatform] || project.targetPlatform;
  const stageLabel = WORKFLOW_STAGE_LABELS[project.currentWorkflowStage] || project.currentWorkflowStage;

  return (
    <div
      style={cardStyles.card}
      onClick={() => onSelect(project.id)}
      onMouseEnter={(e) => {
        setIsHovered(true);
        e.currentTarget.style.borderColor = 'var(--color-accent, #e94560)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        setIsHovered(false);
        e.currentTarget.style.borderColor = 'var(--color-border, #2a2a4a)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={cardStyles.header}>
        <h3 style={cardStyles.title}>{project.title}</h3>
        <div style={cardStyles.headerRight}>
          <span
            style={{
              ...cardStyles.typeBadge,
              backgroundColor: TYPE_COLORS[project.type] || '#6c6c80',
            }}
          >
            {TYPE_LABELS[project.type] || project.type}
          </span>
          <button
            style={{
              ...cardStyles.deleteBtn,
              opacity: isHovered ? 1 : 0,
              pointerEvents: isHovered ? 'auto' : 'none',
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
        <span style={cardStyles.metaDivider}>·</span>
        <span style={cardStyles.metaTag}>{stageLabel}</span>
        <span style={cardStyles.metaDivider}>·</span>
        <span style={cardStyles.metaTag}>{platformLabel}</span>
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
              backgroundColor: progress >= 100 ? '#2ecc71' : 'var(--color-accent, #e94560)',
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
    </div>
  );
};

const cardStyles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: 'var(--color-bg-secondary, #16213e)',
    borderRadius: 'var(--radius-lg, 12px)',
    border: '1px solid var(--color-border, #2a2a4a)',
    padding: '20px',
    cursor: 'pointer',
    transition: 'border-color 0.2s, transform 0.15s',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
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
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--color-text-primary, #eaeaea)',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  },
  typeBadge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm, 4px)',
    color: '#fff',
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
    fontSize: '12px',
    color: 'var(--color-text-muted, #6c6c80)',
    fontWeight: 400,
  },
  metaDivider: {
    fontSize: '12px',
    color: 'var(--color-text-muted, #6c6c80)',
    opacity: 0.4,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-accent, #e94560)',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '2px 4px',
    borderRadius: 'var(--radius-sm, 4px)',
    lineHeight: 1,
    transition: 'opacity 0.15s, background-color 0.15s',
    flexShrink: 0,
  },
  description: {
    fontSize: '13px',
    color: 'var(--color-text-muted, #6c6c80)',
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
    fontSize: '12px',
    color: 'var(--color-text-secondary, #a0a0b0)',
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
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm, 4px)',
    fontWeight: 500,
  },
  time: {
    fontSize: '12px',
    color: 'var(--color-text-muted, #6c6c80)',
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
    platformStyle: string;
    creationSource: CreationSource;
    targetPlatform: TargetPlatform;
    targetWords: number;
    currentWorkflowStage: WorkflowStage;
    ideaStatus: IdeaStatus;
    ideaSeed?: string;
    description?: string;
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
    desc: '适合你已经有一句模糊想法，AI 会通过追问帮你补全题材、主角、冲突、世界观和卖点。',
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

const PLATFORM_OPTIONS_WIZARD: { value: TargetPlatform; label: string }[] = [
  { value: 'zhihu', label: '知乎盐选' },
  { value: 'fanqie', label: '番茄' },
  { value: 'qidian', label: '起点' },
  { value: 'douyin', label: '抖音故事' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'custom', label: '自定义' },
  { value: 'generic', label: '通用' },
];

const CreateDialog: React.FC<CreateDialogProps> = ({ isOpen, onClose, onCreate }) => {
  const [step, setStep] = useState(1);
  const [creationSource, setCreationSource] = useState<CreationSource>('blank');
  const [projectType, setProjectType] = useState<ProjectType>('long_novel');
  const [targetPlatform, setTargetPlatform] = useState<TargetPlatform>('generic');
  const [title, setTitle] = useState('');
  const [targetWords, setTargetWords] = useState('');
  const [ideaSeed, setIdeaSeed] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const reset = () => {
    setStep(1);
    setCreationSource('blank');
    setProjectType('long_novel');
    setTargetPlatform('generic');
    setTitle('');
    setTargetWords('');
    setIdeaSeed('');
    setDescription('');
    setErrors({});
  };

  const validateStep4 = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) {
      newErrors.title = '请输入作品标题';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreate = () => {
    if (validateStep4()) {
      const workflowStage =
        projectType === 'short_story' ? 'topic' : 'idea_or_inspiration';
      const ideaStatusValue = creationSource === 'idea' ? 'draft' : 'none';

      onCreate({
        title: title.trim(),
        type: projectType,
        platformStyle: targetPlatform,
        creationSource,
        targetPlatform,
        targetWords: parseInt(targetWords) || 0,
        currentWorkflowStage: workflowStage,
        ideaStatus: ideaStatusValue,
        ideaSeed: creationSource === 'idea' ? ideaSeed.trim() : undefined,
        description: description.trim() || undefined,
      });
      reset();
    }
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

  const handleNext = () => setStep((s) => Math.min(s + 1, 4));
  const handlePrev = () => setStep((s) => Math.max(s - 1, 1));

  return (
    <div style={dialogStyles.backdrop} onClick={handleBackdrop}>
      <div style={dialogStyles.dialog}>
        <div style={dialogStyles.header}>
          <div>
            <h2 style={dialogStyles.title}>创建新作品</h2>
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
          {['开始方式', '作品类型', '目标平台', '基础信息'].map((label, i) => (
            <div key={i} style={dialogStyles.stepItem}>
              <div
                style={{
                  ...dialogStyles.stepDot,
                  backgroundColor: step > i + 1 ? '#2ecc71' : step === i + 1 ? 'var(--color-accent, #e94560)' : 'rgba(255,255,255,0.1)',
                  color: step > i + 1 ? '#fff' : step === i + 1 ? '#fff' : 'var(--color-text-muted, #6c6c80)',
                }}
              >
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span
                style={{
                  ...dialogStyles.stepLabel,
                  color: step === i + 1 ? 'var(--color-text-primary, #eaeaea)' : 'var(--color-text-muted, #6c6c80)',
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
                      borderColor: creationSource === opt.value ? 'var(--color-accent, #e94560)' : 'var(--color-border, #2a2a4a)',
                      backgroundColor: creationSource === opt.value ? 'rgba(233,69,96,0.08)' : 'var(--color-bg-primary, #1a1a2e)',
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
                      borderColor: projectType === opt.value ? 'var(--color-accent, #e94560)' : 'var(--color-border, #2a2a4a)',
                      backgroundColor: projectType === opt.value ? 'rgba(233,69,96,0.08)' : 'var(--color-bg-primary, #1a1a2e)',
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

          {/* Step 3: 目标平台 */}
          {step === 3 && (
            <div style={dialogStyles.stepBody}>
              <h3 style={dialogStyles.stepTitle}>目标平台？</h3>
              <div style={dialogStyles.platformGrid}>
                {PLATFORM_OPTIONS_WIZARD.map((opt) => (
                  <div
                    key={opt.value}
                    style={{
                      ...dialogStyles.platformCard,
                      borderColor: targetPlatform === opt.value ? 'var(--color-accent, #e94560)' : 'var(--color-border, #2a2a4a)',
                      backgroundColor: targetPlatform === opt.value ? 'rgba(233,69,96,0.08)' : 'var(--color-bg-primary, #1a1a2e)',
                    }}
                    onClick={() => setTargetPlatform(opt.value)}
                  >
                    {opt.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: 基础信息 */}
          {step === 4 && (
            <div style={dialogStyles.stepBody}>
              <h3 style={dialogStyles.stepTitle}>基础信息</h3>
              <div style={dialogStyles.form}>
                <div style={dialogStyles.field}>
                  <label style={dialogStyles.label}>作品标题 *</label>
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

                <div style={dialogStyles.field}>
                  <label style={dialogStyles.label}>目标字数（可选）</label>
                  <input
                    style={dialogStyles.input}
                    type="number"
                    value={targetWords}
                    onChange={(e) => setTargetWords(e.target.value)}
                    placeholder="例如：200000"
                    min={0}
                  />
                </div>

                {creationSource === 'idea' && (
                  <div style={dialogStyles.field}>
                    <label style={dialogStyles.label}>原始想法 *</label>
                    <textarea
                      style={{
                        ...dialogStyles.textarea,
                        borderColor: ideaSeed.trim() ? '' : 'var(--color-accent, #e94560)',
                      }}
                      value={ideaSeed}
                      onChange={(e) => setIdeaSeed(e.target.value)}
                      placeholder="写下你的想法，哪怕只是一句话。AI 会通过追问帮你完善成可创作的作品设定。"
                      rows={3}
                    />
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
    backgroundColor: 'var(--color-bg-secondary, #16213e)',
    borderRadius: 'var(--radius-lg, 12px)',
    border: '1px solid var(--color-border, #2a2a4a)',
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
    color: 'var(--color-text-primary, #eaeaea)',
    margin: 0,
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--color-text-muted, #6c6c80)',
    margin: '6px 0 0 0',
    lineHeight: 1.4,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted, #6c6c80)',
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
    fontSize: '12px',
    fontWeight: 600,
    flexShrink: 0,
  },
  stepLabel: {
    fontSize: '12px',
    fontWeight: 500,
    marginLeft: '6px',
    marginRight: '4px',
  },
  stepLine: {
    width: '36px',
    height: '1px',
    backgroundColor: 'var(--color-border, #2a2a4a)',
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
    color: 'var(--color-text-primary, #eaeaea)',
    margin: 0,
  },
  cardGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  selectCard: {
    padding: '14px 16px',
    border: '1px solid var(--color-border, #2a2a4a)',
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
    color: 'var(--color-text-primary, #eaeaea)',
  },
  cardDesc: {
    fontSize: '12px',
    color: 'var(--color-text-muted, #6c6c80)',
    lineHeight: 1.4,
  },
  platformGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
  },
  platformCard: {
    padding: '12px',
    border: '1px solid var(--color-border, #2a2a4a)',
    borderRadius: 'var(--radius-md, 8px)',
    cursor: 'pointer',
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-primary, #eaeaea)',
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
    fontSize: '13px',
    color: 'var(--color-text-secondary, #a0a0b0)',
    fontWeight: 500,
  },
  input: {
    padding: '8px 12px',
    backgroundColor: 'var(--color-bg-primary, #1a1a2e)',
    border: '1px solid var(--color-border, #2a2a4a)',
    borderRadius: 'var(--radius-md, 8px)',
    color: 'var(--color-text-primary, #eaeaea)',
    fontSize: '14px',
    fontFamily: 'var(--font-family, sans-serif)',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  inputError: {
    borderColor: 'var(--color-accent, #e94560)',
  },
  textarea: {
    padding: '8px 12px',
    backgroundColor: 'var(--color-bg-primary, #1a1a2e)',
    border: '1px solid var(--color-border, #2a2a4a)',
    borderRadius: 'var(--radius-md, 8px)',
    color: 'var(--color-text-primary, #eaeaea)',
    fontSize: '14px',
    fontFamily: 'var(--font-family, sans-serif)',
    outline: 'none',
    resize: 'vertical',
  },
  select: {
    padding: '10px 12px',
    backgroundColor: '#1a1a2e',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    color: '#eaeaea',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    cursor: 'pointer',
    width: '100%',
    WebkitAppearance: 'menulist',
  },
  error: {
    fontSize: '12px',
    color: 'var(--color-accent, #e94560)',
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
    border: '1px solid var(--color-border, #2a2a4a)',
    borderRadius: 'var(--radius-md, 8px)',
    color: 'var(--color-text-secondary, #a0a0b0)',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
  },
  submitBtn: {
    padding: '8px 24px',
    backgroundColor: 'var(--color-accent, #e94560)',
    border: 'none',
    borderRadius: 'var(--radius-md, 8px)',
    color: '#fff',
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
    backgroundColor: 'var(--color-bg-secondary, #16213e)',
    border: '1px solid var(--color-border, #2a2a4a)',
    borderRadius: 'var(--radius-md, 8px)',
    color: 'var(--color-text-primary, #eaeaea)',
    fontSize: '14px',
    fontFamily: 'var(--font-family, sans-serif)',
    outline: 'none',
  },
  clearBtn: {
    position: 'absolute',
    right: '8px',
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted, #6c6c80)',
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
    border: '1px solid var(--color-border, #2a2a4a)',
    borderRadius: 'var(--radius-sm, 4px)',
    color: 'var(--color-text-secondary, #a0a0b0)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
    transition: 'all 0.15s',
  },
  typeBtnActive: {
    backgroundColor: 'var(--color-accent, #e94560)',
    borderColor: 'var(--color-accent, #e94560)',
    color: '#fff',
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
    deleteProject,
    getFilteredProjects,
  } = useProjectStore();

  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const { createDraft } = useIdeaLabStore();

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const filteredProjects = getFilteredProjects();

  const handleCreate = async (data: {
    title: string;
    type: ProjectType;
    platformStyle: string;
    creationSource: CreationSource;
    targetPlatform: TargetPlatform;
    targetWords: number;
    currentWorkflowStage: WorkflowStage;
    ideaStatus: IdeaStatus;
    ideaSeed?: string;
    description?: string;
  }) => {
    if (data.creationSource === 'idea') {
      // 从想法开始 → 创建 Idea Draft 并跳转 Idea Lab
      try {
        const draft = await createDraft({
          rawIdea: data.ideaSeed || data.description || data.title || '',
          projectType: data.type,
          targetPlatform: data.targetPlatform,
          targetWords: data.targetWords || 0,
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

    // 非 idea 来源保持原有创建逻辑
    const project = await createProject(data);
    setIsDialogOpen(false);
    await openProject(project.id, project.title, navigate);
  };

  const handleSelectProject = async (id: string) => {
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
    setDeleteTargetId(id);
  };

  const handleDeleteConfirm = async () => {
    if (deleteTargetId) {
      await deleteProject(deleteTargetId);
      setDeleteTargetId(null);
    }
  };

  return (
    <div style={pageStyles.container}>
      <div style={pageStyles.header}>
        <h1 style={pageStyles.pageTitle}>我的项目</h1>
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
        open={deleteTargetId !== null}
        title="删除项目"
        description="确定要删除这个项目吗？所有章节和设定数据将被永久删除，此操作不可撤销。"
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTargetId(null)}
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
    color: 'var(--color-text-primary, #eaeaea)',
    margin: 0,
  },
  createBtn: {
    padding: '10px 24px',
    backgroundColor: 'var(--color-accent, #e94560)',
    border: 'none',
    borderRadius: 'var(--radius-md, 8px)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
    transition: 'background-color 0.15s',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '16px',
  },
  noResults: {
    textAlign: 'center',
    padding: '40px',
    color: 'var(--color-text-muted, #6c6c80)',
    fontSize: '14px',
  },
};

export default ProjectListPage;
