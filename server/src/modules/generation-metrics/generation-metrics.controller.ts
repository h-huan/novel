/**
 * 生成步骤遥测 Controller —— 把"系统内部哪一步卡、重试几轮、多久、为什么"透明地暴露给作者。
 *   GET /generation-metrics/flow?projectId=&days=30      步骤级聚合（项目仪表盘）
 *   GET /generation-metrics/overview?days=30             全局概览（首页）
 *   GET /generation-metrics/recent?projectId=&limit=20   最近卡点明细
 *   GET /generation-metrics/calibration?projectId=       字数产出比自校准结果
 */
import { Body, Controller, Get, Param, Post, Put, Query, BadRequestException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GenerationMetricsService } from './generation-metrics.service';

@ApiTags('generation-metrics')
@Controller('generation-metrics')
export class GenerationMetricsController {
  constructor(private readonly metrics: GenerationMetricsService) {}

  @Get('content-reports')
  contentReports(@Query() query: Record<string, string | undefined>) {
    return this.metrics.queryContentReports(query);
  }

  @Get('cockpit')
  cockpit(@Query('projectId') projectId: string) {
    if (!projectId) throw new BadRequestException('缺少项目ID');
    return this.metrics.getCockpit(projectId);
  }

  @Get('runs')
  runs(@Query('projectId') projectId?: string, @Query('limit') limit?: string) {
    return { items: this.metrics.getRuns(projectId, Number(limit) || 50) };
  }

  @Get('benchmark')
  benchmark() {
    return this.metrics.getBenchmarkFramework();
  }

  @Post('benchmark/samples')
  addBenchmarkSample(@Body() body: { projectId?: string; storyType: string; platform: string; content: string; sourceRef?: string }) {
    return this.metrics.addBenchmarkSample(body);
  }

  @Put('benchmark/samples/:id/annotation')
  annotateBenchmarkSample(@Param('id') id: string, @Body('labels') labels: string[]) {
    return this.metrics.annotateBenchmarkSample(id, labels);
  }

  @Post('benchmark/evaluations')
  recordBenchmarkEvaluation(@Body() body: Parameters<GenerationMetricsService['recordBenchmarkEvaluation']>[0]) {
    return this.metrics.recordBenchmarkEvaluation(body);
  }

  @Get('flow')
  flow(@Query('projectId') projectId?: string, @Query('days') days?: string) {
    return this.metrics.getFlowSummary(projectId || undefined, Number(days) || 30);
  }

  @Get('overview')
  overview(@Query('days') days?: string) {
    return this.metrics.getOverview(Number(days) || 30);
  }

  @Get('recent')
  recent(
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
    @Query('days') days?: string,
  ) {
    return {
      items: this.metrics.getRecentBottlenecks(projectId || undefined, Number(limit) || 20, Number(days) || 30),
    };
  }

  @Get('calibration')
  calibration(@Query('projectId') projectId?: string) {
    const calib = this.metrics.getLengthCalibration(projectId || undefined);
    return { calibration: calib };
  }
}
