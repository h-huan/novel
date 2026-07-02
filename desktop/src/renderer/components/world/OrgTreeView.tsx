/**
 * OrgTreeView - 组织树状导航组件
 * 左侧面板，显示组织层级树
 */
import React, { useState } from 'react';
import type { OrganizationTreeNode, OrganizationType } from '@novel/shared';

interface OrgTreeViewProps {
  tree: OrganizationTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
}

const TYPE_ICONS: Record<OrganizationType, string> = {
  regime: '🏛️',
  faction: '⚔️',
  army: '🪖',
  sect: '🏯',
  camp: '🤝',
  organization: '🏢',
  other: '📋',
};

const TYPE_LABELS: Record<OrganizationType, string> = {
  regime: '政权',
  faction: '势力',
  army: '军队',
  sect: '门派',
  camp: '阵营',
  organization: '组织',
  other: '其他',
};

const OrgTreeNode: React.FC<{
  node: OrganizationTreeNode;
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
        <button
          className={`w-4 h-4 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors ${
            hasChildren ? 'visible' : 'invisible'
          }`}
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          <span style={{ fontSize: '10px' }}>{expanded ? '▼' : '▶'}</span>
        </button>

        <span style={{ fontSize: '12px' }}>{TYPE_ICONS[node.type] || '📋'}</span>
        <span className="flex-1 text-xs truncate">{node.name}</span>

        {hasChildren && (
          <span className="text-text-muted text-xs px-1">{node.children.length}</span>
        )}

        <div className="hidden group-hover:flex items-center gap-1">
          <button
            className="w-4 h-4 flex items-center justify-center text-text-muted hover:text-accent transition-colors"
            onClick={(e) => { e.stopPropagation(); onCreateChild(node.id); }}
            title="添加子组织"
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

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <OrgTreeNode
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

const OrgTreeView: React.FC<OrgTreeViewProps> = ({
  tree, selectedId, onSelect, onCreateChild, onDelete,
}) => {
  return (
    <div className="h-full flex flex-col bg-bg-secondary border-r border-border">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-text-primary text-xs font-medium">组织层级</span>
        <span className="text-text-muted text-xs">{tree.length} 个根组织</span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
        {tree.length === 0 ? (
          <div className="text-center text-text-muted text-xs py-8">
            暂无组织数据
            <br />
            点击右上角"+"创建
          </div>
        ) : (
          tree.map((node) => (
            <OrgTreeNode
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

export default OrgTreeView;
