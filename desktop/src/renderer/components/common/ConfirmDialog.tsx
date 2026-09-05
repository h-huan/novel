/**
 * ConfirmDialog - 二次确认弹窗组件
 * 用于：解锁章节、删除项目、删除角色等不可逆操作
 */

import React, { useEffect, useRef } from 'react';

export interface ConfirmDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 对话框标题 */
  title: string;
  /** 描述内容 */
  description: string;
  /** 确认按钮文本 */
  confirmText?: string;
  /** 取消按钮文本 */
  cancelText?: string;
  /** 确认按钮变体 */
  variant?: 'danger' | 'warning' | 'info';
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
}

const VARIANTS = {
  danger: {
    icon: '⚠',
    confirmBg: 'var(--color-danger)',
    confirmHover: 'var(--color-danger)',
  },
  warning: {
    icon: '⚡',
    confirmBg: 'var(--color-warning)',
    confirmHover: 'var(--color-warning)',
  },
  info: {
    icon: 'ℹ',
    confirmBg: 'var(--color-info)',
    confirmHover: 'var(--color-info)',
  },
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const variantStyle = VARIANTS[variant];

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div style={styles.overlay}>
      <div ref={dialogRef} style={styles.dialog}>
        <div style={styles.header}>
          <span style={{ ...styles.icon, color: variantStyle.confirmBg }}>{variantStyle.icon}</span>
          <h3 style={styles.title}>{title}</h3>
        </div>
        <p style={styles.description}>{description}</p>
        <div style={styles.actions}>
          <button
            style={styles.cancelBtn}
            onClick={onCancel}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {cancelText}
          </button>
          <button
            style={{
              ...styles.confirmBtn,
              backgroundColor: variantStyle.confirmBg,
            }}
            onClick={onConfirm}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = variantStyle.confirmHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = variantStyle.confirmBg;
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(2px)',
  },
  dialog: {
    backgroundColor: 'var(--color-bg-primary)',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '420px',
    width: '90%',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '12px',
  },
  icon: {
    fontSize: '24px',
    lineHeight: 1,
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  description: {
    margin: '0 0 24px 0',
    fontSize: '14px',
    lineHeight: 1.6,
    color: 'var(--color-text-dim)',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  cancelBtn: {
    padding: '8px 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--color-text-dim)',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  confirmBtn: {
    padding: '8px 20px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-white)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
};

export default ConfirmDialog;
