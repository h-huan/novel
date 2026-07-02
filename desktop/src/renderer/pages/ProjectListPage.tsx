/**
 * ProjectListPage - 项目列表页
 * 显示所有项目卡片，支持搜索过滤和创建新项目
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { openProject } from '../lib/openProject';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import type { Project, ProjectType } from '@novel/shared';

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

const PLATFORM_OPTIONS = [
  { value: 'generic', label: '通用' },
  { value: 'qidian', label: '起点中文网' },
  { value: 'fanqie', label: '番茄小说' },
  { value: 'zhihu', label: '知乎盐选' },
  { value: 'jinjiang', label: '晋江文学城' },
  { value: 'douyin', label: '抖音故事' },
  { value: 'rules_horror', label: '规则怪谈' },
];

const TYPE_OPTIONS: { value: ProjectType; label: string }[] = [
  { value: 'short_story', label: '短篇' },
  { value: 'long_novel', label: '长篇' },
  { value: 'script', label: '剧本' },
];

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
// 创建项目对话框
// ============================================================

interface CreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    type: ProjectType;
    platformStyle: string;
  }) => void;
}

const CreateDialog: React.FC<CreateDialogProps> = ({ isOpen, onClose, onCreate }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ProjectType>('long_novel');
  const [platformStyle, setPlatformStyle] = useState('generic');
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) {
      newErrors.title = '请输入项目标题';
    }
    // 字数校验可选，创建后可设置目标字数
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onCreate({ title: title.trim(), type, platformStyle });
      setTitle('');
      setType('long_novel');
      setPlatformStyle('generic');
      setErrors({});
    }
  };

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div style={dialogStyles.backdrop} onClick={handleBackdrop}>
      <div style={dialogStyles.dialog}>
        <div style={dialogStyles.header}>
          <h2 style={dialogStyles.title}>新建项目</h2>
          <button style={dialogStyles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={dialogStyles.form}>
          <div style={dialogStyles.field}>
            <label style={dialogStyles.label}>标题 *</label>
            <input
              style={{
                ...dialogStyles.input,
                ...(errors.title ? dialogStyles.inputError : {}),
              }}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入项目标题..."
              autoFocus
            />
            {errors.title && <span style={dialogStyles.error}>{errors.title}</span>}
          </div>

          <div style={dialogStyles.field}>
            <label style={dialogStyles.label}>类型</label>
            <select
              style={dialogStyles.select}
              value={type}
              onChange={(e) => setType(e.target.value as ProjectType)}
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div style={dialogStyles.field}>
            <label style={dialogStyles.label}>目标平台</label>
            <select
              style={dialogStyles.select}
              value={platformStyle}
              onChange={(e) => setPlatformStyle(e.target.value)}
            >
              {PLATFORM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div style={dialogStyles.field}>
            <label style={dialogStyles.label}>目标字数</label>
            <input
              style={dialogStyles.input}
              type="number"
              defaultValue={100000}
              min={1}
              placeholder="输入目标字数..."
              disabled
            />
          </div>

          <div style={dialogStyles.actions}>
            <button type="button" style={dialogStyles.cancelBtn} onClick={onClose}>
              取消
            </button>
            <button type="submit" style={dialogStyles.submitBtn}>
              创建项目
            </button>
          </div>
        </form>
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
    width: '460px',
    maxWidth: '90vw',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--color-text-primary, #eaeaea)',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted, #6c6c80)',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 'var(--radius-sm, 4px)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
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
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px',
  },
  cancelBtn: {
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
    padding: '8px 20px',
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
        {TYPE_OPTIONS.map((opt) => (
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

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const filteredProjects = getFilteredProjects();

  const handleCreate = async (data: {
    title: string;
    type: ProjectType;
    platformStyle: string;
  }) => {
    const project = await createProject(data);
    setIsDialogOpen(false);
    // 引导窗口中通过 IPC 通知主进程切换窗口；主窗口中直接路由
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
