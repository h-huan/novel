/**
 * SidePanel - 非模态滑入式侧边面板
 * 替代模态弹窗，从右侧滑入
 */
import React, { useEffect, useState, useRef } from 'react';

export interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}

const SidePanel: React.FC<SidePanelProps> = ({
  open,
  onClose,
  title,
  children,
  width = 380,
}) => {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 250);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.35)',
          zIndex: 9000,
          transition: 'opacity 0.25s',
          opacity: animating ? 1 : 0,
        }}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width,
          maxWidth: '90vw',
          backgroundColor: '#1a1a2e',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          zIndex: 9001,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
          transition: 'transform 0.25s ease',
          transform: animating ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#eaeaea' }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#6c6c80',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            ✕
          </button>
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {children}
        </div>
      </div>
    </>
  );
};

export default SidePanel;
