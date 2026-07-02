/**
 * Notification - 非模态Toast通知组件
 * 支持 success / error / warning / info 四种类型
 */
import React, { useEffect, useCallback, useState } from 'react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
}

interface NotificationContainerProps {
  notifications: NotificationItem[];
  onRemove: (id: string) => void;
}

const typeStyles: Record<NotificationType, { bg: string; border: string; icon: string; color: string }> = {
  success: { bg: '#0d3b2c', border: '#1a8c5c', icon: '✓', color: '#2ecc71' },
  error: { bg: '#3b0d1a', border: '#8c1a3a', icon: '✕', color: '#e74c3c' },
  warning: { bg: '#3b2e0d', border: '#8c751a', icon: '⚡', color: '#f39c12' },
  info: { bg: '#0d1f3b', border: '#1a4a8c', icon: 'ℹ', color: '#3498db' },
};

const NotificationItem: React.FC<{ item: NotificationItem; onRemove: (id: string) => void }> = ({ item, onRemove }) => {
  const [exiting, setExiting] = useState(false);
  const ts = typeStyles[item.type];

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onRemove(item.id), 300);
    }, item.duration ?? 4000);
    return () => clearTimeout(timer);
  }, [item.id, item.duration, onRemove]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        backgroundColor: ts.bg,
        border: `1px solid ${ts.border}`,
        borderRadius: '8px',
        color: '#eaeaea',
        fontSize: '13px',
        lineHeight: 1.5,
        minWidth: '260px',
        maxWidth: '400px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        transition: 'opacity 0.3s, transform 0.3s',
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateX(30px)' : 'translateX(0)',
      }}
    >
      <span style={{ color: ts.color, fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>{ts.icon}</span>
      <span style={{ flex: 1 }}>{item.message}</span>
      <button
        onClick={() => { setExiting(true); setTimeout(() => onRemove(item.id), 300); }}
        style={{ background: 'none', border: 'none', color: '#6c6c80', cursor: 'pointer', fontSize: '12px', padding: '2px', flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  );
};

const NotificationContainer: React.FC<NotificationContainerProps> = ({ notifications, onRemove }) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'auto',
      }}
    >
      {notifications.map((n) => (
        <NotificationItem key={n.id} item={n} onRemove={onRemove} />
      ))}
    </div>
  );
};

// 全局通知状态管理
let globalListeners: Array<(notifications: NotificationItem[]) => void> = [];
let globalNotifications: NotificationItem[] = [];
let idCounter = 0;

function notify(type: NotificationType, message: string, duration?: number) {
  const id = `notif_${++idCounter}`;
  globalNotifications = [...globalNotifications, { id, type, message, duration }];
  globalListeners.forEach((fn) => fn(globalNotifications));
}

function removeNotification(id: string) {
  globalNotifications = globalNotifications.filter((n) => n.id !== id);
  globalListeners.forEach((fn) => fn(globalNotifications));
}

export function showNotification(type: NotificationType, message: string, duration?: number) {
  notify(type, message, duration);
}

export function useNotification() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    const listener = (items: NotificationItem[]) => setNotifications([...items]);
    globalListeners.push(listener);
    return () => {
      globalListeners = globalListeners.filter((l) => l !== listener);
    };
  }, []);

  return {
    notifications,
    removeNotification,
    showSuccess: (msg: string) => notify('success', msg),
    showError: (msg: string) => notify('error', msg),
    showWarning: (msg: string) => notify('warning', msg),
    showInfo: (msg: string) => notify('info', msg),
  };
}

export default NotificationContainer;
