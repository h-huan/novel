import React from 'react';

export interface MarkdownPreviewProps {
  value: string;
  className?: string;
}

const safeHref = (href: string): string | undefined => {
  const trimmed = href.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  return undefined;
};

const inline = (text: string): React.ReactNode[] => {
  const result: React.ReactNode[] = [];
  const token = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(text))) {
    if (match.index > cursor) result.push(text.slice(cursor, match.index));
    const raw = match[0];
    if (raw.startsWith('**')) result.push(<strong key={`${match.index}-strong`}>{raw.slice(2, -2)}</strong>);
    else if (raw.startsWith('`')) result.push(<code key={`${match.index}-code`} style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 4 }}>{raw.slice(1, -1)}</code>);
    else if (raw.startsWith('[')) {
      const link = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link ? safeHref(link[2]) : undefined;
      result.push(href
        ? <a key={`${match.index}-link`} href={href} target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>{link![1]}</a>
        : <span key={`${match.index}-link-text`}>{link?.[1] ?? raw}</span>);
    } else result.push(<em key={`${match.index}-em`}>{raw.slice(1, -1)}</em>);
    cursor = match.index + raw.length;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
};

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ value, className }) => {
  const lines = String(value || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const fence = line.match(/^\s*```([^`]*)$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`} style={{ padding: 14, overflow: 'auto', borderRadius: 7, background: '#121225', border: '1px solid rgba(255,255,255,0.06)' }}><code>{code.join('\n')}</code></pre>);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      blocks.push(<Tag key={`h-${index}`} style={{ color: '#eaeaea', margin: '18px 0 8px' }}>{inline(heading[2])}</Tag>);
      index += 1;
      continue;
    }

    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} style={{ border: 0, borderTop: '1px solid rgba(255,255,255,0.1)', margin: '18px 0' }} />);
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={`q-${index}`} style={{ margin: '10px 0', padding: '4px 12px', borderLeft: '3px solid #6c6c80', color: '#aaaabd' }}>{inline(quote.join('\n'))}</blockquote>);
      continue;
    }

    const unordered = /^\s*[-*+]\s+/.test(line);
    const ordered = /^\s*\d+[.)]\s+/.test(line);
    if (unordered || ordered) {
      const items: string[] = [];
      const regex = unordered ? /^\s*[-*+]\s+/ : /^\s*\d+[.)]\s+/;
      while (index < lines.length && regex.test(lines[index])) items.push(lines[index++].replace(regex, ''));
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(<ListTag key={`list-${index}`} style={{ margin: '8px 0', paddingLeft: 24 }}>{items.map((item, itemIndex) => <li key={itemIndex} style={{ marginBottom: 4 }}>{inline(item)}</li>)}</ListTag>);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,6})\s+/.test(lines[index]) && !/^\s*```/.test(lines[index]) && !/^\s*>\s?/.test(lines[index]) && !/^\s*[-*+]\s+/.test(lines[index]) && !/^\s*\d+[.)]\s+/.test(lines[index])) {
      paragraph.push(lines[index++]);
    }
    blocks.push(<p key={`p-${index}`} style={{ margin: '8px 0', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{inline(paragraph.join('\n'))}</p>);
  }

  return (
    <article className={className} data-testid="markdown-preview" style={{ height: '100%', overflow: 'auto', padding: '20px 28px 52px', boxSizing: 'border-box', color: '#d4d4df', background: '#1a1a2e', fontSize: 16 }}>
      {blocks.length ? blocks : <span style={{ color: '#6c6c80' }}>暂无正文</span>}
    </article>
  );
};

export default MarkdownPreview;
