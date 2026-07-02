/**
 * PromptChainPage - Prompt Chain 可视化编辑器
 *
 * 使用 React Flow 构建拖拽式 Chain 编辑器：
 * - 左侧节点面板（拖拽）
 * - 中间画布（React Flow）
 * - 右侧属性面板（选中节点编辑）
 * - 顶部工具栏（保存/加载/运行/导入/导出）
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { api } from '../lib/api';

// ============================================================
// Types
// ============================================================

type ChainNodeType = 'prompt' | 'condition' | 'parallel' | 'loop' | 'transform';

interface ChainNodeData {
  label: string;
  nodeType: ChainNodeType;
  templateId?: string;
  modelConfig?: string;
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;
  conditionExpression?: string;
  branches?: { condition: string; target: string }[];
  maxIterations?: number;
  exitCondition?: string;
  qualityGate?: any;
  description?: string;
}

interface ChainTemplateSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  nodes: number;
  executionMode: string;
  createdAt: string;
  updatedAt: string;
}

interface SavedChain {
  id: string;
  name: string;
  version: string;
  description: string;
  nodes: any[];
  executionMode: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Constants
// ============================================================

const NODE_PALETTE_ITEMS: { type: ChainNodeType; label: string; color: string; icon: string }[] = [
  { type: 'prompt', label: 'Prompt 节点', color: '#6366f1', icon: '📝' },
  { type: 'condition', label: '条件节点', color: '#f59e0b', icon: '🔀' },
  { type: 'parallel', label: '并行节点', color: '#10b981', icon: '⚡' },
  { type: 'loop', label: '循环节点', color: '#ec4899', icon: '🔄' },
  { type: 'transform', label: '转换节点', color: '#8b5cf6', icon: '🔧' },
];

const NODE_COLORS: Record<ChainNodeType, string> = {
  prompt: '#6366f1',
  condition: '#f59e0b',
  parallel: '#10b981',
  loop: '#ec4899',
  transform: '#8b5cf6',
};

const CHAIN_DEFAULTS: Record<ChainNodeType, Partial<ChainNodeData>> = {
  prompt: { templateId: '', modelConfig: '{"primary":"claude","temperature":0.7,"tier":"balanced"}', inputMapping: {}, outputMapping: {} },
  condition: { conditionExpression: 'true', branches: [] },
  parallel: { description: '并行分支' },
  loop: { maxIterations: 3, exitCondition: '' },
  transform: { inputMapping: {}, outputMapping: {} },
};

// ============================================================
// Custom Nodes
// ============================================================

const ChainNodeComponent: React.FC<NodeProps<ChainNodeData>> = ({ data, selected }) => {
  const color = NODE_COLORS[data.nodeType] || '#6366f1';
  const icons: Record<string, string> = { prompt: '📝', condition: '🔀', parallel: '⚡', loop: '🔄', transform: '🔧' };

  const statusDot = selected ? '🟢' : '⚪';

  return (
    <div style={{
      background: 'rgba(20,20,30,0.95)',
      border: `2px solid ${selected ? color : 'rgba(255,255,255,0.15)'}`,
      borderRadius: '12px',
      padding: '12px 16px',
      minWidth: 180,
      boxShadow: selected ? `0 0 20px ${color}44` : '0 4px 12px rgba(0,0,0,0.3)',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      position: 'relative',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: color, width: 10, height: 10, border: '2px solid #1a1a2e' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: color, width: 10, height: 10, border: '2px solid #1a1a2e' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>{icons[data.nodeType] || '📦'}</span>
        <span style={{ fontSize: 10, padding: '2px 6px', background: `${color}22`, borderRadius: 4, color }}>{data.nodeType.toUpperCase()}</span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: '#eaeaea', marginBottom: 4 }}>{data.label}</div>

      {data.templateId && (
        <div style={{ fontSize: 10, color: '#8a8aa0', marginBottom: 2 }}>模板: {data.templateId}</div>
      )}
      {data.conditionExpression && (
        <div style={{ fontSize: 10, color: '#f59e0b' }}>条件: {data.conditionExpression}</div>
      )}
      {data.maxIterations && (
        <div style={{ fontSize: 10, color: '#ec4899' }}>最大迭代: {data.maxIterations}</div>
      )}

      <div style={{ position: 'absolute', top: 8, right: 10, fontSize: 10 }}>{statusDot}</div>
    </div>
  );
};

const nodeTypes: NodeTypes = { chainNode: ChainNodeComponent };

// ============================================================
// Helper: Generate unique node ID
// ============================================================

let nodeCounter = 100;
function genNodeId(type: ChainNodeType): string {
  nodeCounter++;
  return `node_${nodeCounter}_${type}`;
}

// ============================================================
// Side Panel (Node Palette)
// ============================================================

const SidePanel: React.FC = () => {
  const onDragStart = (event: React.DragEvent, nodeType: ChainNodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div style={{
      width: 240,
      background: 'rgba(16,16,26,0.95)',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      flexShrink: 0,
      height: '100%',
      overflow: 'auto',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#8a8aa0', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>节点面板</div>
      <div style={{ fontSize: 10, color: '#6c6c80', marginBottom: 8 }}>拖拽节点到画布</div>

      {NODE_PALETTE_ITEMS.map(item => (
        <div
          key={item.type}
          draggable
          onDragStart={(e) => onDragStart(e, item.type)}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid rgba(255,255,255,0.06)`,
            borderRadius: 8,
            padding: '10px 12px',
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
        >
          <span style={{ fontSize: 16 }}>{item.icon}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#eaeaea' }}>{item.label}</div>
            <div style={{ fontSize: 10, color: item.color }}>{item.type}</div>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 'auto', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 10, color: '#6c6c80', lineHeight: 1.6 }}>
          快捷键:<br />
          Delete = 删除选中节点/连线<br />
          Ctrl+S = 保存<br />
          Ctrl+Z = 撤销
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Properties Panel
// ============================================================

const PropertiesPanel: React.FC<{
  node: Node<ChainNodeData> | null;
  onUpdate: (id: string, data: Partial<ChainNodeData>) => void;
  templates: { id: string; name: string }[];
}> = ({ node, onUpdate, templates }) => {
  if (!node) {
    return (
      <div style={{
        width: 340,
        background: 'rgba(16,16,26,0.95)',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        padding: 24,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6c6c80',
      }}>
        <span style={{ fontSize: 32, marginBottom: 12 }}>👈</span>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>选择一个节点</div>
        <div style={{ fontSize: 11 }}>点击画布中的节点查看属性</div>
      </div>
    );
  }

  const data = node.data;
  const color = NODE_COLORS[data.nodeType] || '#6366f1';
  const icons: Record<string, string> = { prompt: '📝', condition: '🔀', parallel: '⚡', loop: '🔄', transform: '🔧' };

  const setLabel = (val: string) => onUpdate(node.id, { label: val });
  const setTemplate = (val: string) => onUpdate(node.id, { templateId: val });
  const setCondition = (val: string) => onUpdate(node.id, { conditionExpression: val });
  const setMaxIter = (val: number) => onUpdate(node.id, { maxIterations: val });
  const setExitCond = (val: string) => onUpdate(node.id, { exitCondition: val });
  const setDescription = (val: string) => onUpdate(node.id, { description: val });

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#eaeaea',
    fontSize: 12,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#8a8aa0',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  };

  return (
    <div style={{
      width: 340,
      background: 'rgba(16,16,26,0.95)',
      borderLeft: '1px solid rgba(255,255,255,0.06)',
      padding: 16,
      flexShrink: 0,
      height: '100%',
      overflow: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>{icons[data.nodeType] || '📦'}</span>
        <div>
          <div style={{ fontSize: 11, color, fontWeight: 600 }}>{data.nodeType.toUpperCase()}</div>
          <div style={{ fontSize: 13, color: '#eaeaea', fontWeight: 700 }}>{data.label || '未命名节点'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 名称 */}
        <div>
          <div style={labelStyle}>节点名称</div>
          <input style={inputStyle} value={data.label} onChange={e => setLabel(e.target.value)} placeholder="输入节点名称" />
        </div>

        {/* 描述 */}
        <div>
          <div style={labelStyle}>描述</div>
          <textarea
            style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }}
            value={data.description || ''}
            onChange={e => setDescription(e.target.value)}
            placeholder="节点功能描述"
          />
        </div>

        {/* Prompt 节点特有配置 */}
        {data.nodeType === 'prompt' && (
          <>
            <div>
              <div style={labelStyle}>Prompt 模板</div>
              <select
                style={inputStyle}
                value={data.templateId || ''}
                onChange={e => setTemplate(e.target.value)}
              >
                <option value="">-- 选择模板 --</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Condition 节点特有配置 */}
        {data.nodeType === 'condition' && (
          <>
            <div>
              <div style={labelStyle}>条件表达式</div>
              <input style={inputStyle} value={data.conditionExpression || ''} onChange={e => setCondition(e.target.value)} placeholder="如: output.score > 0.8" />
            </div>
            <div>
              <div style={labelStyle}>分支目标</div>
              <div style={{ fontSize: 10, color: '#6c6c80' }}>通过连线连接目标和条件分支</div>
            </div>
          </>
        )}

        {/* Loop 节点特有配置 */}
        {data.nodeType === 'loop' && (
          <>
            <div>
              <div style={labelStyle}>最大迭代次数</div>
              <input
                style={inputStyle}
                type="number"
                min={1}
                max={100}
                value={data.maxIterations || 3}
                onChange={e => setMaxIter(parseInt(e.target.value) || 3)}
              />
            </div>
            <div>
              <div style={labelStyle}>退出条件</div>
              <input style={inputStyle} value={data.exitCondition || ''} onChange={e => setExitCond(e.target.value)} placeholder="如: output.quality > 0.9" />
            </div>
          </>
        )}

        {/* 节点 ID */}
        <div>
          <div style={labelStyle}>节点 ID</div>
          <div style={{ fontSize: 11, color: '#6c6c80', padding: '6px 0' }}>{node.id}</div>
        </div>

      </div>
    </div>
  );
};

// ============================================================
// Main Editor Component
// ============================================================

const ChainEditor: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<ChainNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node<ChainNodeData> | null>(null);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [chainName, setChainName] = useState('新的 Prompt Chain');
  const [chainDescription, setChainDescription] = useState('');
  const [savedChains, setSavedChains] = useState<ChainTemplateSummary[]>([]);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const reactFlowInstance = useReactFlow();

  // Load templates on mount
  useEffect(() => {
    api.get('/chain/templates').then(res => {
      const data = res as any;
      if (data.success && data.templates) {
        setTemplates(data.templates.map((t: any) => ({ id: t.id, name: t.name })));
        setSavedChains(data.templates);
      }
    }).catch(() => {});
  }, []);

  // Show toast helper
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Handle new connection
  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({
      ...connection,
      animated: true,
      style: { stroke: '#6366f1', strokeWidth: 2 },
      label: 'success',
      labelStyle: { fill: '#8a8aa0', fontSize: 10 },
    }, eds));
  }, [setEdges]);

  // Handle drop
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow') as ChainNodeType;
    if (!type || !reactFlowWrapper.current) return;

    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const newNode: Node<ChainNodeData> = {
      id: genNodeId(type),
      type: 'chainNode',
      position,
      data: {
        label: NODE_PALETTE_ITEMS.find(i => i.type === type)?.label || type,
        nodeType: type,
        ...CHAIN_DEFAULTS[type],
      },
    };

    setNodes(nds => nds.concat(newNode));
  }, [screenToFlowPosition, setNodes]);

  // Handle node selection
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<ChainNodeData>) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Update node data
  const updateNodeData = useCallback((id: string, newData: Partial<ChainNodeData>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...newData } } : n));
    setSelectedNode(prev => prev && prev.id === id ? { ...prev, data: { ...prev.data, ...newData } } : prev);
  }, [setNodes]);

  // Build chain JSON from current nodes + edges
  const buildChainData = useCallback(() => {
    const chainNodes = nodes.map(n => {
      const base: any = {
        id: n.id,
        name: n.data.label,
        type: n.data.nodeType,
        chainId: '',
        modelConfig: n.data.modelConfig ? JSON.parse(typeof n.data.modelConfig === 'string' ? n.data.modelConfig : '{"primary":"claude","temperature":0.7,"tier":"balanced"}') : { primary: 'claude', temperature: 0.7, tier: 'balanced' },
        inputMapping: n.data.inputMapping || {},
        outputMapping: n.data.outputMapping || {},
        timeout: 60,
        retryCount: 0,
      };

      if (n.data.nodeType === 'prompt') {
        base.promptTemplateId = n.data.templateId;
      }
      if (n.data.nodeType === 'condition') {
        base.branches = n.data.branches || [];
      }

      // Find outgoing edges
      const outgoing = edges.filter(e => e.source === n.id);
      if (outgoing.length > 0) {
        base.nextOnSuccess = outgoing.map(e => e.target);
      }

      return base;
    });

    return {
      name: chainName,
      description: chainDescription,
      nodes: chainNodes,
      executionMode: 'sequential',
      config: { timeout: 300, maxRetries: 1, enableLogging: true, enableQualityGate: false, strictMode: false },
    };
  }, [nodes, edges, chainName, chainDescription]);

  // Save chain
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const chainData = buildChainData();
      const res = await api.post('/chain/templates/save', chainData);
      const data = res as any;
      if (data.success) {
        showToast('Chain 已保存', 'success');
        // Refresh saved chains
        const listRes = await api.get('/chain/templates');
        const listData = listRes.data as any;
        if (listData.success) setSavedChains(listData.templates);
      } else {
        showToast(data.error || '保存失败', 'error');
      }
    } catch (err) {
      showToast('保存失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error');
    }
    setIsSaving(false);
  }, [buildChainData, showToast]);

  // Load chain
  const handleLoadChain = useCallback(async (id: string) => {
    try {
      const res = await api.get(`/chain/templates/${id}`);
      const data = res as any;
      if (data.success && data.template) {
        const tmpl = data.template as SavedChain;
        setChainName(tmpl.name);
        setChainDescription(tmpl.description);

        // Convert saved nodes to flow nodes
        const flowNodes: Node<ChainNodeData>[] = tmpl.nodes.map((n: any, i: number) => ({
          id: n.id || `node_${i}`,
          type: 'chainNode',
          position: { x: 250, y: i * 150 + 50 },
          data: {
            label: n.name || n.type,
            nodeType: n.type as ChainNodeType,
            templateId: n.promptTemplateId,
            modelConfig: JSON.stringify(n.modelConfig || {}),
            inputMapping: n.inputMapping || {},
            outputMapping: n.outputMapping || {},
            conditionExpression: n.type === 'condition' ? n.branches?.[0]?.condition : undefined,
            branches: n.branches,
            description: n.description,
          },
        }));

        // Convert connections to edges
        const flowEdges: Edge[] = [];
        tmpl.nodes.forEach((n: any) => {
          if (n.nextOnSuccess) {
            n.nextOnSuccess.forEach((targetId: string) => {
              flowEdges.push({
                id: `e-${n.id}-${targetId}`,
                source: n.id,
                target: targetId,
                animated: true,
                style: { stroke: '#6366f1', strokeWidth: 2 },
                label: 'success',
                labelStyle: { fill: '#8a8aa0', fontSize: 10 },
              });
            });
          }
        });

        setNodes(flowNodes);
        setEdges(flowEdges);
        setShowLoadDialog(false);
        showToast(`已加载: ${tmpl.name}`, 'success');
      }
    } catch (err) {
      showToast('加载失败', 'error');
    }
  }, [setNodes, setEdges, showToast]);

  // Run test
  const handleRunTest = useCallback(async () => {
    setIsRunning(true);
    try {
      const chainData = buildChainData();
      // Save temporarily then execute
      const saveRes = await api.post('/chain/templates/save', { ...chainData, id: 'temp-test-chain' });
      const saveData = saveRes.data as any;
      if (saveData.success) {
        const execRes = await api.post(`/chain/templates/execute/${saveData.template.id}`, { testData: { material: '测试数据', platform: 'zhihu' } });
        const execData = execRes.data as any;
        if (execData.success) {
          showToast(`执行完成，状态: ${execData.result?.status || 'completed'}`, 'success');
        } else {
          showToast('执行失败: ' + (execData.error || '未知错误'), 'error');
        }
      }
    } catch (err) {
      showToast('运行测试失败', 'error');
    }
    setIsRunning(false);
  }, [buildChainData, showToast]);

  // Export JSON
  const handleExport = useCallback(() => {
    const chainData = buildChainData();
    const json = JSON.stringify(chainData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chainName.replace(/\s+/g, '_')}.chain.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出 JSON', 'success');
  }, [buildChainData, chainName, showToast]);

  // Import JSON
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        setChainName(data.name || '导入的 Chain');
        setChainDescription(data.description || '');

        const flowNodes: Node<ChainNodeData>[] = (data.nodes || []).map((n: any, i: number) => ({
          id: n.id || `imported_${i}`,
          type: 'chainNode',
          position: { x: 250, y: i * 150 + 50 },
          data: {
            label: n.name || n.type,
            nodeType: n.type as ChainNodeType,
            templateId: n.promptTemplateId,
            modelConfig: JSON.stringify(n.modelConfig || {}),
            inputMapping: n.inputMapping || {},
            outputMapping: n.outputMapping || {},
            conditionExpression: n.type === 'condition' ? n.branches?.[0]?.condition : undefined,
            branches: n.branches,
            description: n.description,
          },
        }));

        const flowEdges: Edge[] = [];
        (data.nodes || []).forEach((n: any) => {
          if (n.nextOnSuccess) {
            n.nextOnSuccess.forEach((targetId: string) => {
              flowEdges.push({
                id: `e-${n.id}-${targetId}`,
                source: n.id,
                target: targetId,
                animated: true,
                style: { stroke: '#6366f1', strokeWidth: 2 },
                label: 'success',
                labelStyle: { fill: '#8a8aa0', fontSize: 10 },
              });
            });
          }
        });

        setNodes(flowNodes);
        setEdges(flowEdges);
        showToast('已导入 ' + file.name, 'success');
      } catch {
        showToast('导入失败: JSON 格式无效', 'error');
      }
    };
    input.click();
  }, [setNodes, setEdges, showToast]);

  // Clear canvas
  const handleNew = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setChainName('新的 Prompt Chain');
    setChainDescription('');
    setShowNewDialog(false);
    showToast('已创建新 Chain', 'info');
  }, [setNodes, setEdges, showToast]);

  // Delete selected
  const onNodesDelete = useCallback((deleted: Node[]) => {
    setSelectedNode(prev => (deleted.find(n => n.id === prev?.id) ? null : prev));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  // Toast rendering
  const toastEl = toast && (
    <div style={{
      position: 'fixed',
      top: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      padding: '10px 24px',
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
      background: toast.type === 'success' ? 'rgba(16,185,129,0.9)' : toast.type === 'error' ? 'rgba(239,68,68,0.9)' : 'rgba(99,102,241,0.9)',
      color: '#fff',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      pointerEvents: 'none',
    }}>
      {toast.message}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {toastEl}

      {/* ===== Toolbar ===== */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        background: 'rgba(16,16,26,0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <button onClick={() => setShowNewDialog(true)}
          style={toolBtnStyle}>📄 新建</button>
        <button onClick={handleSave} disabled={isSaving}
          style={{ ...toolBtnStyle, opacity: isSaving ? 0.5 : 1 }}>💾 {isSaving ? '保存中...' : '保存'}</button>
        <button onClick={() => setShowLoadDialog(true)}
          style={toolBtnStyle}>📂 加载</button>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        <button onClick={handleRunTest} disabled={isRunning}
          style={{ ...toolBtnStyle, opacity: isRunning ? 0.5 : 1 }}>▶ {isRunning ? '运行中...' : '运行测试'}</button>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        <button onClick={handleExport} style={toolBtnStyle}>📤 导出 JSON</button>
        <button onClick={handleImport} style={toolBtnStyle}>📥 导入 JSON</button>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#eaeaea' }}>{chainName}</span>
        <span style={{ fontSize: 10, color: '#6c6c80' }}>{nodes.length} 个节点 / {edges.length} 条连线</span>
      </div>

      {/* ===== Main Content ===== */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <SidePanel />
        <div ref={reactFlowWrapper} style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodesDelete={onNodesDelete}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[20, 20]}
            deleteKeyCode={['Backspace', 'Delete']}
            style={{ background: '#0a0a12' }}
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: '#6366f1', strokeWidth: 2 },
            }}
          >
            <Controls
              style={{
                background: 'rgba(20,20,30,0.9)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
              }}
            />
            <Background color="rgba(255,255,255,0.05)" gap={20} />
            <MiniMap
              style={{
                background: 'rgba(16,16,26,0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
              }}
              nodeColor={(n) => NODE_COLORS[n.data?.nodeType as ChainNodeType] || '#6366f1'}
              maskColor="rgba(0,0,0,0.6)"
            />
          </ReactFlow>
        </div>
        <PropertiesPanel node={selectedNode} onUpdate={updateNodeData} templates={templates} />
      </div>

      {/* ===== New Chain Dialog ===== */}
      {showNewDialog && (
        <div style={overlayStyle}>
          <div style={dialogStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#eaeaea' }}>新建 Prompt Chain</h3>
            <input
              style={dialogInputStyle}
              placeholder="Chain 名称"
              value={chainName}
              onChange={e => setChainName(e.target.value)}
            />
            <textarea
              style={{ ...dialogInputStyle, minHeight: 60, resize: 'vertical' }}
              placeholder="描述（可选）"
              value={chainDescription}
              onChange={e => setChainDescription(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowNewDialog(false)} style={dialogBtnStyle}>取消</button>
              <button onClick={handleNew} style={{ ...dialogBtnStyle, background: '#6366f1', color: '#fff' }}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Load Chain Dialog ===== */}
      {showLoadDialog && (
        <div style={overlayStyle}>
          <div style={{ ...dialogStyle, maxHeight: 400, overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#eaeaea' }}>加载 Chain</h3>
            {savedChains.length === 0 && (
              <div style={{ color: '#6c6c80', fontSize: 12, textAlign: 'center', padding: 20 }}>暂无保存的 Chain</div>
            )}
            {savedChains.map(c => (
              <div
                key={c.id}
                onClick={() => handleLoadChain(c.id)}
                style={{
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  marginBottom: 8,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#eaeaea' }}>{c.name}</div>
                <div style={{ fontSize: 10, color: '#8a8aa0', marginTop: 2 }}>{c.nodes} 个节点 · v{c.version}</div>
                <div style={{ fontSize: 10, color: '#6c6c80', marginTop: 2 }}>{c.description}</div>
              </div>
            ))}
            <button
              onClick={() => setShowLoadDialog(false)}
              style={{ ...dialogBtnStyle, marginTop: 8, width: '100%' }}
            >关闭</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Styles
// ============================================================

const toolBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  color: '#eaeaea',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  transition: 'background 0.15s',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  background: '#1a1a2e',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: 24,
  width: 400,
  maxWidth: '90vw',
};

const dialogInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  color: '#eaeaea',
  fontSize: 12,
  outline: 'none',
  fontFamily: 'inherit',
  marginBottom: 8,
  boxSizing: 'border-box',
};

const dialogBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  color: '#eaeaea',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// ============================================================
// Page Export (wrapped with ReactFlowProvider)
// ============================================================

const PromptChainPage: React.FC = () => {
  return (
    <ReactFlowProvider>
      <ChainEditor />
    </ReactFlowProvider>
  );
};

export default PromptChainPage;
