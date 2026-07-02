/**
 * MarkdownPreview - Markdown 预览组件
 * 使用简单的自定义 Markdown 解析器将 markdown 转换为 HTML
 * 支持：标题(h1-h3)、粗体、斜体、分隔线、段落
 */

import React from 'react';

export interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

/**
 * 简易 Markdown 转 HTML 解析器
 * 支持：# ## ### 标题、**粗体**、*斜体*、--- 分隔线、段落
 */
function parseMarkdown(markdown: string): string {
  if (!markdown) return '';

  const lines = markdown.split('\n');
  const htmlLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 分隔线
    if (/^(---|\*\*\*|___)\s*$/.test(line.trim())) {
      htmlLines.push('<hr>');
      continue;
    }

    // 标题
    const h3Match = line.match(/^### (.+)/);
    if (h3Match) {
      htmlLines.push(`<h3>${processInlineMarkdown(h3Match[1])}</h3>`);
      continue;
    }

    const h2Match = line.match(/^## (.+)/);
    if (h2Match) {
      htmlLines.push(`<h2>${processInlineMarkdown(h2Match[1])}</h2>`);
      continue;
    }

    const h1Match = line.match(/^# (.+)/);
    if (h1Match) {
      htmlLines.push(`<h1>${processInlineMarkdown(h1Match[1])}</h1>`);
      continue;
    }

    // 空行 → 段落分隔（收集连续文本行作为一个段落）
    if (line.trim() === '') {
      continue;
    }

    // 收集段落（连续的非空非标题非分隔线行）
    const paragraphLines: string[] = [line];
    while (i + 1 < lines.length && lines[i + 1].trim() !== '' && !/^(#|>|-|\d+\.|\*|\*\*\*|---|___|```)/.test(lines[i + 1].trim())) {
      i++;
      paragraphLines.push(lines[i]);
    }

    htmlLines.push(`<p>${processInlineMarkdown(paragraphLines.join('\n'))}</p>`);
  }

  return htmlLines.join('\n');
}

/**
 * 处理内联 Markdown 语法：**粗体**、*斜体*、`代码`
 */
function processInlineMarkdown(text: string): string {
  // 粗体 **text** 或 __text__
  let result = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // 斜体 *text* 或 _text_
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/_(.+?)_/g, '<em>$1</em>');

  // 换行
  result = result.replace(/\n/g, '<br>');

  return result;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content, className }) => {
  const html = parseMarkdown(content);

  return (
    <div
      className={className}
      style={previewStyles.container}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

const previewStyles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    backgroundColor: 'var(--color-bg-primary, #1a1a2e)',
    color: 'var(--color-text-primary, #eaeaea)',
    fontFamily: 'var(--font-family, sans-serif)',
    fontSize: '16px',
    lineHeight: '1.8',
    overflowY: 'auto',
    maxHeight: '100%',
    wordWrap: 'break-word',
  },
};

export default MarkdownPreview;
