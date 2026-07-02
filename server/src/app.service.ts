/**
 * 根服务
 * 提供健康检查和状态信息
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  private readonly startTime: Date;

  constructor() {
    this.startTime = new Date();
  }

  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'novel-ai-server',
      version: '0.1.0',
    };
  }

  getStatus() {
    const uptime = process.uptime();
    const uptimeStr = this.formatUptime(uptime);

    return {
      service: 'AI写作平台 · 后端服务',
      version: '0.1.0',
      environment: process.env.NODE_ENV ?? 'development',
      startedAt: this.startTime.toISOString(),
      uptime: uptimeStr,
      memory: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
      },
      nodeVersion: process.version,
      platform: process.platform,
    };
  }

  private formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  }
}
