/**
 * MarkdownEditor - Monaco 编辑器封装
 * 配置为中文写作优化的 Markdown 编辑器
 * 支持受控/非受控模式
 * 实时版权检测：彩色状态指示器 + 内联波浪下划线 + 点击弹出详情 + 徽章计数
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { countNarrativeWords } from '../../lib/wordCount';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { COLORS, INFO_ALPHA, SCROLLBAR_ALPHA } from '../../styles/theme';

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
  // 小说正文是中文纯文本，不继承 vs-dark 的代码语法配色
  // （vs-dark 默认 string token 为砖红色 #ce9178，会把中文对话/标点误染成红色）
  inherit: false,
  rules: [
    { token: 'comment', foreground: '6c6c80', fontStyle: 'italic' },
    { token: 'string', foreground: 'eaeaea' },
    { token: 'number', foreground: 'eaeaea' },
    { token: 'keyword', foreground: 'eaeaea' },
    { token: 'type', foreground: 'eaeaea' },
    { token: 'heading', foreground: 'eaeaea', fontStyle: 'bold' },
    // 兜底：其余所有 token（含 markdown 的 string.quoted/emphasis 等）统一为正文白色
    { token: '', foreground: 'eaeaea' },
  ],
  colors: {
    // 注意：Monaco 自定义主题 colors 只认 #RRGGBB / #RRGGBBAA 十六进制，
    // 写 rgba(r,g,b,a) 会解析失败并回退成纯红 #ff0000（选中、滚动条、词高亮都会变红）。
    // 写 var(--color-xxx) 同样不被 Monaco 识别！必须用具体十六进制值。
    // 颜色值统一从 styles/theme.ts 的 COLORS / INFO_ALPHA / SCROLLBAR_ALPHA 引用，
    // 与平台 tokens.css 保持一致，禁止在此处硬编码散落的颜色值。
    'editor.background': COLORS.bg.primary,
    'editor.foreground': COLORS.text.primary,
    'editor.lineHighlightBackground': COLORS.bg.secondary,
    'editor.selectionBackground': INFO_ALPHA[35],
    'editorCursor.foreground': COLORS.info.light,
    'editorLineNumber.foreground': COLORS.text.muted,
    'editorLineNumber.activeForeground': COLORS.text.primary,
    'editor.inactiveSelectionBackground': INFO_ALPHA[18],
    'editor.selectionHighlightBackground': INFO_ALPHA[15],
    // 单词高亮系列必须显式定义，缺项同样会回退纯红
    'editor.wordHighlightBackground': INFO_ALPHA[15],
    'editor.wordHighlightStrongBackground': INFO_ALPHA[22],
    'editor.wordHighlightTextBackground': INFO_ALPHA[15],
    'editor.wordHighlightBorder': COLORS.transparent,
    'editor.wordHighlightStrongBorder': COLORS.transparent,
    'editor.wordHighlightTextBorder': COLORS.transparent,
    'editorOverviewRuler.wordHighlightForeground': INFO_ALPHA[50],
    'editorOverviewRuler.wordHighlightStrongForeground': INFO_ALPHA[60],
    'editorOverviewRuler.wordHighlightTextForeground': INFO_ALPHA[50],
    'editorOverviewRuler.selectionHighlightForeground': INFO_ALPHA[50],
    'editor.findMatchBackground': INFO_ALPHA[40],
    'editor.findMatchHighlightBackground': INFO_ALPHA[15],
    'editorBracketMatch.background': INFO_ALPHA[15],
    'editorBracketMatch.border': COLORS.info.primary,
    'scrollbarSlider.background': SCROLLBAR_ALPHA[30],
    'scrollbarSlider.hoverBackground': SCROLLBAR_ALPHA[50],
    'scrollbarSlider.activeBackground': SCROLLBAR_ALPHA[70],
  },
};

// 正文字数统一走 lib/wordCount（与后端 generatedNarrativeWordCount 同口径），禁止本地另算
const countWords = countNarrativeWords;

// 版权状态颜色映射
const STATUS_COLORS: Record<CopyrightStatus, { bg: string; fg: string; label: string }> = {
  clear: { bg: 'rgba(46,204,113,0.12)', fg: 'var(--color-success)', label: '版权安全' },
  warning: { bg: 'rgba(243,156,18,0.12)', fg: 'var(--color-warning)', label: '版权提醒' },
  violation: { bg: 'rgba(231,76,60,0.12)', fg: 'var(--color-danger)', label: '版权风险' },
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
  const [useNativeFallback, setUseNativeFallback] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyrightDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  // 用户最近一次本地编辑的时间戳（毫秒）。受控回写时若距此时间 < 1.5s，
  // 说明极可能是「用户输入 → store 内部 normalize → 受控 value 回调」造成的伪外部更新，
  // 此时跳过同步以避免光标跳末尾打断用户输入。
  const lastLocalEditTimeRef = useRef(0);

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

      // 应用内联装饰器（临时禁用，检测红色背景来源）
      // if (editorRef.current && monacoRef.current) {
      //   applyCopyrightDecorations(issues, text, monacoRef.current, editorRef.current);
      // }
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
    // 重新定义并应用主题，确保热更新后主题修改生效（beforeMount 只在首次挂载执行）
    monaco.editor.defineTheme(CUSTOM_THEME, themeDefinition);
    monaco.editor.setTheme(CUSTOM_THEME);
    editorRef.current = editor;
    monacoRef.current = monaco;
    // 只读模式下不聚焦、不显示光标；编辑模式才聚焦
    const editorDom = editor.getDomNode();
    if (readOnly) {
      if (editorDom) editorDom.classList.add('monaco-readonly');
    } else {
      editor.focus();
    }
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
  }, [realtimeCheck, copyrightIssues, readOnly]);

  const handleChange: OnChange = useCallback(
    (value: string | undefined, ev) => {
      const text = value || '';
      // 标记最近一次本地编辑时间（用于受控回写跳过来源判断）
      lastLocalEditTimeRef.current = Date.now();

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
    // Monaco may fail to load in a packaged/offline desktop runtime. The author
    // must still be able to read and edit the chapter instead of seeing an
    // indefinite loading indicator.
    const timer = window.setTimeout(() => {
      if (!editorRef.current) setUseNativeFallback(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, []);

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

  // 强制应用自定义主题，确保热更新后主题修改生效
  useEffect(() => {
    const applyTheme = () => {
      if (monacoRef.current && editorRef.current) {
        try {
          monacoRef.current.editor.defineTheme(CUSTOM_THEME, themeDefinition);
          monacoRef.current.editor.setTheme(CUSTOM_THEME);
        } catch {}
      }
    };
    // 立即尝试一次
    applyTheme();
    // 延迟再试一次，确保编辑器完全初始化后主题生效
    const timer = window.setTimeout(applyTheme, 100);
    return () => window.clearTimeout(timer);
  }, []);

  /**
   * 受控模式下的外部 value 同步：Monaco 每次拿到新 prop value 都会重置光标
   * 到末尾——这是用户反馈"任何操作导致光标跳到结尾位置"的根因。
   *
   * 这里在 setValue 前后手动保存并恢复 selection，让外部 store 更新
   * （如 AI 生成完成、远端同步、自动保存回写）不打断作者当前光标位置。
   * 仅在 editor.getValue() 与 controlledValue 真的不一致时才同步，避免与
   * 正在输入的 onChange 形成无限循环。
   *
   * 三道加固：
   *   1) 本地编辑锁：用户 1.5s 内输入（onChange 800ms 防抖 + 缓冲）跳过受控
   *      回写，避免「输入 → store 内部 normalize（trim/换行）→ 受控 value 回调」
   *      造成的伪外部更新打断用户光标；
   *   2) normalize 比较：尾部换行/前后空白差异不视为内容变化，跳过同步；
   *   3) offset 保存与还原：旧 selection 的 lineNumber/column 在新内容下越界
   *      率高（旧 selection 落在被 trim 的位置），改用 offset → setValue 后用
   *      model.getPositionAt(offset) 还原 position。
   */
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!isControlled) return;

    // 1) 本地编辑锁：跳过 1.5s 内的受控回写
    if (Date.now() - lastLocalEditTimeRef.current < 1500) return;

    const current = editor.getValue();
    const next = controlledValue ?? '';

    // 2) normalize 比较：仅尾部 ≤ 1 个换行/空白差异视为一致
    if (current === next) return;
    const currentTrimEnd = current.trimEnd();
    const nextTrimEnd = next.trimEnd();
    if (currentTrimEnd === nextTrimEnd && Math.abs(current.length - current.length) <= 2) return;
    if (currentTrimEnd === nextTrimEnd) return;

    // 3) 用 offset 保存 selections（旧 lineNumber/column 在新内容下越界率高）
    const selections = editor.getSelections();
    const model = editor.getModel();
    const savedOffsets = selections && model
      ? selections.map((sel) => ({
          startOffset: model.getOffsetAt(sel.getStartPosition()),
          endOffset: model.getOffsetAt(sel.getEndPosition()),
        }))
      : [];
    const scrollTop = editor.getScrollTop();

    editor.setValue(next);

    // setValue 后用 model.getPositionAt 还原（offset 在新内容下仍可能越界，需夹紧）
    if (savedOffsets.length > 0 && model) {
      const maxOffset = model.getValueLength();
      const restored = savedOffsets.map(({ startOffset, endOffset }) => {
        const safeStart = Math.max(0, Math.min(startOffset, maxOffset));
        const safeEnd = Math.max(safeStart, Math.min(endOffset, maxOffset));
        try {
          const startPos = model.getPositionAt(safeStart);
          const endPos = model.getPositionAt(safeEnd);
          return {
            startLineNumber: startPos.lineNumber,
            startColumn: startPos.column,
            endLineNumber: endPos.lineNumber,
            endColumn: endPos.column,
          };
        } catch {
          const lineCount = model.getLineCount();
          const lastCol = model.getLineMaxColumn(lineCount);
          return {
            startLineNumber: lineCount,
            startColumn: lastCol,
            endLineNumber: lineCount,
            endColumn: lastCol,
          };
        }
      });
      try {
        editor.setSelections(restored as any);
      } catch {
        const lineCount = model.getLineCount();
        editor.setPosition({ lineNumber: lineCount, column: 1 });
      }
    }
    editor.setScrollTop(scrollTop);
  }, [controlledValue, isControlled]);

  const statusColor = STATUS_COLORS[copyrightStatus];

  return (
    <div className={className} style={styles.container}>
      {useNativeFallback ? (
        <textarea
          aria-label="正文编辑器"
          value={displayValue}
          readOnly={readOnly}
          onChange={(event) => handleChange(event.target.value, undefined as any)}
          style={{
            flex: 1,
            width: '100%',
            minHeight: 0,
            resize: 'none',
            boxSizing: 'border-box',
            border: 'none',
            outline: 'none',
            padding: '16px 24px',
            backgroundColor: 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)',
            fontSize: '16px',
            lineHeight: '28px',
            fontFamily: 'var(--font-family)',
            whiteSpace: 'pre-wrap',
            overflow: 'auto',
          }}
        />
      ) : (
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
          lineHeight: 22,
          fontFamily: 'var(--font-family)',
          wordWrap: 'on',
          minimap: { enabled: false },
          readOnly,
          // 只读模式下隐藏光标，避免用户误以为可以编辑
          cursorStyle: readOnly ? 'line-thin' : 'line',
          cursorBlinking: readOnly ? 'solid' : 'smooth',
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderWhitespace: 'none',
          tabSize: 2,
          padding: { top: 16, bottom: 16 },
          smoothScrolling: true,
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
          // 小说写作不需要代码式的"相同词高亮"：光标停在词上时全文同词会被加背景，
          // 且缺色时回退成纯红。直接关闭这两类高亮。
          occurrencesHighlight: 'off',
          selectionHighlight: false,
          // 关闭 Unicode 字符高亮：Monaco 默认把中文全角标点（，。？！等）
          // 判定为"模糊/可疑 Unicode 字符"并加金黄色边框（cdr unicode-highlight），
          // 小说正文全是中文标点，这个功能纯属干扰，必须关闭。
          unicodeHighlight: {
            ambiguousCharacters: false,
            invisibleCharacters: false,
          },
        }}
        loading={
          <div style={styles.loading}>
            <p>编辑器加载中...</p>
          </div>
        }
      />
      )}
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
            fontSize: '14px',
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
              backgroundColor: copyrightStatus === 'violation' ? 'var(--color-danger)' : 'var(--color-warning)',
              color: 'var(--color-white)',
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
              fontSize: '14px',
              color: w.risk === 'high' ? 'var(--color-danger)' : 'var(--color-warning)',
              backgroundColor: w.risk === 'high' ? 'rgba(231,76,60,0.12)' : 'rgba(243,156,18,0.12)',
              padding: '4px 10px',
              borderRadius: '4px',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: w.risk === 'high' ? 'rgba(231,76,60,0.2)' : 'rgba(243,156,18,0.2)',
              maxWidth: '300px',
            }}>
              {w.risk === 'high' ? '🔴' : '⚠'} {w.message}
            </div>
          ))}
          {copyrightIssues.length > 3 && (
            <div style={{
              fontSize: '10px', color: 'var(--color-text-muted)', textAlign: 'center',
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
            backgroundColor: 'var(--color-bg-primary)',
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
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-danger)', marginBottom: '6px' }}>
            {popupIssue.risk === 'high' ? '🔴 高风险版权冲突' : '🟡 中风险版权提醒'}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--color-text-soft)', marginBottom: '4px', lineHeight: 1.6 }}>
            {popupIssue.message}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
            匹配作品: <span style={{ color: 'var(--color-text-primary)' }}>{popupIssue.matchedItem}</span>
            &nbsp;|&nbsp;相似度: <span style={{ color: 'var(--color-warning)' }}>{popupIssue.similarity}%</span>
          </div>
          <button
            style={{
              marginTop: '8px', padding: '4px 12px', fontSize: '14px',
              backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px', color: 'var(--color-text-dim)', cursor: 'pointer', fontFamily: 'inherit',
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
    backgroundColor: 'var(--color-bg-primary)',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--color-text-muted, var(--color-text-muted))',
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
    fontSize: '14px',
    color: 'var(--color-text-muted, var(--color-text-muted))',
    backgroundColor: 'rgba(26, 26, 46, 0.85)',
    padding: '2px 8px',
    borderRadius: '4px',
    fontFamily: 'var(--font-mono, monospace)',
  },
};

export default MarkdownEditor;
