/**
 * MapGraphView - 地图图谱可视化组件
 * 中央面板，使用 ReactFlow 展示地点关系图
 */
import React, { useMemo, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
} from 'reactflow';
import type { Node, Edge, NodeProps } from 'reactflow';
import type { MapPointTreeNode, MapLevel } from '@novel/shared';
import 'reactflow/dist/style.css';

const LEVEL_COLORS: Record<string, string> = {
  world: '#e94560',
  region: '#f39c12',
  country: '#2ecc71',
  city: '#3498db',
  location: '#9b59b6',
  scene: '#1abc9c',
};

const LEVEL_SIZES: Record<string, { width: number; height: number }> = {
  world: { width: 180, height: 60 },
  region: { width: 160, height: 50 },
  country: { width: 140, height: 45 },
  city: { width: 120, height: 40 },
  location: { width: 100, height: 36 },
  scene: { width: 90, height: 32 },
};

/** 自定义节点组件 */
const MapNode: React.FC<NodeProps> = ({ data, selected }) => {
  const mapPoint = data.mapPoint as any;
  const level = mapPoint?.level || 'location';
  const color = LEVEL_COLORS[level] || '#666';
  const size = LEVEL_SIZES[level] || LEVEL_SIZES.location;

  return (
    <div
      style={{
        width: size.width,
        height: size.height,
        padding: '8px 12px',
        borderRadius: level === 'world' ? '16px' : '8px',
        border: `2px solid ${selected ? color : color + '80'}`,
        backgroundColor: selected ? color + '20' : '#1a1a2e',
        color: '#eaeaea',
        fontSize: '12px',
        fontWeight: selected ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      <div>
        <div>{mapPoint?.name || '未命名'}</div>
        {mapPoint?.description && (
          <div style={{ fontSize: '10px', color: '#6c6c80', marginTop: '2px' }}>
            {mapPoint.description.slice(0, 20)}
          </div>
        )}
      </div>
    </div>
  );
};

const nodeTypes = { mapNode: MapNode };

interface MapGraphViewProps {
  tree: MapPointTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** 将树状结构转换为 ReactFlow 的 nodes 和 edges */
function treeToFlow(tree: MapPointTreeNode[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  function traverse(node: MapPointTreeNode, x: number, y: number, parentId?: string) {
    const size = LEVEL_SIZES[node.level] || LEVEL_SIZES.location;
    nodes.push({
      id: node.id,
      type: 'mapNode',
      position: { x, y },
      data: { mapPoint: node },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });

    if (parentId) {
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: 'smoothstep',
        animated: false,
        style: { stroke: LEVEL_COLORS[node.level] || '#666', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: LEVEL_COLORS[node.level] || '#666' },
      });
    }

    // 简单垂直布局
    if (node.children && node.children.length > 0) {
      const childCount = node.children.length;
      const startX = x - (childCount - 1) * 100;
      node.children.forEach((child, idx) => {
        traverse(child, startX + idx * 200, y + 100, node.id);
      });
    }
  }

  tree.forEach((root, idx) => {
    traverse(root, idx * 300, 0);
  });

  return { nodes, edges };
}

const MapGraphView: React.FC<MapGraphViewProps> = ({ tree, selectedId, onSelect }) => {
  const { nodes, edges } = useMemo(() => treeToFlow(tree), [tree]);

  const [flowNodes, setNodes, onNodesChange] = useNodesState(nodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(edges);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onSelect(node.id);
  }, [onSelect]);

  return (
    <div className="h-full bg-bg-primary">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
      >
        <Background color="#2a2a4a" gap={20} size={1} />
        <Controls
          style={{ bottom: 10, left: 10 }}
          showInteractive={false}
        />
        <MiniMap
          nodeColor={(node) => {
            const mp = (node.data as any)?.mapPoint;
            return mp ? LEVEL_COLORS[mp.level] || '#666' : '#666';
          }}
          style={{ bottom: 10, right: 10, width: 120, height: 80 }}
        />
      </ReactFlow>
    </div>
  );
};

export default MapGraphView;
