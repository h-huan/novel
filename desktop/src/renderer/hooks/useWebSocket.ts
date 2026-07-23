/**
 * WebSocket Hook — 使用 Socket.IO 连接后端 /writing 和 /system 命名空间
 * 提供实时通知：章节进度、状态变更、冲突检测、伏笔预警
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getBaseUrl } from '../lib/api';

interface WsEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

function getSocketServerOrigin(): string {
  try {
    return new URL(getBaseUrl()).origin;
  } catch {
    return 'http://localhost:3100';
  }
}

export function useWritingWebSocket(projectId: string | undefined) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const [notifications, setNotifications] = useState<WsEvent[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!projectId) return;

    // Always connect to the API server, never the Vite renderer origin.
    const socket = io(`${getSocketServerOrigin()}/writing`, {
      transports: ['websocket', 'polling'],
      query: { projectId },
      reconnection: true,
      reconnectionDelay: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    // 监听服务端推送的事件
    const eventTypes = [
      'chapter_progress',
      'chapter_status',
      'content_update',
    ];
    for (const eventType of eventTypes) {
      socket.on(eventType, (data: any) => {
        const wsEvent: WsEvent = {
          type: eventType,
          data: typeof data === 'object' ? data : { message: String(data) },
          timestamp: new Date().toISOString(),
        };
        setLastEvent(wsEvent);
        setNotifications(prev => [wsEvent, ...prev].slice(0, 20));
      });
    }

    return () => {
      for (const eventType of eventTypes) {
        socket.off(eventType);
      }
      socket.disconnect();
    };
  }, [projectId]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return { connected, lastEvent, notifications, clearNotifications };
}

/**
 * 系统级 Socket.IO 连接 — /system 命名空间
 */
export function useSystemWebSocket() {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(`${getSocketServerOrigin()}/system`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    const eventTypes = ['conflict_detected', 'system_notification', 'foreshadowing_warning'];
    for (const eventType of eventTypes) {
      socket.on(eventType, (data: any) => {
        setLastEvent({
          type: eventType,
          data: typeof data === 'object' ? data : { message: String(data) },
          timestamp: new Date().toISOString(),
        });
      });
    }

    return () => {
      for (const eventType of eventTypes) {
        socket.off(eventType);
      }
      socket.disconnect();
    };
  }, []);

  return { connected, lastEvent };
}
