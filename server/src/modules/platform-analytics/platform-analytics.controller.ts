/**
 * 平台数据看板 Controller
 *   GET /platform-analytics/overview?days=30&projectId=&storyType=&platform=
 *        全量看板（KPI/四大类/功能矩阵/分布/耗时/每日趋势/漏斗），支持平台总览→单本/长短篇/平台筛选
 *   GET /platform-analytics/health?days=30    轻量健康度（工作台概览）
 *   GET /platform-analytics/bootstrap         启动/运行状态（迁移版本、执行标准、自归纳、运行时长）
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlatformAnalyticsService } from './platform-analytics.service';

@ApiTags('platform-analytics')
@Controller('platform-analytics')
export class PlatformAnalyticsController {
  constructor(private readonly analytics: PlatformAnalyticsService) {}

  @Get('overview')
  overview(
    @Query('days') days?: string,
    @Query('projectId') projectId?: string,
    @Query('storyType') storyType?: string,
    @Query('platform') platform?: string,
  ) {
    const clean = (v?: string) => {
      const s = (v || '').trim();
      return !s || s === 'all' ? null : s;
    };
    return this.analytics.overview({
      days: Number(days) || 30,
      projectId: clean(projectId),
      storyType: clean(storyType),
      platform: clean(platform),
    });
  }

  @Get('health')
  health(@Query('days') days?: string) {
    return this.analytics.health(Number(days) || 30);
  }

  @Get('bootstrap')
  bootstrap() {
    return this.analytics.bootstrap();
  }
}
