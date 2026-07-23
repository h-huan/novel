/**
 * ProjectDetailPage - 项目详情页
 * 项目信息面板 + 快捷入口 + 进度概览
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { useChapterStore } from '../stores/chapterStore';
import type { Project } from '@novel/shared';

interface ModuleEntry {
  key: string;
  label: string;
  icon: string;
  path: string;
  description: string;
}

const MODULES: ModuleEntry[] = [
  { key: 'writing', label: '写作', icon: '📝', path: 'writing', description: '创建和编辑章节内容' },
  { key: 'outline', label: '大纲', icon: '📋', path: 'outline', description: '规划卷章节结构与剧情' },
  { key: 'characters', label: '角色', icon: '👤', path: 'characters', description: '管理角色卡与关系图谱' },
  { key: 'world', label: '世界观', icon: '🌍', path: 'world', description: '地理/势力/力量体系设定' },
  { key: 'organizationMap', label: '地点与势力', icon: '🗺️', path: 'organization-map', description: '记录故事实际出现的地点、组织和相互关系' },
  { key: 'foreshadowing', label: '伏笔', icon: '🎯', path: 'foreshadowing', description: '埋设与追踪伏笔回收' },
  { key: 'timeline', label: '时间线', icon: '⏰', path: 'timeline', description: '管理故事时间线与事件' },
  { key: 'material', label: '素材', icon: '📚', path: 'material', description: '管理写作参考资料' },
];

const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { projects, selectProject, currentProject } = useProjectStore();
  const { chapters } = useChapterStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (id) {
      selectProject(id);
    }
    return () => {
      selectProject(null);
    };
  }, [id, selectProject]);

  if (!id || !currentProject) {
    return (
      <div style={styles.errorState}>
        <p>项目不存在或未找到</p>
        <button style={styles.backBtn} onClick={() => navigate('/')}>
          返回项目列表
        </button>
      </div>
    );
  }

  const projectChapters = chapters.filter((ch) => ch.projectId === id);
  const totalWords = projectChapters.reduce((sum, ch) => sum + ch.wordCount, 0);
  const chapterCount = projectChapters.length;
  const lockedChapters = projectChapters.filter((ch) => ch.status === 'locked').length;
  const draftedChapters = projectChapters.filter((ch) => ch.status === 'draft' || ch.status === 'reviewing').length;

  // 计算完成度（基于已写字数，无目标字数时仅显示已写字数）
  const progressPercent = currentProject.wordCount > 0
    ? Math.min(100, Math.round((totalWords / currentProject.wordCount) * 100))
    : 0;

  const statusLabel: Record<string, string> = {
    idea: '灵感',
    writing: '写作中',
    editing: '编辑中',
    published: '已发布',
    abandoned: '已放弃',
  };

  const typeLabel: Record<string, string> = {
    long_novel: '长篇小说',
    short_story: '短篇故事',
    screenplay: '剧本',
    poetry: '诗歌',
    essay: '散文',
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'writing': return '#3498db';
      case 'editing': return '#f39c12';
      case 'published': return '#2ecc71';
      case 'abandoned': return '#95a5a6';
      default: return '#8a8aa0';
    }
  };

  return (
    <div style={styles.container}>
      {/* 项目信息面板 */}
      <div style={styles.infoPanel}>
        <div style={styles.infoHeader}>
          <div>
            <h1 style={styles.title}>{currentProject.title}</h1>
            <div style={styles.metaRow}>
              <span style={{ ...styles.metaBadge, backgroundColor: `${getStatusColor(currentProject.status)}22`, color: getStatusColor(currentProject.status) }}>
                {statusLabel[currentProject.status] || currentProject.status}
              </span>
              <span style={styles.metaBadge}>
                {typeLabel[currentProject.type] || currentProject.type}
              </span>
              {currentProject.platforms && currentProject.platforms.length > 0 && (
                <span style={styles.metaBadge}>
                  {currentProject.platforms[0]}
                </span>
              )}
            </div>
          </div>
          <div style={styles.infoActions}>
            <button
              style={styles.deleteBtn}
              onClick={() => setShowDeleteConfirm(true)}
            >
              删除项目
            </button>
          </div>
        </div>

        {currentProject.description && (
          <p style={styles.description}>{currentProject.description}</p>
        )}

        {/* 进度概览 */}
        <div style={styles.progressSection}>
          <h3 style={styles.sectionTitle}>进度概览</h3>
          <div style={styles.progressRow}>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${progressPercent}%`,
                  backgroundColor: progressPercent >= 100 ? '#2ecc71' : '#3498db',
                }}
              />
            </div>
            <span style={styles.progressText}>{progressPercent}%</span>
          </div>
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <span style={styles.statValue}>{totalWords.toLocaleString()}</span>
              <span style={styles.statLabel}>已写字数</span>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statValue}>{chapterCount}</span>
              <span style={styles.statLabel}>章节数</span>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statValue}>{lockedChapters}</span>
              <span style={styles.statLabel}>已锁定</span>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statValue}>{currentProject.wordCount.toLocaleString()}</span>
              <span style={styles.statLabel}>项目总字数</span>
            </div>
          </div>
        </div>

        {/* 项目时间信息 */}
        <div style={styles.timeInfo}>
          <span>创建于 {new Date(currentProject.createdAt).toLocaleDateString('zh-CN')}</span>
          <span>更新于 {new Date(currentProject.updatedAt).toLocaleDateString('zh-CN')}</span>
        </div>
      </div>

      {/* 每周总结入口 */}
      <div style={{ marginBottom: 24, padding: 20, background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', borderRadius: 12, cursor: 'pointer' }} onClick={() => navigate(`/project/${id}/weekly-summary`)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 40 }}>📅</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>每周写作总结</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>查看本周进度、连贯性检查、下周计划、伏笔状态</div>
          </div>
          <div style={{ color: '#fff', fontSize: 24 }}>→</div>
        </div>
      </div>

      {/* 快捷入口 */}
      <div style={styles.modulesSection}>
        <h3 style={styles.sectionTitle}>功能模块</h3>
        <div style={styles.modulesGrid}>
          {MODULES.map((mod) => (
            <button
              key={mod.key}
              style={styles.moduleCard}
              onClick={() => navigate(`/project/${id}/${mod.path}`)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)';
              }}
            >
              <span style={styles.moduleIcon}>{mod.icon}</span>
              <div style={styles.moduleInfo}>
                <span style={styles.moduleLabel}>{mod.label}</span>
                <span style={styles.moduleDesc}>{mod.description}</span>
              </div>
              <span style={styles.moduleArrow}>→</span>
            </button>
          ))}
        </div>
      </div>

      {/* 灵感入口 */}
      <div style={styles.inspirationBar}>
        <span>💡 灵感库</span>
        <span style={styles.inspirationDesc}>随时记录你的创作灵感</span>
        <button
          style={styles.inspirationBtn}
          onClick={() => navigate('/inspiration')}
        >
          前往灵感库 →
        </button>
      </div>

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <h3 style={styles.dialogTitle}>确认删除项目</h3>
            <p style={styles.dialogDesc}>
              删除后无法恢复。项目「{currentProject.title}」及其所有章节、角色数据将被永久删除。
            </p>
            <div style={styles.dialogActions}>
              <button
                style={styles.cancelBtn}
                onClick={() => setShowDeleteConfirm(false)}
              >
                取消
              </button>
              <button
                style={styles.confirmDeleteBtn}
                onClick={() => {
                  const { deleteProject } = useProjectStore.getState();
                  deleteProject(id);
                  navigate('/');
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px 32px',
    maxWidth: '960px',
    margin: '0 auto',
    height: '100%',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  // 错误状态
  errorState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
    color: '#8a8aa0',
  },
  backBtn: {
    padding: '8px 20px',
    fontSize: '14px',
    color: '#eaeaea',
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  // 信息面板
  infoPanel: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: '12px',
    padding: '24px',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  infoHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  title: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 700,
    color: '#eaeaea',
    marginBottom: '8px',
  },
  metaRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  metaBadge: {
    padding: '3px 10px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#8a8aa0',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: '4px',
    lineHeight: 1.4,
  },
  infoActions: {
    display: 'flex',
    gap: '8px',
  },
  deleteBtn: {
    padding: '6px 14px',
    fontSize: '12px',
    color: '#e74c3c',
    backgroundColor: 'rgba(231, 76, 60, 0.08)',
    border: '1px solid rgba(231, 76, 60, 0.2)',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  description: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#8a8aa0',
    margin: '0 0 20px 0',
  },
  // 进度
  progressSection: {
    marginBottom: '16px',
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: 600,
    color: '#eaeaea',
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  progressBar: {
    flex: 1,
    height: '8px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#eaeaea',
    minWidth: '40px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.04)',
  },
  statValue: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#eaeaea',
  },
  statLabel: {
    fontSize: '11px',
    color: '#6c6c80',
    marginTop: '4px',
  },
  timeInfo: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
    color: '#6c6c80',
  },
  // 模块入口
  modulesSection: {},
  modulesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px',
  },
  moduleCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
    width: '100%',
  },
  moduleIcon: {
    fontSize: '24px',
    lineHeight: 1,
  },
  moduleInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  moduleLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#eaeaea',
  },
  moduleDesc: {
    fontSize: '11px',
    color: '#6c6c80',
  },
  moduleArrow: {
    fontSize: '16px',
    color: '#3a3a50',
  },
  // 灵感入口
  inspirationBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 20px',
    backgroundColor: 'rgba(155, 89, 182, 0.08)',
    border: '1px solid rgba(155, 89, 182, 0.15)',
    borderRadius: '10px',
    fontSize: '14px',
    color: '#eaeaea',
  },
  inspirationDesc: {
    flex: 1,
    fontSize: '12px',
    color: '#8a8aa0',
  },
  inspirationBtn: {
    padding: '6px 16px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#9b59b6',
    backgroundColor: 'rgba(155, 89, 182, 0.1)',
    border: '1px solid rgba(155, 89, 182, 0.2)',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  // 覆盖弹窗
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(2px)',
  },
  dialog: {
    backgroundColor: '#1e1e32',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '420px',
    width: '90%',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  dialogTitle: {
    margin: '0 0 12px 0',
    fontSize: '18px',
    fontWeight: 600,
    color: '#eaeaea',
  },
  dialogDesc: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#8a8aa0',
    marginBottom: '24px',
  },
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  cancelBtn: {
    padding: '8px 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#8a8aa0',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  confirmDeleteBtn: {
    padding: '8px 20px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#e74c3c',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};

export default ProjectDetailPage;
