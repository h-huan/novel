import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { openProject } from '../lib/openProject';
import { getGenerationRecovery, generationRecoveryUiState, startFailedProjectRecovery, type GenerationRecoveryAudit } from '../lib/generationRecovery';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import type { Project, ProjectType } from '@novel/shared';
import { platformLabel as platformLabelOf } from '../lib/executionStandards';

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

const WORKFLOW_STAGE_LABELS: Record<string, string> = {
  topic: '题材',
  world_setting: '世界观',
  character: '角色',
  outline: '大纲',
  volume: '分卷',
  chapter: '章节',
};

const STATUS_COLORS: Record<string, string> = {
  generation_failed: 'rgba(248, 113, 113, 0.16)',
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  generation_failed: '#fca5a5',
};

const USER_STATUS_LABELS: Record<string, string> = {
  creating: '资料生成中',
  generation_failed: '生成失败 · 不可写作',
  active: '可继续创作',
};

function formatRelativeTime(date: Date): string {
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
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
  return current >= 10000 ? `${(current / 10000).toFixed(1)}万字` : `${current.toLocaleString()}字`;
}

interface ProjectCardProps {
  project: Project;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  retryBusy: boolean;
  retryDisabled: boolean;
  recoveryAudit?: GenerationRecoveryAudit | null;
  retryMessage?: string;
  selected: boolean;
  onSelectionChange: (id: string, selected: boolean) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onSelect,
  onDelete,
  onRetry,
  retryBusy,
  retryDisabled,
  recoveryAudit = null,
  retryMessage,
  selected,
  onSelectionChange,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const failed = project.status === 'generation_failed';
  const recoveryState = generationRecoveryUiState(project.status, recoveryAudit);
  const interruptedCreating = project.status === 'creating' && recoveryState.recoverable;
  const recoveryAttention = failed || interruptedCreating;
  const statusLabel = recoveryState.statusLabel || USER_STATUS_LABELS[project.status] || project.status;
  const statusBgColor = recoveryAttention ? 'rgba(248, 113, 113, 0.16)' : (STATUS_COLORS[project.status] || 'rgba(108,108,128,0.2)');
  const statusTextColor = recoveryAttention ? '#fca5a5' : (STATUS_TEXT_COLORS[project.status] || 'var(--color-text-muted)');
  const platformText = platformLabelOf(project.targetPlatform) || project.targetPlatform;
  const stageLabel = WORKFLOW_STAGE_LABELS[project.currentWorkflowStage] || '';

  return (
    <div
      style={{ ...cardStyles.card, ...(recoveryAttention ? cardStyles.failedCard : {}) }}
      onClick={() => onSelect(project.id)}
      onMouseEnter={(event) => {
        setIsHovered(true);
        event.currentTarget.style.borderColor = recoveryAttention ? 'rgba(248,113,113,0.55)' : 'var(--color-accent)';
        event.currentTarget.style.transform = recoveryAttention ? 'none' : 'translateY(-2px)';
      }}
      onMouseLeave={(event) => {
        setIsHovered(false);
        event.currentTarget.style.borderColor = recoveryAttention ? 'rgba(148,163,184,0.28)' : 'var(--color-border)';
        event.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={cardStyles.header}>
        <label style={cardStyles.selection} title={`选择“${project.title}”`} onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            aria-label={`选择项目 ${project.title}`}
            onChange={(event) => onSelectionChange(project.id, event.target.checked)}
            style={cardStyles.checkbox}
          />
        </label>
        <h3 style={{ ...cardStyles.title, ...(recoveryAttention ? cardStyles.failedTitle : {}) }}>{project.title}</h3>
        <div style={cardStyles.headerRight}>
          <span style={{ ...cardStyles.typeBadge, backgroundColor: TYPE_COLORS[project.type] || 'var(--color-text-muted)' }}>
            {TYPE_LABELS[project.type] || project.type}
          </span>
          <button
            style={{ ...cardStyles.deleteBtn, opacity: isHovered || recoveryAttention ? 1 : 0, pointerEvents: isHovered || recoveryAttention ? 'auto' : 'none' }}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(project.id);
            }}
            title="删除项目"
          >
            🗑
          </button>
        </div>
      </div>

      <div style={cardStyles.metaRow}>
        {stageLabel && <span style={cardStyles.metaTag}>{stageLabel}</span>}
        {stageLabel && <span style={cardStyles.metaDivider}>·</span>}
        <span style={cardStyles.metaTag}>{platformText}</span>
      </div>

      {project.description && <p style={cardStyles.description}>{project.description}</p>}

      <div style={cardStyles.progressSection}>
        <span style={cardStyles.wordCount}>{formatWordCount(project.wordCount)}</span>
      </div>

      <div style={cardStyles.footer}>
        <span style={{ ...cardStyles.statusTag, backgroundColor: statusBgColor, color: statusTextColor }}>{statusLabel}</span>
        <span style={cardStyles.time}>{formatRelativeTime(project.updatedAt)}</span>
      </div>

      {recoveryState.tracked && (recoveryState.running || recoveryState.recoverable || recoveryState.blocked) && (
        <div style={cardStyles.failedActions} onClick={(event) => event.stopPropagation()}>
          <span style={cardStyles.failedHint}>
            {recoveryState.running
              ? '创作资料正在生成，可随时查看实时进度。'
              : recoveryState.recoverable
                ? '创建流程已中断；后端诊断允许从已确认题材继续恢复。'
                : (recoveryAudit?.recommendedAction || '当前状态不允许自动恢复，请进入项目查看诊断。')}
          </span>
          {recoveryState.actionLabel && (
            <button
              type="button"
              style={{ ...cardStyles.retryBtn, opacity: retryDisabled && !recoveryState.running ? 0.55 : 1 }}
              disabled={retryDisabled && !recoveryState.running}
              onClick={() => onRetry(project.id)}
              aria-label={`${recoveryState.actionLabel} ${project.title}`}
            >
              {recoveryState.running ? '查看进度' : retryBusy ? '正在启动…' : recoveryState.actionLabel}
            </button>
          )}
          {retryMessage && <span role="alert" style={cardStyles.retryMessage}>{retryMessage}</span>}
        </div>
      )}
    </div>
  );
};

interface SearchFilterProps {
  searchQuery: string;
  typeFilter: ProjectType | 'all';
  onSearchChange: (query: string) => void;
  onTypeChange: (type: ProjectType | 'all') => void;
}

const SearchFilter: React.FC<SearchFilterProps> = ({ searchQuery, typeFilter, onSearchChange, onTypeChange }) => (
  <div style={filterStyles.container}>
    <div style={filterStyles.searchWrap}>
      <span style={filterStyles.searchIcon}>🔍</span>
      <input
        style={filterStyles.searchInput}
        type="text"
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="搜索项目..."
      />
      {searchQuery && <button style={filterStyles.clearBtn} onClick={() => onSearchChange('')}>✕</button>}
    </div>
    <div style={filterStyles.typeFilters}>
      <button style={{ ...filterStyles.typeBtn, ...(typeFilter === 'all' ? filterStyles.typeBtnActive : {}) }} onClick={() => onTypeChange('all')}>全部</button>
      {[
        { value: 'short_story' as ProjectType, label: '短篇' },
        { value: 'long_novel' as ProjectType, label: '长篇' },
        { value: 'script' as ProjectType, label: '剧本' },
      ].map((option) => (
        <button
          key={option.value}
          style={{ ...filterStyles.typeBtn, ...(typeFilter === option.value ? filterStyles.typeBtnActive : {}) }}
          onClick={() => onTypeChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

const ProjectListPage: React.FC = () => {
  const {
    projects,
    searchQuery,
    typeFilter,
    fetchProjects,
    setSearchQuery,
    setTypeFilter,
    selectProject,
    deleteProjects,
    getFilteredProjects,
  } = useProjectStore();

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [retryingProjectId, setRetryingProjectId] = useState<string | null>(null);
  const [retryMessages, setRetryMessages] = useState<Record<string, string>>({});
  const [recoveryAudits, setRecoveryAudits] = useState<Record<string, GenerationRecoveryAudit | null>>({});

  useEffect(() => { void fetchProjects(); }, [fetchProjects]);

  useEffect(() => {
    if (searchParams.get('new') === '1') navigate('/discover', { replace: true });
  }, [navigate, searchParams]);

  useEffect(() => {
    // `creating` is not proof that a worker is still alive. A crashed background
    // creation can remain in that status while the recovery audit already says
    // running=false/canResume=true. Query both incomplete statuses so the existing
    // recovery endpoint is visible from the project list instead of being hidden
    // behind a misleading "资料生成中" badge.
    const recoveryIds = projects
      .filter((project) => project.status === 'generation_failed' || project.status === 'creating')
      .map((project) => project.id);
    let cancelled = false;
    void Promise.all(recoveryIds.map(async (id) => {
      try { return [id, await getGenerationRecovery(id)] as const; }
      catch { return [id, null] as const; }
    })).then((entries) => {
      if (!cancelled) setRecoveryAudits(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [projects]);

  const filteredProjects = getFilteredProjects();
  const filteredIds = filteredProjects.map((project) => project.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedProjectIds.has(id));

  const handleSelectProject = async (id: string) => {
    const project = projects.find((item) => item.id === id);
    const recoveryState = generationRecoveryUiState(project?.status, recoveryAudits[id]);
    if (recoveryState.running) {
      navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });
      return;
    }
    try {
      await selectProject(id);
      const selected = useProjectStore.getState().currentProject;
      if (selected) {
        await openProject(selected.id, selected.title, navigate);
        return;
      }
      await useProjectStore.getState().fetchProject(id);
      const reloaded = useProjectStore.getState().currentProject;
      if (reloaded) await openProject(reloaded.id, reloaded.title, navigate);
      else alert('无法加载项目数据，请检查后端服务是否正常运行');
    } catch (error: any) {
      console.error('[ProjectList] 选择项目失败:', error);
      alert(error?.message || '打开项目失败，请重试');
    }
  };

  const handleRetryProject = async (id: string) => {
    const project = projects.find((item) => item.id === id);
    const recoveryState = generationRecoveryUiState(project?.status, recoveryAudits[id]);
    if (recoveryState.running) {
      navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });
      return;
    }
    if (!recoveryState.recoverable) {
      setRetryMessages((current) => ({
        ...current,
        [id]: recoveryAudits[id]?.recommendedAction || '当前诊断不允许自动恢复，请进入项目查看原因。',
      }));
      return;
    }
    if (retryingProjectId) return;
    setRetryingProjectId(id);
    setRetryMessages((current) => ({ ...current, [id]: '' }));
    try {
      await startFailedProjectRecovery(id);
      setRecoveryAudits((current) => ({
        ...current,
        [id]: current[id] ? { ...current[id]!, running: true, canResume: false } : current[id],
      }));
      navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });
    } catch (error: any) {
      const audit = await getGenerationRecovery(id).catch(() => null);
      setRecoveryAudits((current) => ({ ...current, [id]: audit }));
      if (audit?.running) {
        navigate(`/generation-progress/${id}`, { state: { title: project?.title || '项目' } });
      } else {
        setRetryMessages((current) => ({ ...current, [id]: `启动失败：${error?.message || '请查看项目诊断'}` }));
        await fetchProjects();
      }
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
    setSelectedProjectIds((current) => {
      const next = new Set(current);
      result.deleted.forEach((id) => next.delete(id));
      return next;
    });
    if (result.failed.length > 0) alert(`已删除 ${result.deleted.length} 个项目，${result.failed.length} 个删除失败。请稍后重试失败项。`);
  };

  const setProjectSelected = (id: string, selected: boolean) => {
    setSelectedProjectIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelectedProjectIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  };

  return (
    <div style={pageStyles.container}>
      <div style={pageStyles.header}>
        <h1 style={pageStyles.pageTitle}>我的项目</h1>
        <button style={pageStyles.createBtn} onClick={() => navigate('/discover')}>+ 新建项目</button>
      </div>

      <SearchFilter searchQuery={searchQuery} typeFilter={typeFilter} onSearchChange={setSearchQuery} onTypeChange={setTypeFilter} />

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
            description="从灵感发现进入唯一创作流程，创建第一部作品"
            actionLabel="开始创作"
            onAction={() => navigate('/discover')}
          />
        ) : (
          <div style={pageStyles.noResults}><p>没有找到匹配的项目</p></div>
        )
      ) : (
        <div style={pageStyles.grid}>
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onSelect={handleSelectProject}
              onDelete={(id) => setDeleteTargets([id])}
              onRetry={handleRetryProject}
              retryBusy={retryingProjectId === project.id}
              retryDisabled={retryingProjectId !== null}
              recoveryAudit={recoveryAudits[project.id]}
              retryMessage={retryMessages[project.id]}
              selected={selectedProjectIds.has(project.id)}
              onSelectionChange={setProjectSelected}
            />
          ))}
        </div>
      )}

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

const cardStyles: Record<string, React.CSSProperties> = {
  card: { backgroundColor: 'var(--color-bg-secondary,#fff)', borderRadius: 12, border: '1px solid var(--color-border,#e5e7eb)', padding: 20, cursor: 'pointer', transition: 'border-color .2s, transform .15s', display: 'flex', flexDirection: 'column', gap: 12 },
  failedCard: { backgroundColor: 'rgba(29,34,48,.72)', borderColor: 'rgba(148,163,184,.28)', borderStyle: 'dashed' },
  failedTitle: { color: 'var(--color-text-muted)' },
  failedActions: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 12 },
  failedHint: { color: 'var(--color-text-muted)', fontSize: 12, flex: '1 1 180px' },
  retryBtn: { border: '1px solid rgba(248,113,113,.52)', borderRadius: 7, backgroundColor: 'rgba(248,113,113,.13)', color: '#fecaca', fontSize: 13, fontWeight: 700, padding: '7px 12px', cursor: 'pointer' },
  retryMessage: { color: '#fca5a5', fontSize: 12, flexBasis: '100%' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  selection: { width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: 'rgba(255,255,255,.035)', flexShrink: 0, cursor: 'pointer' },
  checkbox: { width: 16, height: 16, accentColor: 'var(--color-accent)', cursor: 'pointer' },
  title: { fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 },
  typeBadge: { fontSize: 'var(--font-size-xs)', padding: '2px 8px', borderRadius: 4, color: 'var(--color-white)', fontWeight: 500, flexShrink: 0 },
  metaRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaTag: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },
  metaDivider: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', opacity: .4 },
  deleteBtn: { background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: 16, cursor: 'pointer', padding: '2px 4px', borderRadius: 4, lineHeight: 1, transition: 'opacity .15s', flexShrink: 0 },
  description: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  progressSection: { display: 'flex', flexDirection: 'column', gap: 6 },
  wordCount: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono,monospace)' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  statusTag: { fontSize: 'var(--font-size-xs)', padding: '2px 8px', borderRadius: 4, fontWeight: 500 },
  time: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },
};

const filterStyles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 },
  searchWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: 12, fontSize: 14, pointerEvents: 'none' },
  searchInput: { width: '100%', padding: '10px 36px', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none' },
  clearBtn: { position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 14, padding: 4 },
  typeFilters: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  typeBtn: { padding: '4px 14px', backgroundColor: 'transparent', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', cursor: 'pointer', fontFamily: 'inherit' },
  typeBtnActive: { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)', color: 'var(--color-white)' },
};

const pageStyles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 1200, margin: '0 auto', padding: '32px 24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  pageTitle: { fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 },
  createBtn: { padding: '10px 24px', backgroundColor: 'var(--color-accent)', border: 'none', borderRadius: 8, color: 'var(--color-white)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  selectionBar: { display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '8px 12px', margin: '12px 0 16px', border: '1px solid var(--color-border)', borderRadius: 8, backgroundColor: 'rgba(255,255,255,.025)' },
  selectAllLabel: { display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)', fontSize: 14, cursor: 'pointer' },
  selectionCount: { marginLeft: 'auto', color: 'var(--color-text-muted)', fontSize: 13 },
  bulkDeleteBtn: { padding: '7px 14px', border: '1px solid rgba(239,68,68,.45)', borderRadius: 7, backgroundColor: 'rgba(239,68,68,.1)', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16 },
  noResults: { textAlign: 'center', padding: 40, color: 'var(--color-text-muted)', fontSize: 14 },
};

export default ProjectListPage;
