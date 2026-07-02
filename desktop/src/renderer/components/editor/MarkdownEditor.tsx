/**
 * MarkdownEditor - Monaco 编辑器封装
 * 配置为中文写作优化的 Markdown 编辑器
 * 支持受控/非受控模式
 * 实时版权检测：彩色状态指示器 + 内联波浪下划线 + 点击弹出详情 + 徽章计数
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

export interface MarkdownEditorProps {
  /** 编辑内容（受控模式） */
  value?: string;
  /** 默认内容（非受控模式） */
  defaultValue?: string;
  /** 内容变更回调（800ms 防抖） */
  onChange?: (value: string) => void;
  /** 是否只读 */
  readOnly?: boolean;
  /** 当前字数（从外部传入或内部计算） */
  wordCount?: number;
  /** 编辑器容器 className */
  className?: string;
  /** 章节标题（用于版权检测） */
  chapterTitle?: string;
}

type CopyrightStatus = 'clear' | 'warning' | 'violation';

interface CopyrightIssue {
  message: string;
  risk: 'high' | 'medium' | 'low';
  matchedItem: string;
  similarity: number;
  /** 文本中出现的位置（起始索引，用于装饰器定位） */
  offset?: number;
  length?: number;
}

const CUSTOM_THEME = 'novel-dark';

const themeDefinition: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6c6c80', fontStyle: 'italic' },
    { token: 'string', foreground: 'e94560' },
    { token: 'number', foreground: 'f39c12' },
    { token: 'keyword', foreground: 'e94560' },
    { token: 'type', foreground: '2ecc71' },
    { token: 'heading', foreground: 'eaeaea', fontStyle: 'bold' },
  ],
  colors: {
    'editor.background': '#1a1a2e',
    'editor.foreground': '#eaeaea',
    'editor.lineHighlightBackground': '#16213e',
    'editor.selectionBackground': 'rgba(233,69,96,0.2)',
    'editorCursor.foreground': '#e94560',
    'editorLineNumber.foreground': '#6c6c80',
    'editorLineNumber.activeForeground': '#eaeaea',
    'editor.inactiveSelectionBackground': 'rgba(233,69,96,0.1)',
    'editor.selectionHighlightBackground': 'rgba(233,69,96,0.1)',
    'editor.wordHighlightBackground': 'rgba(233,69,96,0.1)',
    'editor.findMatchBackground': 'rgba(233,69,96,0.3)',
    'editor.findMatchHighlightBackground': 'rgba(233,69,96,0.1)',
    'editorBracketMatch.background': 'rgba(233,69,96,0.1)',
    'editorBracketMatch.border': '#e94560',
    'scrollbarSlider.background': 'rgba(108,108,128,0.3)',
    'scrollbarSlider.hoverBackground': 'rgba(108,108,128,0.5)',
    'scrollbarSlider.activeBackground': 'rgba(108,108,128,0.7)',
  },
};

function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const withoutChinese = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ');
  const englishWords = withoutChinese
    .split(/\s+/)
    .filter((w) => w.length > 0 && /[a-zA-Z]/.test(w)).length;
  return chineseChars + englishWords;
}

// 版权状态颜色映射
const STATUS_COLORS: Record<CopyrightStatus, { bg: string; fg: string; label: string }> = {
  clear: { bg: 'rgba(46,204,113,0.12)', fg: '#2ecc71', label: '版权安全' },
  warning: { bg: 'rgba(243,156,18,0.12)', fg: '#f39c12', label: '版权提醒' },
  violation: { bg: 'rgba(231,76,60,0.12)', fg: '#e74c3c', label: '版权风险' },
};

// 装饰器 className key
const COPYRIGHT_DECORATION_KEY = 'copyright-inline-deco';

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value: controlledValue,
  defaultValue,
  onChange,
  readOnly = false,
  wordCount: externalWordCount,
  className,
  chapterTitle,
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  const [localWordCount, setLocalWordCount] = useState(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyrightDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decorationIdsRef = useRef<string[]>([]);

  // 版权检测状态
  const [copyrightIssues, setCopyrightIssues] = useState<CopyrightIssue[]>([]);
  const [copyrightStatus, setCopyrightStatus] = useState<CopyrightStatus>('clear');
  const [popupIssue, setPopupIssue] = useState<CopyrightIssue | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);

  // 实时检测敏感词/错别字
  const sensitiveWords = ['妈的', '操你', '强奸', '卖淫', '贩毒', '屠杀', '裸体', '性交', '妓女', '虐杀', '分尸'];
  const realtimeCheck = useCallback((text: string, monaco: typeof import('monaco-editor'), editor: editor.IStandaloneCodeEditor) => {
    const model = editor.getModel();
    if (!model) return;

    const markers: editor.IMarkerData[] = [];
    for (const word of sensitiveWords) {
      let idx = 0;
      while ((idx = text.indexOf(word, idx)) !== -1) {
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message: `检测到敏感词: "${word}"`,
          startLineNumber: text.substring(0, idx).split('\n').length,
          endLineNumber: text.substring(0, idx).split('\n').length,
          startColumn: idx - text.substring(0, idx).lastIndexOf('\n') + 1,
          endColumn: idx - text.substring(0, idx).lastIndexOf('\n') + 1 + word.length,
        });
        idx += word.length;
      }
    }
    monaco.editor.setModelMarkers(model, 'realtime-check', markers);
  }, []);

  // 设置内联装饰器（红色波浪下划线）
  const applyCopyrightDecorations = useCallback((issues: CopyrightIssue[], text: string, monaco: typeof import('monaco-editor'), editor: editor.IStandaloneCodeEditor) => {
    const model = editor.getModel();
    if (!model) return;

    // 清除旧装饰器
    if (decorationIdsRef.current.length > 0) {
      editor.deltaDecorations(decorationIdsRef.current, []);
      decorationIdsRef.current = [];
    }

    if (issues.length === 0) return;

    const decorations: editor.IModelDeltaDecoration[] = [];

    for (const issue of issues) {
      const searchText = issue.matchedItem;
      let searchIdx = 0;
      let foundCount = 0;
      while ((searchIdx = text.indexOf(searchText, searchIdx)) !== -1 && foundCount < 20) {
        const beforeText = text.substring(0, searchIdx);
        const startLine = beforeText.split('\n').length;
        const lastNewline = beforeText.lastIndexOf('\n');
        const startCol = searchIdx - lastNewline;

        const endIdx = searchIdx + searchText.length;
        const beforeEndText = text.substring(0, endIdx);
        const endLine = beforeEndText.split('\n').length;
        const endLastNewline = beforeEndText.lastIndexOf('\n');
        const endCol = endIdx - endLastNewline;

        const isHighRisk = issue.risk === 'high';
        decorations.push({
          range: new monaco.Range(startLine, startCol, endLine, endCol || 1),
          options: {
            inlineClassName: isHighRisk ? 'copyright-inline-highlight' : 'copyright-inline-warning',
            hoverMessage: { value: `**${isHighRisk ? '高风险' : '中风险'} 版权问题**\n\n${issue.message}` },
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        });
        searchIdx = endIdx;
        foundCount++;
      }
    }

    decorationIdsRef.current = editor.deltaDecorations([], decorations);
  }, []);

  // L3: 实时版权提醒 - 防抖调用后端API
  const runCopyrightCheck = useCallback(async (text: string, title?: string) => {
    try {
      const { api } = await import('../../lib/api');
      const issues: CopyrightIssue[] = [];

      // 检查标题
      if (title) {
        const titleRes = await api.post('/refinement/copyright/check-title', { title });
        const titleData = titleRes.data as any;
        if (Array.isArray(titleData)) {
          for (const match of titleData) {
            if (match.risk === 'high' || match.risk === 'medium') {
              issues.push({
                message: `标题与《${match.matchedItem}》相似(${match.similarity}%)`,
                risk: match.risk,
                matchedItem: match.matchedItem,
                similarity: match.similarity,
              });
            }
          }
        }
      }

      // 检查文字内容中的角色名
      const characterRes = await api.post('/refinement/copyright/check-characters', {
        characterNames: extractCharacterNames(text),
      });
      const charData = characterRes.data as any;
      if (Array.isArray(charData)) {
        for (const match of charData) {
          if (match.risk === 'high' || match.risk === 'medium') {
            issues.push({
              message: `角色"${match.matchedItem}"与已知作品相似(${match.similarity}%)`,
              risk: match.risk,
              matchedItem: match.matchedItem,
              similarity: match.similarity,
            });
          }
        }
      }

      setCopyrightIssues(issues);

      // 更新状态
      const hasHigh = issues.some((i) => i.risk === 'high');
      const hasMedium = issues.some((i) => i.risk === 'medium');
      if (hasHigh) {
        setCopyrightStatus('violation');
      } else if (hasMedium) {
        setCopyrightStatus('warning');
      } else {
        setCopyrightStatus('clear');
      }

      // 应用内联装饰器
      if (editorRef.current && monacoRef.current) {
        applyCopyrightDecorations(issues, text, monacoRef.current, editorRef.current);
      }
    } catch {
      // 静默失败，不影响编辑体验
    }
  }, [applyCopyrightDecorations]);

  // 简易角色名提取：找2-4个汉字的名词
  function extractCharacterNames(text: string): string[] {
    const names = text.match(/[\u4e00-\u9fff]{2,4}/g) || [];
    // 去重并限制数量
    return [...new Set(names)].slice(0, 50);
  }

  const isControlled = controlledValue !== undefined;
  const displayValue = isControlled ? controlledValue : internalValue;
  const displayWordCount = externalWordCount !== undefined ? externalWordCount : localWordCount;

  const handleBeforeMount = useCallback((monaco: typeof import('monaco-editor')) => {
    monaco.editor.defineTheme(CUSTOM_THEME, themeDefinition);
  }, []);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.focus();
    const text = editor.getValue();
    setLocalWordCount(countWords(text));
    realtimeCheck(text, monaco, editor);

    // 监听鼠标点击 — 检查是否点击了版权装饰器区域
    editor.onMouseDown((e) => {
      if (copyrightIssues.length === 0) {
        setPopupIssue(null);
        setPopupPosition(null);
        return;
      }
      const target = e.target;
      const position = target.position;
      if (!position) {
        setPopupIssue(null);
        setPopupPosition(null);
        return;
      }
      const model = editor.getModel();
      if (!model) return;
      const clickedWord = model.getWordAtPosition(position);
      if (!clickedWord) {
        setPopupIssue(null);
        setPopupPosition(null);
        return;
      }
      // 查找匹配的版权问题
      const matchingIssue = copyrightIssues.find(
        (issue) => clickedWord && issue.matchedItem.includes(clickedWord.word) || clickedWord.word.includes(issue.matchedItem),
      );
      if (matchingIssue) {
        const editorDom = editor.getDomNode();
        if (editorDom) {
          const rect = editorDom.getBoundingClientRect();
          setPopupPosition({
            x: rect.left + 60,
            y: rect.top + 40,
          });
        }
        setPopupIssue(matchingIssue);
      } else {
        setPopupIssue(null);
        setPopupPosition(null);
      }
    });
  }, [realtimeCheck, copyrightIssues]);

  const handleChange: OnChange = useCallback(
    (value: string | undefined, ev) => {
      const text = value || '';

      if (externalWordCount === undefined) {
        setLocalWordCount(countWords(text));
      }

      if (!isControlled) {
        setInternalValue(text);
      }

      // 实时检测
      if (editorRef.current && monacoRef.current) {
        try {
          realtimeCheck(text, monacoRef.current, editorRef.current);
        } catch {}
      }

      if (onChange) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          onChange(text);
        }, 800);
      }

      // L3: 版权检测防抖调用（3秒）
      if (copyrightDebounceRef.current) {
        clearTimeout(copyrightDebounceRef.current);
      }
      copyrightDebounceRef.current = setTimeout(() => {
        runCopyrightCheck(text, chapterTitle);
      }, 3000);
    },
    [onChange, isControlled, externalWordCount, chapterTitle, runCopyrightCheck, realtimeCheck],
  );

  useEffect(() => {
    if (isControlled && externalWordCount === undefined && controlledValue !== undefined) {
      setLocalWordCount(countWords(controlledValue));
    }
  }, [controlledValue, isControlled, externalWordCount]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (copyrightDebounceRef.current) {
        clearTimeout(copyrightDebounceRef.current);
      }
    };
  }, []);

  const statusColor = STATUS_COLORS[copyrightStatus];

  return (
    <div className={className} style={styles.container}>
      <Editor
        height="100%"
        language="markdown"
        theme={CUSTOM_THEME}
        value={displayValue}
        defaultValue={defaultValue}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        options={{
          fontSize: 16,
          lineHeight: 28,
          fontFamily: 'var(--font-family)',
          wordWrap: 'on',
          minimap: { enabled: false },
          readOnly,
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          tabSize: 2,
          padding: { top: 16, bottom: 16 },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: false },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          renderLineHighlight: 'line',
          folding: true,
          foldingStrategy: 'indentation',
          contextmenu: true,
          quickSuggestions: false,
          suggestOnTriggerCharacters: false,
          acceptSuggestionOnEnter: 'off',
          tabCompletion: 'off',
          wordBasedSuggestions: 'off',
        }}
        loading={
          <div style={styles.loading}>
            <p>编辑器加载中...</p>
          </div>
        }
      />
      {/* 底部状态栏：字数 + 版权状态指示器 + 徽章 */}
      <div style={styles.statusBar}>
        {/* 版权状态指示器 */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor: statusColor.bg,
            color: statusColor.fg,
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: 'var(--font-mono, monospace)',
          }}
          title={`版权状态: ${statusColor.label} (${copyrightIssues.length} 项)`}
        >
          <span style={{
            display: 'inline-block',
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: statusColor.fg,
          }} />
          {statusColor.label}
          {/* 徽章计数 */}
          {copyrightIssues.length > 0 && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '16px',
              height: '16px',
              borderRadius: '8px',
              padding: '0 4px',
              backgroundColor: copyrightStatus === 'violation' ? '#e74c3c' : '#f39c12',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 700,
              lineHeight: '16px',
              marginLeft: '2px',
            }}>
              !
            </span>
          )}
        </div>

        <span style={styles.wordCountText}>
          {displayWordCount.toLocaleString()} 字
        </span>
      </div>

      {/* 版权警告（原有浮动通知保留） */}
      {copyrightIssues.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '36px',
          right: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          zIndex: 10,
          pointerEvents: 'none',
        }}>
          {copyrightIssues.slice(0, 3).map((w, i) => (
            <div key={i} style={{
              fontSize: '11px',
              color: w.risk === 'high' ? '#e74c3c' : '#f39c12',
              backgroundColor: w.risk === 'high' ? 'rgba(231,76,60,0.12)' : 'rgba(243,156,18,0.12)',
              padding: '4px 10px',
              borderRadius: '4px',
              border: '1px solid',
              borderColor: w.risk === 'high' ? 'rgba(231,76,60,0.2)' : 'rgba(243,156,18,0.2)',
              maxWidth: '300px',
            }}>
              {w.risk === 'high' ? '🔴' : '⚠'} {w.message}
            </div>
          ))}
          {copyrightIssues.length > 3 && (
            <div style={{
              fontSize: '10px', color: '#6c6c80', textAlign: 'center',
            }}>
              +{copyrightIssues.length - 3} 项更多
            </div>
          )}
        </div>
      )}

      {/* 点击版权文本弹出的详情 Popup */}
      {popupIssue && popupPosition && (
        <div
          style={{
            position: 'fixed',
            left: popupPosition.x,
            top: popupPosition.y,
            zIndex: 1000,
            backgroundColor: '#12122a',
            border: '1px solid rgba(231,76,60,0.3)',
            borderRadius: '8px',
            padding: '12px 14px',
            minWidth: '240px',
            maxWidth: '360px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            pointerEvents: 'auto',
          }}
          onClick={() => { setPopupIssue(null); setPopupPosition(null); }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#e74c3c', marginBottom: '6px' }}>
            {popupIssue.risk === 'high' ? '🔴 高风险版权冲突' : '🟡 中风险版权提醒'}
          </div>
          <div style={{ fontSize: '12px', color: '#c0c0d0', marginBottom: '4px', lineHeight: 1.6 }}>
            {popupIssue.message}
          </div>
          <div style={{ fontSize: '11px', color: '#6c6c80' }}>
            匹配作品: <span style={{ color: '#eaeaea' }}>{popupIssue.matchedItem}</span>
            &nbsp;|&nbsp;相似度: <span style={{ color: '#f39c12' }}>{popupIssue.similarity}%</span>
          </div>
          <button
            style={{
              marginTop: '8px', padding: '4px 12px', fontSize: '11px',
              backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px', color: '#8a8aa0', cursor: 'pointer', fontFamily: 'inherit',
            }}
            onClick={() => { setPopupIssue(null); setPopupPosition(null); }}
          >
            关闭
          </button>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#1a1a2e',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--color-text-muted, #6c6c80)',
    fontSize: '14px',
  },
  statusBar: {
    position: 'absolute',
    bottom: '8px',
    right: '16px',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  wordCountText: {
    fontSize: '12px',
    color: 'var(--color-text-muted, #6c6c80)',
    backgroundColor: 'rgba(26, 26, 46, 0.85)',
    padding: '2px 8px',
    borderRadius: '4px',
    fontFamily: 'var(--font-mono, monospace)',
  },
};

export default MarkdownEditor;
