/**
 * OnboardingModal - 新手引导弹窗
 * 4步引导：创建/选择项目 → 灵感发现 → 开始写作 → 导出作品
 * 首次启动时自动展示
 */

import React, { useState } from 'react';

const STEPS = [
  {
    title: '创建或选择项目',
    icon: '📁',
    description: '在首页点击"新建项目"创建小说，或点击已有卡片直接进入。每个项目独立管理章节、角色、世界观等数据。',
    detail: '不知道写什么？试试顶部的"灵感发现"，AI 帮你从多个角度生成故事题材。',
  },
  {
    title: '灵感发现',
    icon: '💡',
    description: '点击顶部"灵感发现"，选择故事类型、平台风格，AI 会自动挖掘多个不重复的题材供你挑选。',
    detail: '选中喜欢的题材后可直接创建完整项目，自动生成大纲、角色、世界观等种子内容。',
  },
  {
    title: '开始写作',
    icon: '✍️',
    description: '选择项目进入后，点击"写作"进入编辑器。左侧是章节列表，中央是编辑器区域，右侧是 AI 助手面板。',
    detail: '使用 Markdown 语法排版，支持加粗、标题、列表等。编辑器会自动保存你的内容。',
  },
  {
    title: '导出作品',
    icon: '📦',
    description: '完成写作后，可以通过"导出"功能将你的作品导出为 TXT 或 Markdown 格式。',
    detail: '导出时可以选择导出单章或整卷内容，方便后续发布或排版。',
  },
];

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

const OnboardingModal: React.FC<OnboardingModalProps> = ({ open, onClose }) => {
  const [stepIndex, setStepIndex] = useState(0);

  if (!open) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.65)',
    }}>
      <div style={{
        width: '440px', maxWidth: '90vw',
        backgroundColor: '#1a1a2e', borderRadius: '14px',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        {/* Progress dots */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '8px',
          padding: '16px 20px 0',
        }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === stepIndex ? '24px' : '8px',
              height: '8px',
              borderRadius: '4px',
              backgroundColor: i === stepIndex ? '#e94560' : 'rgba(255,255,255,0.12)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '24px 24px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>{step.icon}</div>
          <h2 style={{
            fontSize: '18px', fontWeight: 700, color: '#eaeaea',
            margin: '0 0 8px',
          }}>
            {step.title}
          </h2>
          <p style={{
            fontSize: '13px', color: '#c0c0d0', lineHeight: 1.7,
            margin: '0 0 8px',
          }}>
            {step.description}
          </p>
          <p style={{
            fontSize: '12px', color: '#6c6c80', lineHeight: 1.6,
            margin: 0,
          }}>
            {step.detail}
          </p>
        </div>

        {/* Navigation */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 20px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: '11px', color: '#6c6c80' }}>
            {stepIndex + 1} / {STEPS.length}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {stepIndex > 0 && (
              <button
                onClick={() => setStepIndex(stepIndex - 1)}
                style={{
                  padding: '8px 20px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)',
                  backgroundColor: 'transparent', color: '#8a8aa0', fontSize: '13px',
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                上一步
              </button>
            )}
            <button
              onClick={() => {
                if (isLast) {
                  onClose();
                } else {
                  setStepIndex(stepIndex + 1);
                }
              }}
              style={{
                padding: '8px 20px', borderRadius: '6px', border: 'none',
                backgroundColor: '#e94560', color: '#fff', fontSize: '13px',
                fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {isLast ? '开始使用' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
