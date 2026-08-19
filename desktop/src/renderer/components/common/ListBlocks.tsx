import React from 'react';
import { splitToLines, parseJsonToReadable } from '../../lib/textList';

export const SectionHeading: React.FC<{ title: string; accent?: string; hint?: string }> = ({ title, accent = '#e94560', hint }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '14px 0 8px' }}>
    <span style={{ width: 3, alignSelf: 'stretch', backgroundColor: accent, borderRadius: 2 }} />
    <span style={{ fontSize: 14, fontWeight: 800, color: '#eaeaea', letterSpacing: 0.5 }}>{title}</span>
    {hint && <span style={{ fontSize: 14, color: '#8a8aa0' }}>{hint}</span>}
  </div>
);

export const FieldList: React.FC<{ label: string; value: unknown; accent?: string; empty?: string }> = ({
  label, value, accent = '#93c5fd', empty = '未填写',
}) => {
  // 通用JSON解析：处理纯JSON数组/对象、分号分隔多对象、内联JSON
  const displayValue = parseJsonToReadable(value);
  const items = splitToLines(displayValue);
  if (items.length === 0) {
    return (
      <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: accent, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 14, color: '#6c6c80' }}>{empty}</div>
      </div>
    );
  }
  // 段落识别：原始文本无换行符 且 拆分后<=3项，视为完整段落，直接展示原文不拆列表
  // 避免一句话被句号/分号强行拆成多行
  const rawText = String(displayValue || '');
  const hasNewline = /[\n\r]/.test(rawText);
  const isParagraph = !hasNewline && items.length <= 3;
  if (items.length <= 1 || isParagraph) {
    return (
      <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: accent, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 3, height: 12, backgroundColor: accent, borderRadius: 2 }} />
          {label}
        </div>
        <div style={{ fontSize: 14, color: '#c0c0d0', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{String(displayValue)}</div>
      </div>
    );
  }
  // 智能识别时间线格式：如果标签包含"时间线"或"历史"，或内容中包含"年"且按行分组
  const isTimeline = label.includes('时间线') || label.includes('历史') || label.includes('时代');
  if (isTimeline) {
    // 按年份拆分内容，支持年份在句子中间
    const raw = String(displayValue);
    // 用正则匹配所有年份（包括"2015年"、"2015"等格式）
    const yearRegex = /(\d{4}年?)/g;
    const matches: Array<{ year: string; index: number }> = [];
    let match;
    while ((match = yearRegex.exec(raw)) !== null) {
      matches.push({ year: match[1], index: match.index });
    }
    if (matches.length > 0) {
      const timelineItems: Array<{ year: string; contents: string[] }> = [];
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index + matches[i].year.length;
        const end = i < matches.length - 1 ? matches[i + 1].index : raw.length;
        let content = raw.slice(start, end).trim();
        // 去掉开头的标点符号
        content = content.replace(/^[，,。.；;：:\s]+/, '');
        // 按换行符拆分内容
        const contents = content.split(/\n+/).map(s => s.trim()).filter(Boolean);
        timelineItems.push({ year: matches[i].year, contents: contents.length > 0 ? contents : [''] });
      }
      if (timelineItems.length > 0) {
        return (
          <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: accent, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 3, height: 12, backgroundColor: accent, borderRadius: 2 }} />
              {label}
              <span style={{ fontSize: 14, color: '#6c6c80', fontWeight: 400 }}>{timelineItems.length}个时间节点</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {timelineItems.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flexShrink: 0, width: 60, fontSize: 14, fontWeight: 700, color: '#f59e0b', paddingTop: 1 }}>{item.year}</div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {item.contents.map((content, j) => (
                      <div key={j} style={{ fontSize: 14, color: '#c0c0d0', lineHeight: 1.6 }}>{content}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }
    }
  }
  // 检测列表项是否已有序号（①②③、1.、1.1、一、等）
  // 只要超过60%的项有序号，就认为已有序号，不再自动添加
  const numberedCount = items.filter(item => /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]/.test(item) || /^\d+(\.\d+)?[.、]/.test(item) || /^[一二三四五六七八九十]+[、.]/.test(item) || /^[（(]\d+[）)]/.test(item)).length;
  const hasExistingNumbering = numberedCount >= Math.ceil(items.length * 0.6);
  
  // 检测是否有层级结构（一级标题以"数字."开头且后面跟冒号，二级内容以"①②③"开头）
  const hasHierarchy = items.some(item => /^\d+(\.\d+)?[.、][^：:]*[：:]/.test(item)) && items.some(item => /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]/.test(item));
  
  // 检测是否是"标题：内容"格式（大部分项都包含冒号，且冒号前是标题）
  const titleContentCount = items.filter(item => /^[^：:]{1,20}[：:]/.test(item)).length;
  const hasTitleContent = titleContentCount >= Math.ceil(items.length * 0.6);
  
  return (
    <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: accent, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 3, height: 12, backgroundColor: accent, borderRadius: 2 }} />
        {label}
        <span style={{ fontSize: 14, color: '#6c6c80', fontWeight: 400 }}>{items.length}项</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((item, i) => {
          // 判断是否是一级标题（以"数字."开头且后面跟冒号）
          const isLevel1 = hasHierarchy && /^\d+[.、][^：:]*[：:]/.test(item);
          // 判断是否是二级内容（以"①②③"开头）
          const isLevel2 = hasHierarchy && /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]/.test(item);
          
          // 处理"标题：内容"格式
          let displayItem = item;
          if (hasTitleContent && !isLevel1 && !isLevel2) {
            const match = item.match(/^([^：:]{1,20})[：:](.*)$/);
            if (match) {
              const title = match[1];
              const content = match[2];
              return (
                <div key={i} style={{ display: 'flex', gap: 6, fontSize: 14, color: '#c0c0d0', lineHeight: 1.7 }}>
                  {!hasExistingNumbering && <span style={{ flexShrink: 0, color: accent, fontWeight: 600 }}>{i + 1}.</span>}
                  <span style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700, color: '#eaeaea' }}>{title}：</span>
                    <span>{content}</span>
                  </span>
                </div>
              );
            }
          }
          
          return (
            <div key={i} style={{ display: 'flex', gap: 6, fontSize: 14, color: isLevel1 ? '#eaeaea' : '#c0c0d0', lineHeight: 1.7, paddingLeft: isLevel2 ? 16 : 0, fontWeight: isLevel1 ? 700 : 400 }}>
              {!hasExistingNumbering && !isLevel1 && !isLevel2 && <span style={{ flexShrink: 0, color: accent, fontWeight: 600 }}>{i + 1}.</span>}
              <span style={{ flex: 1 }}>{displayItem}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ChipList: React.FC<{ items: string[]; color?: string; empty?: string }> = ({ items, color = '#60a5fa', empty = '暂无' }) => {
  if (!items.length) return <span style={{ fontSize: 14, color: '#6c6c80' }}>{empty}</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((item, i) => (
        <span key={i} style={{ padding: '4px 9px', borderRadius: 5, fontSize: 14, color, backgroundColor: `${color}1a`, border: `1px solid ${color}44` }}>{item}</span>
      ))}
    </div>
  );
};
