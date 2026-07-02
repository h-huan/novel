/**
 * EditorToolbar - 编辑器工具栏
 * 提供 Markdown 格式化按钮，点击后在光标位置插入对应语法
 */

import React from 'react';

export interface EditorToolbarProps {
  onInsert: (markdownSyntax: string) => void;
  className?: string;
}

interface ToolbarButton {
  label: string;
  title: string;
  syntax: string;
  icon: string;
}

const BUTTONS: ToolbarButton[] = [
  { label: 'B', title: '加粗 (Ctrl+B)', syntax: '****', icon: 'B' },
  { label: 'I', title: '斜体 (Ctrl+I)', syntax: '__', icon: 'I' },
  { label: 'H2', title: '二级标题', syntax: '## ', icon: 'H2' },
  { label: 'H3', title: '三级标题', syntax: '### ', icon: 'H3' },
  { label: '□-', title: '无序列表', syntax: '- ', icon: '□' },
  { label: '1.', title: '有序列表', syntax: '1. ', icon: '1' },
  { label: '---', title: '分隔线', syntax: '---\n', icon: '—' },
];

const styles = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '4px 8px',
    backgroundColor: 'var(--color-bg-secondary, #16213e)',
    borderBottom: '1px solid var(--color-border, #2a2a4a)',
  } as React.CSSProperties,
  button: {
    padding: '4px 10px',
    border: 'none',
    borderRadius: 'var(--radius-sm, 4px)',
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary, #a0a0b0)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background-color 0.15s, color 0.15s',
    lineHeight: '1',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
};

const EditorToolbar: React.FC<EditorToolbarProps> = ({ onInsert, className }) => {
  return (
    <div
      className={className}
      style={styles.toolbar}
      role="toolbar"
      aria-label="编辑器工具栏"
    >
      {BUTTONS.map((btn) => (
        <button
          key={btn.syntax}
          style={styles.button}
          title={btn.title}
          onClick={() => onInsert(btn.syntax)}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(233, 69, 96, 0.15)';
            e.currentTarget.style.color = 'var(--color-text-primary, #eaeaea)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--color-text-secondary, #a0a0b0)';
          }}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
};

export default EditorToolbar;
