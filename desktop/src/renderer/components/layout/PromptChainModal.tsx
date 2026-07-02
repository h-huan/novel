/**
 * PromptChainModal - Prompt Chain 编辑器弹框
 * 将原 PromptChainPage 包装为大尺寸模态框
 * 通过顶部 Header 按钮触发打开，不占用路由导航
 */
import React, { useCallback, useEffect } from 'react';

interface PromptChainModalProps {
  open: boolean;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1500,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'rgba(0,0,0,0.65)',
};

const modalStyle: React.CSSProperties = {
  width: '95vw', height: '90vh', maxWidth: '1400px', maxHeight: '900px',
  backgroundColor: '#12121f', borderRadius: '14px',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 32px 100px rgba(0,0,0,0.6)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
  flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  flex: 1, overflow: 'hidden', position: 'relative',
};

/**
 * 延时加载 PromptChainPage（避免首屏加载 reactflow 等重依赖）
 */
const LazyPromptChainEditor: React.FC = () => {
  const [EditorComponent, setEditorComponent] = React.useState<React.FC<any> | null>(null);

  useEffect(() => {
    // 动态 import 避免首屏加载 ReactFlow
    import('../../pages/PromptChainPage').then((mod) => {
      setEditorComponent(() => mod.default);
    });
  }, []);

  if (!EditorComponent) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#6c6c80', fontSize: '13px', gap: '8px',
      }}>
        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span>
        加载编辑器...
      </div>
    );
  }

  return <EditorComponent />;
};

const PromptChainModal: React.FC<PromptChainModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* 头部：标题 + 关闭按钮 */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>⛓</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#eaeaea' }}>Prompt Chain 编辑器</h3>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#6c6c80' }}>可视化编排 AI 提示词链</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '5px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#8a8aa0', cursor: 'pointer', fontSize: '14px',
            }}
            title="关闭 (ESC)"
          >
            ✕ 关闭
          </button>
        </div>

        {/* 正文：懒加载 PromptChain 编辑器 */}
        <div style={bodyStyle}>
          <LazyPromptChainEditor />
        </div>
      </div>
    </div>
  );
};

export default PromptChainModal;
