/**
 * ChapterEditorShell - 章节编辑器外壳组件
 * 整合 MarkdownEditor + 章节信息 + 工具栏 + 自动保存 + 字数统计
 * 
 * ┌──────────────────────────────────────────────────────┐
 * │ 卷-章: 卷一·第3章 │ 标题: 暗流涌动 │ 状态: [草稿]  │
 * ├──────────────────────────────────────────────────────┤
 * │ [锁定] [取消锁定] [生成下一章] [AI续写] 保存: ● ● ●│
 * ├─┬────────────────────────────────────────────────────┤
 * │ │              Monaco Editor                         │
 * │ │              (markdown 内容)                       │
 * ├─┴────────────────────────────────────────────────────┤
 * │ 字数: 3,250 │ 天龙8步: 8/8 ✓ │ 上次保存: 2分钟前    │
 * └──────────────────────────────────────────────────────┘
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import MarkdownEditor from '../editor/MarkdownEditor';
import ChapterStatusBadge from './ChapterStatusBadge';
import ConfirmDialog from '../common/ConfirmDialog';
import { showNotification } from '../common/Notification';
import { useChapterStore } from '../../stores/chapterStore';
import type { Chapter } from '@novel/shared';

export interface ChapterEditorShellProps {
  /** 当前章节（受控） */
  chapter: Chapter | null;
  /** 项目ID */
  projectId: string;
  /** 章节保存回调 */
  onSave?: (chapterId: string, content: string) => Promise<void>;
  /** 章节锁定回调 */
  onLock?: (chapterId: string) => Promise<void>;
  /** 章节解锁回调 */
  onUnlock?: (chapterId: string) => Promise<void>;
  /** 生成下一章回调 */
  onGenerateNext?: () => void;
  /** AI续写回调 */
  onAiWrite?: () => void;
}

const TIANLONG_STEPS = ['goal', 'trigger', 'action', 'obstacle', 'misjudge', 'reversal', 'cost', 'hook'] as const;
const TIANLONG_LABELS: Record<string, string> = {
  goal: '目标',
  trigger: '诱因',
  action: '行动',
  obstacle: '阻碍',
  misjudge: '误判',
  reversal: '反转',
  cost: '代价',
  hook: '钩子',
};

const AUTOSAVE_INTERVAL = 60000; // 60秒

const ChapterEditorShell: React.FC<ChapterEditorShellProps> = ({
  chapter,
  projectId,
  onSave,
  onLock,
  onUnlock,
  onGenerateNext,
  onAiWrite,
}) => {
  const navigate = useNavigate();
  const { updateChapter } = useChapterStore();
  const [localContent, setLocalContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const wordCountRef = useRef<HTMLSpanElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentRef = useRef('');

  // F11 沉浸式视图快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        if (chapter && projectId) {
          navigate(`/project/${projectId}/editor/${chapter.id}/immersive`);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chapter?.id, projectId]);

  // 章节切换时更新本地内容
  useEffect(() => {
    setLocalContent(chapter?.content || '');
    contentRef.current = chapter?.content || '';
    setIsDirty(false);
  }, [chapter?.id]);

  // 自动保存定时器
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setInterval(() => {
      if (isDirty && chapter) {
        handleSave();
      }
    }, AUTOSAVE_INTERVAL);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [isDirty, chapter?.id]);

  // 切换章节时如果有脏内容则保存
  useEffect(() => {
    return () => {
      if (isDirty && chapter) {
        handleSave();
      }
    };
  }, [chapter?.id]);

  // 计算完成的步数
  const completedSteps = chapter
    ? TIANLONG_STEPS.filter((step) => chapter.tianLong8Steps[step]?.trim()).length
    : 0;

  // 字数计算
  const wordCount = useCallback((text: string) => {
    if (!text || !text.trim()) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const withoutChinese = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ');
    const englishWords = withoutChinese
      .split(/\s+/)
      .filter((w) => w.length > 0 && /[a-zA-Z]/.test(w)).length;
    return chineseChars + englishWords;
  }, []);

  // 内容变更处理
  const handleContentChange = useCallback(
    (value: string) => {
      setLocalContent(value);
      contentRef.current = value;
      setIsDirty(true);
    },
    [],
  );

  // 保存
  const handleSave = useCallback(async () => {
    if (!chapter) return;

    try {
      const content = contentRef.current;
      await updateChapter(chapter.id, { content });
      if (onSave) {
        await onSave(chapter.id, content);
      }
      // 自动保存为.md文件
      try {
        const { api } = await import('../../lib/api');
        await api.post('/chain/chapter-save', {
          projectId, chapterId: chapter.id,
          volumeIndex: chapter.volumeIndex, chapterIndex: chapter.chapterIndex,
          title: chapter.title, content,
          wordCount: content.replace(/\s/g, '').length,
          status: chapter.status,
        });
      } catch {}
      setIsDirty(false);
      setLastSaved(new Date());
    } catch (err) {
      console.error('保存失败:', err);
    }
  }, [chapter, updateChapter, onSave, projectId]);

  // 锁定
  const handleLock = useCallback(async () => {
    if (!chapter) return;
    try {
      await updateChapter(chapter.id, { content: contentRef.current });
      try { const { api } = await import('../../lib/api'); await api.post('/chain/conflict-mark', { projectId, modifiedContent: contentRef.current }); } catch {}
      if (onLock) await onLock(chapter.id);
    } catch (err) {
      console.error('锁定失败:', err);
    }
  }, [chapter, updateChapter, onLock]);

  // 解锁（先确认）
  const handleUnlock = useCallback(async () => {
    if (!chapter) return;
    try {
      if (onUnlock) {
        await onUnlock(chapter.id);
      }
      setUnlockDialogOpen(false);
    } catch (err) {
      console.error('解锁失败:', err);
    }
  }, [chapter, onUnlock]);

  // 距上次保存的时间文本
  const getLastSavedText = (): string => {
    if (!lastSaved) return '尚未保存';
    const diff = Date.now() - lastSaved.getTime();
    if (diff < 60000) return '刚刚保存';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    return `${Math.floor(diff / 3600000)}小时前`;
  };

  if (!chapter) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>📝</div>
        <p style={styles.emptyText}>请选择一个章节开始编辑</p>
      </div>
    );
  }

  const isLocked = chapter.status === 'locked';

  return (
    <div style={styles.container}>
      {/* 头部信息 */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.volumeChapter}>
            卷{chapter.volumeIndex}·第{chapter.chapterIndex}章
          </span>
          <span style={styles.titleSeparator}>|</span>
          <span style={styles.title}>{chapter.title}</span>
        </div>
        <ChapterStatusBadge status={chapter.status} showLockIcon={true} />
      </div>

      {/* 工具栏 */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          {isLocked ? (
            <button
              style={styles.unlockBtn}
              onClick={() => setUnlockDialogOpen(true)}
              title="解锁章节（将变为草稿状态）"
            >
              🔓 取消锁定
            </button>
          ) : chapter.status === 'reviewing' ? (
            <>
              <button
                style={styles.lockBtn}
                onClick={handleLock}
                title="质检通过，锁定章节"
              >
                ✅ 通过质检 · 锁定
              </button>
              <button
                style={styles.unlockBtn}
                onClick={() => setUnlockDialogOpen(true)}
                title="驳回质检，返回草稿"
              >
                ↩️ 驳回 · 返回草稿
              </button>
            </>
          ) : (
            <>
              <button
                style={styles.lockBtn}
                onClick={async () => {
                  if (chapter) {
                    try {
                      const { api } = await import('../../lib/api');
                      await api.put(`/projects/${projectId}/chapters/${chapter.id}`, { status: 'reviewing' });
                      updateChapter(chapter.id, { status: 'reviewing' });
                      showNotification('success', '已提交质检，进入审核流程');
                    } catch {
                      showNotification('error', '提交质检失败，请重试');
                    }
                  }
                }}
                title="提交质检，进入审核流程"
              >
                📋 提交质检
              </button>
              <button
                style={styles.lockBtn}
                onClick={handleLock}
                title="直接锁定章节（跳过质检）"
              >
                🔒 直接锁定
              </button>
            </>
          )}
          <button
            style={styles.toolBtn}
            onClick={onGenerateNext}
            title="根据当前章节内容生成下一章"
          >
            ➡ 生成下一章
          </button>
          <button
            style={styles.toolBtn}
            onClick={onAiWrite}
            title="AI辅助续写当前章节"
          >
            ✨ AI续写
          </button>
        </div>
        <div style={styles.toolbarRight}>
          <span style={styles.saveIndicator}>
            {isDirty ? (
              <span style={styles.unsavedDot}>●</span>
            ) : (
              <span style={styles.savedDot}>●</span>
            )}
            保存: {getLastSavedText()}
          </span>
        </div>
      </div>

      {/* 编辑器区域 */}
      <div style={styles.editorArea}>
        <MarkdownEditor
          value={localContent}
          onChange={handleContentChange}
          readOnly={isLocked}
        />
      </div>

      {/* 底部状态栏 */}
      <div style={styles.statusBar}>
        <span style={styles.statusItem}>
          字数: <strong>{wordCount(localContent).toLocaleString()}</strong>
        </span>
        <span style={styles.statusDivider}>|</span>
        <span style={styles.statusItem}>
          天龙8步: {completedSteps}/{TIANLONG_STEPS.length}{' '}
          {completedSteps === TIANLONG_STEPS.length ? (
            <span style={styles.checkmark}>✓</span>
          ) : (
            <span style={styles.incomplete}>{TIANLONG_STEPS.length - completedSteps}步未完成</span>
          )}
        </span>
        <span style={styles.statusDivider}>|</span>
        <span style={{ ...styles.statusItem, color: isDirty ? 'var(--color-warning, #f39c12)' : 'var(--color-text-muted, #6c6c80)' }}>
          上次保存: {getLastSavedText()}
        </span>
      </div>

      {/* 解锁确认弹窗 */}
      <ConfirmDialog
        open={unlockDialogOpen}
        title="确认解锁章节"
        description={`「${chapter.title}」将回到草稿状态，内容可以被修改。确定要${chapter.status === 'locked' ? '解锁' : '驳回质检'}吗？`}
        confirmText="确认解锁"
        cancelText="取消"
        variant="warning"
        onConfirm={handleUnlock}
        onCancel={() => setUnlockDialogOpen(false)}
      />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#16162a',
  },
  // 头部
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: '#1a1a2e',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  volumeChapter: {
    fontSize: '13px',
    color: '#8a8aa0',
    fontWeight: 500,
  },
  titleSeparator: {
    color: '#3a3a50',
    fontSize: '14px',
  },
  title: {
    fontSize: '15px',
    color: '#eaeaea',
    fontWeight: 600,
  },
  // 工具栏
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: '#1a1a2e',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
  },
  lockBtn: {
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#e74c3c',
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    border: '1px solid rgba(231, 76, 60, 0.2)',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  unlockBtn: {
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#2ecc71',
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    border: '1px solid rgba(46, 204, 113, 0.2)',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  toolBtn: {
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: 500,
    color: '#8a8aa0',
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  saveIndicator: {
    fontSize: '12px',
    color: '#6c6c80',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  unsavedDot: {
    color: '#f39c12',
    fontSize: '10px',
  },
  savedDot: {
    color: '#2ecc71',
    fontSize: '10px',
  },
  // 编辑器
  editorArea: {
    flex: 1,
    overflow: 'hidden',
  },
  // 状态栏
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 20px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: '#1a1a2e',
    gap: '10px',
  },
  statusItem: {
    fontSize: '12px',
    color: '#6c6c80',
  },
  statusDivider: {
    color: '#2a2a40',
    fontSize: '12px',
  },
  checkmark: {
    color: '#2ecc71',
    fontWeight: 700,
  },
  incomplete: {
    color: '#f39c12',
    fontSize: '11px',
  },
  // 空状态
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    backgroundColor: '#1a1a2e',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px',
    opacity: 0.4,
  },
  emptyText: {
    fontSize: '14px',
    color: '#6c6c80',
    margin: 0,
  },
};

export default ChapterEditorShell;
