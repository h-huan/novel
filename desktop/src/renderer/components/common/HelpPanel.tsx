/**
 * HelpPanel - 快速参考面板
 * 点击 Header 中的 "?" 按钮打开
 */

import React from 'react';

const SECTIONS = [
  {
    title: '基本操作',
    items: [
      { key: 'Ctrl+S', desc: '保存当前章节' },
      { key: 'Ctrl+B', desc: '加粗选中文字' },
      { key: 'Ctrl+I', desc: '斜体选中文字' },
      { key: 'Tab', desc: '切换侧边栏 / 右侧面板焦点' },
    ],
  },
  {
    title: '写作模式',
    items: [
      { key: 'F1', desc: '全自动模式（AI 主导写作）' },
      { key: 'F2', desc: '半自动模式（AI 辅助建议）' },
      { key: 'F3', desc: '手动模式（完全手动写作）' },
    ],
  },
  {
    title: '界面切换',
    items: [
      { key: '侧栏收起', desc: '左下角按钮折叠侧边栏' },
    ],
  },
  {
    title: '版权检测',
    items: [
      { key: '绿色', desc: '版权安全，无冲突' },
      { key: '黄色', desc: '有中风险版权提醒' },
      { key: '红色', desc: '有高风险版权冲突' },
    ],
  },
];

interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
}

const HelpPanel: React.FC<HelpPanelProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)',
    }} onClick={onClose}>
      <div style={{
        width: '420px', maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto',
        backgroundColor: '#1a1a2e', borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#eaeaea', margin: 0 }}>
            快捷参考
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#6c6c80',
            cursor: 'pointer', fontSize: '16px', padding: '4px',
          }}>
            ✕
          </button>
        </div>

        {/* Sections */}
        <div style={{ padding: '12px 20px 16px' }}>
          {SECTIONS.map((section, si) => (
            <div key={si} style={{ marginBottom: '14px' }}>
              <div style={{
                fontSize: '11px', fontWeight: 600, color: '#8a8aa0',
                textTransform: 'uppercase', marginBottom: '6px',
              }}>
                {section.title}
              </div>
              {section.items.map((item, ii) => (
                <div key={ii} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '5px 8px', borderRadius: '4px',
                  backgroundColor: ii % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                }}>
                  <span style={{
                    display: 'inline-block', minWidth: '70px',
                    padding: '1px 8px', borderRadius: '4px',
                    backgroundColor: 'rgba(233,69,96,0.1)',
                    color: '#e94560', fontSize: '11px',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontWeight: 600, textAlign: 'center',
                  }}>
                    {item.key}
                  </span>
                  <span style={{ fontSize: '12px', color: '#c0c0d0' }}>
                    {item.desc}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HelpPanel;
