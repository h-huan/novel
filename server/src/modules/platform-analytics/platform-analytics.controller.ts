/**
 * 平台数据看板 Controller
 *   GET /platform-analytics/overview?days=30&projectId=&storyType=&platform=
 *   GET /platform-analytics/benchmark?projectId=&storyType=&platform=
 *        行业基线 + 本地高质量样本动态基准；没有销量证据时不冒充商业爆款
 *   GET /platform-analytics/health?days=30    轻量健康度（工作台概览）
 *   GET /platform-analytics/bootstrap         启动/运行状态（迁移版本、执行标准、自归纳、运行时长）
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlatformAnalyticsService } from './platform-analytics.service';
import { DatabaseService } from '../../database/database.service';
import { empiricalPlatformBenchmark } from './empirical-benchmark';

@ApiTags('platform-analytics')
@Controller('platform-analytics')
export class PlatformAnalyticsController {
  constructor(
    private readonly analytics: PlatformAnalyticsService,
    private readonly database: DatabaseService,
  ) {}

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

  @Get('benchmark')
  benchmark(
    @Query('projectId') projectId?: string,
    @Query('storyType') storyType?: string,
    @Query('platform') platform?: string,
  ) {
    const clean = (v?: string) => {
      const s = (v || '').trim();
      return !s || s === 'all' ? null : s;
    };
    return empiricalPlatformBenchmark(this.database.getDb(), {
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
