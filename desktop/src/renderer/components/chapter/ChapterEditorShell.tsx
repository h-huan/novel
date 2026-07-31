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
 * │ 字数: 3,250 │ 上次保存: 2分钟前                         │
 * └──────────────────────────────────────────────────────┘
 */

import React, { forwardRef, useEffect, useRef, useState, useCallback, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import MarkdownEditor from '../editor/MarkdownEditor';
import ChapterStatusBadge from './ChapterStatusBadge';
import ConfirmDialog from '../common/ConfirmDialog';
import { showNotification } from '../common/Notification';
import { useChapterStore } from '../../stores/chapterStore';
import type { Chapter } from '@novel/shared';

/**
 * 暴露给父组件的命令式 API。
 *
 * 父组件（WritingPage）需要这个 API 的原因：AI 流式生成完成时，整章正文是
 * 通过 stream-generate 在一次 `complete` 事件里送回 WritingPage 的；此时
 * store 的 chapter.content 已经被 `setCurrentChapterContent(content)` 写满，
 * 但**用户在生成前若手敲过任何字**，本组件内部的 `isDirty` 仍为 true，于是
 * "同章内 store 外部更新"分支会走"暂存到 pendingExternalContent"路径而非
 * 直接覆盖 localContent —— 也就是说作者在编辑器里仍然只看到自己先前写
 * 的几百字，完整的 AI 内容被吞到右下角一个不起眼的"采用新内容"小条。
 *
 * `acceptExternalContent` 是 AI 完成专用的强制覆盖路径：
 *   1) 直接把传入内容写进编辑器（localContent + contentRef）；
 *   2) 重置 isDirty，避免后续自动保存误把刚写入的全文作为"作者编辑"重写回服务；
 *   3) 同步推进 lastSyncedFromStoreRef，使 useEffect 后续不会再误判这是又一次
 *      "外部更新"并再次弹"采用新内容"对话框；
 *   4) 关闭可能存在的 pendingExternalContent 弹条。
 */
export interface ChapterEditorShellHandle {
  acceptExternalContent: (content: string, options?: { silent?: boolean; reason?: string }) => void;
}

export interface ChapterEditorShellProps {
  /** 当前章节（受控） */
  chapter: Chapter | null;
  /** 项目ID */
  projectId: string;
  /** 章节保存回调 */
  onSave?: (chapterId: string, content: string) => Promise<void>;
  /** 章节锁定回调 */
  onLock?: (chapterId: string) => Promise<void>;
  /** 作者明确选择“直接锁定”时的回调，不进入质检状态 */
  onDirectLock?: (chapterId: string) => Promise<void>;
  /** 将送审章节退回草稿 */
  onRejectReview?: (chapterId: string) => Promise<void>;
  /** 章节解锁回调 */
  onUnlock?: (chapterId: string) => Promise<void>;
  /** 生成下一章回调 */
  onGenerateNext?: () => void;
  /** AI续写回调 */
  onAiWrite?: () => void;
}

const AUTOSAVE_INTERVAL = 60000; // 60秒

const ChapterEditorShell = forwardRef<ChapterEditorShellHandle, ChapterEditorShellProps>(function ChapterEditorShell({
  chapter,
  projectId,
  onSave,
  onLock,
  onDirectLock,
  onRejectReview,
  onUnlock,
  onGenerateNext,
  onAiWrite,
}, ref) {
  const navigate = useNavigate();
  const { updateChapter, submitForReview } = useChapterStore();
  const [localContent, setLocalContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  // 「提交质检」/「直接锁定」/「驳回」等长任务的 in-place loading 状态（用户铁律：每个动作必须可见）
  const [busyAction, setBusyAction] = useState<string | null>(null);
  // 质检结果 banner：成功/失败/警告/错误都持续显示直到下一次动作
  type QcBanner = { tone: 'success' | 'error' | 'warning' | 'info'; message: string; at: number } | null;
  const [qcBanner, setQcBanner] = useState<QcBanner>(null);
  const wordCountRef = useRef<HTMLSpanElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentRef = useRef('');
  // 跟踪上次从 store 同步到编辑器的 content，用于判断本次 chapter.content 变化是
  // (a) store 外部主动更新（AI 生成完成、远端同步），还是 (b) 编辑器回写到 store 引起的。
  // 仅 (a) 需要刷新编辑器；只依赖 chapter?.id 会在同章内容变化时漏掉刷新。
  const lastSyncedFromStoreRef = useRef('');
  const prevChapterIdRef = useRef<string | null>(null);
  // 用户有未保存编辑时，外部 store 更新不会静默覆盖，而是先记到这里，UI 提示用户二选一。
  const [pendingExternalContent, setPendingExternalContent] = useState<string | null>(null);

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

  // 同步 store 章节内容到编辑器：
  // - 切换章节 → 强制覆盖，重置脏标记
  // - 同一章但 store.content 变化（且不是本编辑器回写造成）→ 外部更新；
  //   若用户没有未保存编辑则直接刷新；若有未保存编辑则暂存到 pendingExternalContent
  //   让用户主动选择「采用外部内容」或「保留我的编辑」。
  useEffect(() => {
    const nextId = chapter?.id || null;
    const nextContent = chapter?.content || '';

    if (nextId !== prevChapterIdRef.current) {
      // 章节切换（含首次进入）：直接覆盖
      prevChapterIdRef.current = nextId;
      lastSyncedFromStoreRef.current = nextContent;
      contentRef.current = nextContent;
      setLocalContent(nextContent);
      setIsDirty(false);
      setPendingExternalContent(null);
      return;
    }

    if (nextContent !== lastSyncedFromStoreRef.current) {
      // 同一章内 store 内容被外部更新
      lastSyncedFromStoreRef.current = nextContent;
      if (isDirty) {
        // 用户有未保存本地编辑，绝不静默覆盖
        setPendingExternalContent(nextContent);
      } else {
        contentRef.current = nextContent;
        setLocalContent(nextContent);
        setPendingExternalContent(null);
      }
    }
  }, [chapter?.id, chapter?.content]);

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

  // AI 生成完成专用的强制覆盖入口：详见 ChapterEditorShellHandle 注释。
  // 该方法绕过 "isDirty 时不静默覆盖" 的协作防丢原则，因为流式生成是
  // 作者在 UI 上主动点 "AI 生成" 触发的可信任来源，编辑器必须立即看到新内容，
  // 否则作者会误判"内容没变化"。
  const acceptExternalContent = useCallback(
    (content: string, options?: { silent?: boolean; reason?: string }) => {
      if (typeof content !== 'string') return;
      contentRef.current = content;
      setLocalContent(content);
      setIsDirty(false);
      lastSyncedFromStoreRef.current = content;
      setPendingExternalContent(null);
      if (!options?.silent) {
        const reason = options?.reason || '已应用最新章节正文';
        showNotification('info', reason, 2500);
      }
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({ acceptExternalContent }),
    [acceptExternalContent],
  );

  // 切换章节时如果有脏内容则保存
  useEffect(() => {
    return () => {
      if (isDirty && chapter) {
        handleSave();
      }
    };
  }, [chapter?.id]);

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
      // 写回 store 前先同步 lastSyncedFromStoreRef，避免 useEffect 把这次回写误判为
      // "外部更新" 而触发 pendingExternalContent 提示。
      lastSyncedFromStoreRef.current = content;
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
      showNotification('error', `保存失败：${err instanceof Error ? err.message : '请检查服务连接后重试'}`);
    }
  }, [chapter, updateChapter, onSave, projectId]);

  // 锁定
  const actionError = (error: unknown) => error instanceof Error ? error.message : '请检查服务连接后重试';

  const ensureCurrentContentSaved = useCallback(async () => {
    if (!chapter) return;
    const content = contentRef.current;
    await updateChapter(chapter.id, { content });
    if (onSave) await onSave(chapter.id, content);
    setIsDirty(false);
    setLastSaved(new Date());
  }, [chapter, updateChapter, onSave]);

  const handleSubmitForReview = useCallback(async () => {
    if (!chapter) return;
    if (busyAction) return; // 已在忙，禁止并发
    setBusyAction('submit-review');
    setQcBanner(null);
    const submitStartedAt = performance.now();
    try {
      await ensureCurrentContentSaved();
      await submitForReview(projectId, chapter.id);
      const elapsedMs = Math.max(0, Math.round(performance.now() - submitStartedAt));
      setQcBanner({
        tone: 'success',
        message: `已提交质检（第 ${chapter.volumeIndex}-${chapter.chapterIndex} 章）。用时 ${elapsedMs}ms。状态已变为「审核中」，下一步可点「通过质检·锁定」或等审核完成后系统通知。`,
        at: Date.now(),
      });
      showNotification('success', `已提交质检，用时 ${elapsedMs}ms`);
    } catch (error) {
      setQcBanner({
        tone: 'error',
        message: `提交质检失败：${actionError(error)}`,
        at: Date.now(),
      });
      showNotification('error', `未能提交质检：${actionError(error)}`);
    } finally {
      setBusyAction(null);
    }
  }, [chapter, busyAction, ensureCurrentContentSaved, submitForReview, projectId]);

  const handleLock = useCallback(async () => {
    if (!chapter) return;
    if (busyAction) return;
    setBusyAction(chapter.status === 'draft' ? 'direct-lock' : 'qa-lock');
    setQcBanner(null);
    try {
      await ensureCurrentContentSaved();
      if (chapter.status === 'draft') {
        if (!onDirectLock) throw new Error('直接锁定不可用');
        await onDirectLock(chapter.id);
        setQcBanner({ tone: 'success', message: `章节已直接锁定（第 ${chapter.volumeIndex}-${chapter.chapterIndex} 章）`, at: Date.now() });
        showNotification('success', '章节已直接锁定');
      } else {
        if (!onLock) throw new Error('质检锁定不可用');
        await onLock(chapter.id);
        setQcBanner({ tone: 'success', message: `章节已通过质检并锁定（第 ${chapter.volumeIndex}-${chapter.chapterIndex} 章）`, at: Date.now() });
        showNotification('success', '章节已通过质检并锁定');
      }
    } catch (err) {
      console.error('锁定失败:', err);
      setQcBanner({ tone: 'error', message: `无法锁定：${err instanceof Error ? err.message : '请先处理本章的同步或连续性问题'}`, at: Date.now() });
      showNotification('error', `无法锁定：${err instanceof Error ? err.message : '请先处理本章的同步或连续性问题'}`);
    } finally {
      setBusyAction(null);
    }
  }, [chapter, busyAction, ensureCurrentContentSaved, onLock, onDirectLock]);

  const handleRejectReview = useCallback(async () => {
    if (!chapter || !onRejectReview) return;
    if (busyAction) return;
    setBusyAction('reject-review');
    setQcBanner(null);
    try {
      await onRejectReview(chapter.id);
      setQcBanner({ tone: 'info', message: `已退回草稿，可继续修改正文（第 ${chapter.volumeIndex}-${chapter.chapterIndex} 章）`, at: Date.now() });
      showNotification('success', '已退回草稿，可继续修改正文');
    } catch (error) {
      setQcBanner({ tone: 'error', message: `无法退回草稿：${actionError(error)}`, at: Date.now() });
      showNotification('error', `无法退回草稿：${actionError(error)}`);
    } finally {
      setBusyAction(null);
    }
  }, [chapter, onRejectReview, busyAction]);

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
      showNotification('error', `无法解锁：${err instanceof Error ? err.message : '请稍后重试'}`);
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

      {/* 状态侧栏按钮 busy 时禁用 + 显示「⏳」；持续可见 banner 展示结果（用户铁律：动作必须可见） */}
      {qcBanner && (
        <div
          data-test="qc-banner"
          style={{
            margin: '0 16px',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background:
              qcBanner.tone === 'success' ? 'rgba(46,204,113,0.14)'
              : qcBanner.tone === 'error' ? 'rgba(231,76,60,0.16)'
              : qcBanner.tone === 'warning' ? 'rgba(243,156,18,0.14)'
              : 'rgba(52,152,219,0.16)',
            border:
              qcBanner.tone === 'success' ? '1px solid rgba(46,204,113,0.55)'
              : qcBanner.tone === 'error' ? '1px solid rgba(231,76,60,0.55)'
              : qcBanner.tone === 'warning' ? '1px solid rgba(243,156,18,0.55)'
              : '1px solid rgba(52,152,219,0.55)',
            color:
              qcBanner.tone === 'success' ? '#9bf2c3'
              : qcBanner.tone === 'error' ? '#ffd1d8'
              : qcBanner.tone === 'warning' ? '#ffd891'
              : '#bcd9ff',
          }}
        >
          <span style={{ fontSize: 16 }}>
            {qcBanner.tone === 'success' ? '✅' : qcBanner.tone === 'error' ? '⛔' : qcBanner.tone === 'warning' ? '⚠️' : 'ℹ️'}
          </span>
          <span style={{ flex: 1 }}>{qcBanner.message}</span>
          <button
            onClick={() => setQcBanner(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
            title="关闭"
            aria-label="关闭状态"
          >✕</button>
        </div>
      )}

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
                disabled={busyAction !== null}
                title={busyAction === 'qa-lock' ? '锁定中…' : '质检通过，锁定章节'}
              >
                {busyAction === 'qa-lock' ? '⏳ 锁定中…' : '✅ 通过质检 · 锁定'}
              </button>
              <button
                style={styles.unlockBtn}
                onClick={handleRejectReview}
                disabled={busyAction !== null}
                title={busyAction === 'reject-review' ? '驳回中…' : '驳回质检，返回草稿'}
              >
                {busyAction === 'reject-review' ? '⏳ 处理中…' : '↩️ 驳回 · 返回草稿'}
              </button>
            </>
          ) : (
            <>
              <button
                style={styles.lockBtn}
                onClick={handleSubmitForReview}
                disabled={busyAction !== null}
                title={busyAction === 'submit-review' ? '正在提交质检…' : '提交质检，进入审核流程'}
              >
                {busyAction === 'submit-review' ? '⏳ 提交中…' : '📋 提交质检'}
              </button>
              <button
                style={styles.lockBtn}
                onClick={handleLock}
                disabled={busyAction !== null}
                title={busyAction === 'direct-lock' ? '直接锁定中…' : '直接锁定章节（跳过质检）'}
              >
                {busyAction === 'direct-lock' ? '⏳ 锁定中…' : '🔒 直接锁定'}
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
        {pendingExternalContent && (
          <div style={styles.externalUpdateBar}>
            <span>检测到外部已更新本章正文（可能来自 AI 生成、远端同步或自动保存）。</span>
            <button
              style={styles.externalUpdateAccept}
              onClick={() => {
                contentRef.current = pendingExternalContent;
                setLocalContent(pendingExternalContent);
                setIsDirty(false);
                setPendingExternalContent(null);
                showNotification('info', '已采用最新章节正文');
              }}
            >采用新内容（覆盖我的编辑）</button>
            <button
              style={styles.externalUpdateKeep}
              onClick={() => {
                // 用户选择保留自己的编辑：把 store 端也回写成 localContent，避免下次再提示
                lastSyncedFromStoreRef.current = contentRef.current;
                setPendingExternalContent(null);
              }}
            >保留我的编辑</button>
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div style={styles.statusBar}>
        <span style={styles.statusItem}>
          字数: <strong>{wordCount(localContent).toLocaleString()}</strong>
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
});

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
  externalUpdateBar: {
    position: 'absolute',
    bottom: 36,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 14px',
    borderRadius: 8,
    backgroundColor: 'rgba(243, 156, 18, 0.18)',
    border: '1px solid rgba(243, 156, 18, 0.55)',
    color: '#ffd891',
    fontSize: 12,
    fontWeight: 600,
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
    zIndex: 50,
    maxWidth: '90%',
    flexWrap: 'wrap',
  },
  externalUpdateAccept: {
    border: '1px solid rgba(46, 204, 113, 0.6)',
    backgroundColor: 'rgba(46, 204, 113, 0.18)',
    color: '#8df0b2',
    padding: '5px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  externalUpdateKeep: {
    border: '1px solid rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: '#c0c0d0',
    padding: '5px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
  },
};

export default ChapterEditorShell;
