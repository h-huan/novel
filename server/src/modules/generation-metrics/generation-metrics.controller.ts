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
import { DatabaseService } from '../../database/database.service';

@ApiTags('generation-metrics')
@Controller('generation-metrics')
export class GenerationMetricsController {
  constructor(
    private readonly metrics: GenerationMetricsService,
    private readonly databaseService: DatabaseService,
  ) {}

  @Get('content-reports')
  contentReports(@Query() query: Record<string, string | undefined>) {
    return this.metrics.queryContentReports(query);
  }

  @Get('cockpit')
  cockpit(@Query('projectId') projectId: string) {
    if (!projectId) throw new BadRequestException('缺少项目ID');
    return { ...this.metrics.getCockpit(projectId), diagnostics: this.generationDiagnostics(projectId) };
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
  addBenchmarkSample(@Body() body: { projectId?: string; storyType: string; platform: string; content: string; sourceRef?: string; chapterIndex?: number }) {
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

  /**
   * 只读诊断视图：不新增日志、不改变 Gate，只把现有 generation_runs /
   * generation_step_metrics 与业务表中已经存在的数据汇总成验收信号。
   * 用于发现“最终 success 但内部先白烧一轮”、完全相同输入重复付费、最慢步骤，
   * 以及“模型调用成功但生成结果没有落到业务 Canon”的编排/持久化故障。
   */
  private generationDiagnostics(projectId: string) {
    const db = this.databaseService.getDb();
    const metrics = db.prepare(`SELECT run_id,chapter_index,step_key,scenario,status,attempt,duration_ms,total_tokens,
        COALESCE(internal_retries,0) internal_retries,created_at
      FROM generation_step_metrics WHERE project_id=? ORDER BY created_at DESC LIMIT 300`).all(projectId) as any[];
    const runs = db.prepare(`SELECT id,stage,scenario,status,chapter_index,prompt_version,context_version,
        constitution_revision,duration_ms,started_at,finished_at
      FROM generation_runs WHERE project_id=? ORDER BY started_at DESC LIMIT 300`).all(projectId) as any[];
    const project = db.prepare('SELECT status,updated_at FROM projects WHERE id=?').get(projectId) as any;
    const count = (table: string, extra = ''): number => {
      try {
        const row = db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE project_id=?${extra}`).get(projectId) as any;
        return Number(row?.c) || 0;
      } catch {
        return 0;
      }
    };
    const persisted = {
      worldSettings: count('world_settings'),
      characters: count('characters'),
      chapterOutlines: count('outlines', " AND level='chapter'"),
      chapters: count('chapters'),
      timelineEvents: count('timeline_events'),
    };

    const totalDurationMs = metrics.reduce((sum, row) => sum + Math.max(0, Number(row.duration_ms) || 0), 0);
    const totalTokens = metrics.reduce((sum, row) => sum + Math.max(0, Number(row.total_tokens) || 0), 0);
    const internalRetryCount = metrics.reduce((sum, row) => sum + Math.max(0, Number(row.internal_retries) || 0), 0);
    const callsWithInternalRetry = metrics.filter(row => Number(row.internal_retries) > 0).length;
    const effectiveRetryCount = metrics.reduce(
      (sum, row) => sum + Math.max(0, Number(row.attempt) || 0) + Math.max(0, Number(row.internal_retries) || 0),
      0,
    );
    const effectiveFirstPassCalls = metrics.filter(row =>
      row.status === 'success' && (Number(row.attempt) || 0) === 0 && (Number(row.internal_retries) || 0) === 0,
    ).length;
    const effectiveFirstPassRate = metrics.length ? Number((effectiveFirstPassCalls / metrics.length).toFixed(3)) : 1;
    const slowestSteps = metrics
      .slice()
      .sort((a, b) => (Number(b.duration_ms) || 0) - (Number(a.duration_ms) || 0))
      .slice(0, 10)
      .map(row => ({
        runId: row.run_id ?? null,
        chapterIndex: row.chapter_index ?? null,
        stepKey: row.step_key ?? null,
        scenario: row.scenario ?? null,
        status: row.status ?? null,
        durationMs: Number(row.duration_ms) || 0,
        totalTokens: Number(row.total_tokens) || 0,
        internalRetries: Number(row.internal_retries) || 0,
      }));

    const groups = new Map<string, any[]>();
    for (const run of runs.filter(row => row.status === 'success')) {
      const key = JSON.stringify([
        run.stage ?? null,
        run.scenario ?? null,
        run.chapter_index ?? null,
        run.prompt_version ?? null,
        run.context_version ?? null,
        run.constitution_revision ?? null,
      ]);
      groups.set(key, [...(groups.get(key) || []), run]);
    }
    const exactDuplicateRuns = [...groups.values()]
      .filter(group => group.length > 1)
      .map(group => ({
        count: group.length,
        stage: group[0].stage ?? null,
        scenario: group[0].scenario ?? null,
        chapterIndex: group[0].chapter_index ?? null,
        promptVersion: group[0].prompt_version ?? null,
        contextVersion: group[0].context_version ?? null,
        constitutionRevision: group[0].constitution_revision ?? null,
        runIds: group.map(row => row.id),
        totalDurationMs: group.reduce((sum, row) => sum + Math.max(0, Number(row.duration_ms) || 0), 0),
      }));

    const successfulStages = new Set(runs.filter(row => row.status === 'success').map(row => String(row.stage || '')));
    const observedPersistenceMismatch: string[] = [];
    if (successfulStages.has('world') && persisted.worldSettings === 0) observedPersistenceMismatch.push('world_success_without_world_setting');
    if (successfulStages.has('character') && persisted.characters === 0) observedPersistenceMismatch.push('character_success_without_character');
    if (successfulStages.has('outline') && persisted.chapterOutlines === 0) observedPersistenceMismatch.push('outline_success_without_chapter_outline');
    if (successfulStages.has('chapter') && persisted.chapters === 0) observedPersistenceMismatch.push('chapter_success_without_chapter');

    const activeGenerationRuns = runs.filter(row => String(row.status || '').toLowerCase() === 'running').length;
    const activityTimes = [
      project?.updated_at,
      ...metrics.map(row => row.created_at),
      ...runs.flatMap(row => [row.started_at, row.finished_at]),
    ]
      .map(value => Date.parse(String(value || '')))
      .filter(value => Number.isFinite(value));
    const lastActivityMs = activityTimes.length ? Math.max(...activityTimes) : null;
    const idleMs = lastActivityMs === null ? null : Math.max(0, Date.now() - lastActivityMs);
    const creationStallThresholdMs = 3 * 60 * 1000;
    const isCreating = String(project?.status || '').toLowerCase() === 'creating';
    const creationStalled = isCreating && activeGenerationRuns === 0 && idleMs !== null && idleMs >= creationStallThresholdMs;
    // 创建中短暂出现“模型已成功、业务表尚未落库”是允许的中间态；只有失败/完成后仍不一致，
    // 或 creating 已经无运行调用并持续空闲超过阈值，才升级为真正持久化故障。
    const persistenceMismatch = isCreating && !creationStalled ? [] : observedPersistenceMismatch;
    const pendingPersistenceMismatch = isCreating && !creationStalled ? observedPersistenceMismatch : [];

    return {
      projectStatus: project?.status ?? null,
      sample: { stepMetrics: metrics.length, generationRuns: runs.length },
      persisted,
      persistenceMismatch,
      pendingPersistenceMismatch,
      activeGenerationRuns,
      lastActivityAt: lastActivityMs === null ? null : new Date(lastActivityMs).toISOString(),
      idleMs,
      creationStallThresholdMs,
      creationStalled,
      totalDurationMs,
      totalTokens,
      internalRetryCount,
      callsWithInternalRetry,
      effectiveRetryCount,
      effectiveFirstPassCalls,
      effectiveFirstPassRate,
      exactDuplicateRunGroups: exactDuplicateRuns.length,
      exactDuplicateRuns,
      slowestSteps,
    };
  }
}
