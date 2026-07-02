/**
 * WorldPage - 世界观页面路由入口
 * 根据 project.type 动态渲染 WorldSimpleView（短篇）或 WorldTabView（长篇）
 *
 * 设计原则：
 * 1. 简洁明了 — 去掉冗余，一眼看懂
 * 2. 可视化操作 — 能看图操作的不要填表单
 * 3. 长短篇区分 — 短篇极简，长篇完整
 */
import React from 'react';
import { useProjectStore } from '../stores/projectStore';
import WorldSimpleView from '../components/world/WorldSimpleView';
import WorldTabView from '../components/world/WorldTabView';

const WorldPage: React.FC = () => {
  const { currentProject } = useProjectStore();

  // 根据项目类型动态渲染不同视图
  if (!currentProject) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        color: '#6c6c80',
        fontSize: '14px',
      }}>
        请先选择或创建一个项目
      </div>
    );
  }

  // 短篇：使用极简视图
  if (currentProject.type === 'short_story') {
    return <WorldSimpleView />;
  }

  // 长篇：使用完整 Tab 视图
  return <WorldTabView />;
};

export default WorldPage;
