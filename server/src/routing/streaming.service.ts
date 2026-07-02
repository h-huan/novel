/**
 * 流式生成服务
 *
 * 支持两种传输方式：
 * - SSE (Server-Sent Events) 主要方式
 * - WebSocket 备用方式
 *
 * 流格式：
 *   { type: 'token'|'progress'|'step'|'error'|'done', data: ... }
 */
import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

// ==================== 类型定义 ====================

/** 流消息类型 */
export type StreamMessageType = 'token' | 'progress' | 'step' | 'error' | 'done';

/** 流消息 */
export interface StreamMessage {
  type: StreamMessageType;
  data: unknown;
  timestamp: number;
  sessionId: string;
}

/** Token 流数据 */
export interface TokenData {
  text: string;
  index: number;
  isLast?: boolean;
}

/** 进度数据 */
export interface ProgressData {
  currentStep: number;
  totalSteps: number;
  currentStepName: string;
  completedWords: number;
  estimatedRemaining: number;    // 预计剩余字数
  percentage: number;            // 0-100
}

/** 步骤数据 */
export interface StepData {
  stepName: string;
  stepNumber: number;
  status: 'started' | 'completed' | 'failed';
  modelUsed: string;
  duration?: number;
}

/** 流会话状态 */
export interface StreamSession {
  sessionId: string;
  projectId: string;
  startedAt: Date;
  completedWords: number;
  targetWords: number;
  currentStep: number;
  totalSteps: number;
  status: 'streaming' | 'completed' | 'error' | 'cancelled';
}

/** 流式生成回调 */
export interface StreamEventCallbacks {
  onToken?: (token: string) => void;
  onProgress?: (progress: ProgressData) => void;
  onStep?: (step: StepData) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
}

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);

  /** 活跃流会话 */
  private readonly sessions = new Map<string, StreamSession>();

  /** 各会话的 Subject 流 */
  private readonly streams = new Map<string, Subject<StreamMessage>>();

  /** SSE 连接池 */
  private readonly sseClients = new Map<string, Set<(msg: StreamMessage) => void>>();

  // ==================== 流管理 ====================

  /**
   * 创建新的流会话
   */
  createSession(projectId: string, targetWords: number, totalSteps: number): string {
    const sessionId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const session: StreamSession = {
      sessionId,
      projectId,
      startedAt: new Date(),
      completedWords: 0,
      targetWords,
      currentStep: 1,
      totalSteps,
      status: 'streaming',
    };

    this.sessions.set(sessionId, session);
    this.streams.set(sessionId, new Subject<StreamMessage>());

    this.logger.log(`创建流会话: ${sessionId}, 项目: ${projectId}`);

    return sessionId;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): StreamSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 获取会话的 Observable
   */
  getStream(sessionId: string): Observable<StreamMessage> | null {
    const subject = this.streams.get(sessionId);
    return subject ? subject.asObservable() : null;
  }

  /**
   * 过滤特定类型的流消息
   */
  getFilteredStream(sessionId: string, type: StreamMessageType): Observable<StreamMessage> | null {
    const stream = this.getStream(sessionId);
    return stream ? stream.pipe(filter((msg) => msg.type === type)) : null;
  }

  // ==================== 消息推送 ====================

  /**
   * 推送 Token
   */
  pushToken(sessionId: string, text: string): void {
    this.push({
      sessionId,
      type: 'token',
      data: { text, index: this.getSession(sessionId)?.completedWords || 0 } as TokenData,
      timestamp: Date.now(),
    });
  }

  /**
   * 推送进度更新
   */
  pushProgress(
    sessionId: string,
    completedWords: number,
    estimatedRemaining: number,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.completedWords = completedWords;

    const progress: ProgressData = {
      currentStep: session.currentStep,
      totalSteps: session.totalSteps,
      currentStepName: this.getStepName(session.currentStep),
      completedWords,
      estimatedRemaining,
      percentage: Math.min(100, Math.round((completedWords / (completedWords + estimatedRemaining)) * 100)),
    };

    this.push({
      sessionId,
      type: 'progress',
      data: progress,
      timestamp: Date.now(),
    });
  }

  /**
   * 推送步骤变更
   */
  pushStep(sessionId: string, stepName: string, status: StepData['status'], modelUsed: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (status === 'started') {
      session.currentStep++;
    }

    const step: StepData = {
      stepName,
      stepNumber: session.currentStep - 1,
      status,
      modelUsed,
    };

    this.push({
      sessionId,
      type: 'step',
      data: step,
      timestamp: Date.now(),
    });
  }

  /**
   * 推送错误
   */
  pushError(sessionId: string, errorMessage: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'error';
    }

    this.push({
      sessionId,
      type: 'error',
      data: errorMessage,
      timestamp: Date.now(),
    });
  }

  /**
   * 推送完成
   */
  pushDone(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'completed';
    }

    this.push({
      sessionId,
      type: 'done',
      data: { finalWords: session?.completedWords || 0 },
      timestamp: Date.now(),
    });

    // 延迟清理会话
    setTimeout(() => {
      this.cleanupSession(sessionId);
    }, 60_000);
  }

  // ==================== 内部推送 ====================

  /**
   * 推送消息到流
   */
  private push(message: StreamMessage): void {
    const subject = this.streams.get(message.sessionId);
    if (subject) {
      subject.next(message);
    }

    // 同时推送到 SSE 客户端
    const clients = this.sseClients.get(message.sessionId);
    if (clients) {
      for (const client of clients) {
        try {
          client(message);
        } catch {
          clients.delete(client);
        }
      }
    }
  }

  // ==================== SSE 支持 ====================

  /**
   * 注册 SSE 客户端回调
   */
  registerSSEClient(sessionId: string, onMessage: (msg: StreamMessage) => void): () => void {
    if (!this.sseClients.has(sessionId)) {
      this.sseClients.set(sessionId, new Set());
    }
    this.sseClients.get(sessionId)!.add(onMessage);

    // 返回取消注册函数
    return () => {
      const clients = this.sseClients.get(sessionId);
      if (clients) {
        clients.delete(onMessage);
        if (clients.size === 0) {
          this.sseClients.delete(sessionId);
        }
      }
    };
  }

  // ==================== WebSocket 支持 ====================

  /**
   * 将 Observable 流转换为 WebSocket 兼容格式
   * WebSocket Gateway 可直接订阅返回的 Observable
   */
  getWebSocketStream(sessionId: string): Observable<StreamMessage> | null {
    return this.getStream(sessionId);
  }

  // ==================== 会话清理 ====================

  /**
   * 取消流会话
   */
  cancelSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = 'cancelled';
    this.push({
      sessionId,
      type: 'done',
      data: { finalWords: session.completedWords, cancelled: true },
      timestamp: Date.now(),
    });

    this.cleanupSession(sessionId);
    this.logger.log(`流会话已取消: ${sessionId}`);
    return true;
  }

  /**
   * 清理会话资源
   */
  private cleanupSession(sessionId: string): void {
    const subject = this.streams.get(sessionId);
    if (subject) {
      subject.complete();
      this.streams.delete(sessionId);
    }

    this.sessions.delete(sessionId);
    this.sseClients.delete(sessionId);
  }

  // ==================== 辅助方法 ====================

  /**
   * 获取步骤名称
   */
  private getStepName(stepNumber: number): string {
    const stepNames = [
      '素材解析',
      '目标设定',
      '诱因设计',
      '行动描写',
      '阻碍设计',
      '误判设定',
      '反转生成',
      '代价描写',
      '钩子设计',
      '正文合成',
      '质检审查',
    ];
    return stepNames[stepNumber - 1] || `步骤 ${stepNumber}`;
  }

  /**
   * 活跃会话数
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 列出所有活跃会话
   */
  listActiveSessions(): StreamSession[] {
    return Array.from(this.sessions.values());
  }
}
