/**
 * MapTreeView - 地图树状导航组件
 * 左侧面板，显示地点层级树
 */
import React, { useState } from 'react';
import type { MapPointTreeNode, MapLevel } from '@novel/shared';

interface MapTreeViewProps {
  tree: MapPointTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
}

const LEVEL_ICONS: Record<MapLevel, string> = {
  world: '🌍',
  region: '🗺️',
  country: '🏛️',
  city: '🏙️',
  location: '📍',
  scene: '🎬',
};

const LEVEL_LABELS: Record<MapLevel, string> = {
  world: '世界',
  region: '区域',
  country: '国家',
  city: '城市',
  location: '地点',
  scene: '场景',
};

const TreeNode: React.FC<{
  node: MapPointTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
}> = ({ node, depth, selectedId, onSelect, onCreateChild, onDelete }) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-1 cursor-pointer rounded hover:bg-bg-hover transition-colors ${
          isSelected ? 'bg-accent/10 text-accent' : 'text-text-secondary'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(node.id)}
      >
        {/* 展开/折叠按钮 */}
        <button
          className={`w-4 h-4 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors ${
            hasChildren ? 'visible' : 'invisible'
          }`}
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          <span style={{ fontSize: '10px' }}>{expanded ? '▼' : '▶'}</span>
        </button>

        {/* 层级图标 */}
        <span style={{ fontSize: '12px' }}>{LEVEL_ICONS[node.level] || '📍'}</span>

        {/* 名称 */}
        <span className="flex-1 text-xs truncate">{node.name}</span>

        {/* 子节点数量 */}
        {hasChildren && (
          <span className="text-text-muted text-xs px-1">{node.children.length}</span>
        )}

        {/* 操作按钮（悬停显示） */}
        <div className="hidden group-hover:flex items-center gap-1">
          <button
            className="w-4 h-4 flex items-center justify-center text-text-muted hover:text-accent transition-colors"
            onClick={(e) => { e.stopPropagation(); onCreateChild(node.id); }}
            title="添加子节点"
          >
            <span style={{ fontSize: '10px' }}>+</span>
          </button>
          <button
            className="w-4 h-4 flex items-center justify-center text-text-muted hover:text-accent transition-colors"
            onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
            title="删除"
          >
            <span style={{ fontSize: '10px' }}>×</span>
          </button>
        </div>
      </div>

      {/* 子节点 */}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const MapTreeView: React.FC<MapTreeViewProps> = ({
  tree, selectedId, onSelect, onCreateChild, onDelete,
}) => {
  return (
    <div className="h-full flex flex-col bg-bg-secondary border-r border-border">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-text-primary text-xs font-medium">地点层级</span>
        <span className="text-text-muted text-xs">{tree.length} 个根节点</span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
        {tree.length === 0 ? (
          <div className="text-center text-text-muted text-xs py-8">
            暂无地点数据
            <br />
            点击右上角"+"创建
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default MapTreeView;
