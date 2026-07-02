/**
 * WebSocket 网关模块
 * Socket.IO 集成到 NestJS Fastify
 * 命名空间: /writing (写作进度), /system (系统通知)
 */
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket, Namespace } from 'socket.io';
import { Injectable } from '@nestjs/common';

/**
 * 写作进度网关
 * 推送章节生成进度、状态变更
 */
@WebSocketGateway({
  namespace: '/writing',
  cors: { origin: '*' },
})
export class WritingGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Namespace;

  afterInit(server: Namespace) {
    console.log('[WebSocket] Writing namespace initialized');
  }

  handleConnection(client: Socket) {
    const projectId = client.handshake.query.projectId as string;
    if (projectId) {
      client.join(`project:${projectId}`);
    }
    console.log(`[WS/Writing] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[WS/Writing] Client disconnected: ${client.id}`);
  }

  /**
   * 客户端加入项目房间
   */
  @SubscribeMessage('join_project')
  handleJoinProject(client: Socket, @MessageBody() projectId: string) {
    client.join(`project:${projectId}`);
    return { event: 'joined', projectId };
  }

  /**
   * 客户端离开项目房间
   */
  @SubscribeMessage('leave_project')
  handleLeaveProject(client: Socket, @MessageBody() projectId: string) {
    client.leave(`project:${projectId}`);
    return { event: 'left', projectId };
  }

  /**
   * 推送章节生成进度
   */
  notifyChapterProgress(projectId: string, chapterId: string, progress: {
    step: string;
    percentage: number;
    message: string;
  }) {
    this.server.to(`project:${projectId}`).emit('chapter_progress', {
      chapterId,
      ...progress,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 推送章节状态变更
   */
  notifyChapterStatusChange(projectId: string, chapterId: string, status: string) {
    this.server.to(`project:${projectId}`).emit('chapter_status', {
      chapterId,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 推送内容更新
   */
  notifyContentUpdate(projectId: string, chapterId: string, preview: string) {
    this.server.to(`project:${projectId}`).emit('content_update', {
      chapterId,
      preview,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * 系统通知网关
 * 推送系统通知、冲突检测结果
 */
@WebSocketGateway({
  namespace: '/system',
  cors: { origin: '*' },
})
export class SystemGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Namespace;

  afterInit() {
    console.log('[WebSocket] System namespace initialized');
  }

  handleConnection(client: Socket) {
    console.log(`[WS/System] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[WS/System] Client disconnected: ${client.id}`);
  }

  /**
   * 推送冲突检测结果
   */
  notifyConflictDetected(projectId: string, conflict: {
    id: string;
    type: string;
    priority: number;
    description: string;
  }) {
    this.server.emit('conflict_detected', {
      projectId,
      ...conflict,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 推送系统通知
   */
  notifySystem(projectId: string, notification: {
    type: 'info' | 'warning' | 'error' | 'success';
    message: string;
    data?: any;
  }) {
    this.server.emit('system_notification', {
      projectId,
      ...notification,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 推送伏笔预警
   */
  notifyForeshadowingWarning(projectId: string, foreshadowingId: string, message: string) {
    this.server.emit('foreshadowing_warning', {
      projectId,
      foreshadowingId,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * WebSocket 事件类型定义
 */
export interface WritingProgressEvent {
  chapterId: string;
  step: 'outline' | 'drafting' | 'reviewing' | 'completed';
  percentage: number;
  message: string;
  timestamp: string;
}

export interface ChapterStatusEvent {
  chapterId: string;
  status: 'draft' | 'reviewing' | 'locked';
  timestamp: string;
}

export interface ConflictEvent {
  projectId: string;
  id: string;
  type: string;
  priority: number;
  description: string;
  timestamp: string;
}
