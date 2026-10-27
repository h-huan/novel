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
import { redactDiagnosticText } from '../../common/diagnostic-redaction';

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

  @Get('steps')
  steps(
    @Query('projectId') projectId?: string,
    @Query('scenario') scenario?: string,
    @Query('stepPrefix') stepPrefix?: string,
    @Query('startAt') startAt?: string,
    @Query('endAt') endAt?: string,
    @Query('limit') limit?: string,
    @Query('discoveryRequestId') discoveryRequestId?: string,
  ) {
    const parseTimestamp = (name: string, value?: string): string | null => {
      if (!value) return null;
      const milliseconds = Date.parse(value);
      if (!Number.isFinite(milliseconds)) throw new BadRequestException(name + ' must be a valid timestamp');
      return new Date(milliseconds).toISOString();
    };
    const normalizedStartAt = parseTimestamp('startAt', startAt);
    const normalizedEndAt = parseTimestamp('endAt', endAt);
    if (normalizedStartAt && normalizedEndAt && Date.parse(normalizedStartAt) > Date.parse(normalizedEndAt)) {
      throw new BadRequestException('startAt must not be later than endAt');
    }
    const requestedLimit = Number(limit);
    const boundedLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(500, Math.floor(requestedLimit)) : 200;
    const where: string[] = [];
    const params: any[] = [];
    if (projectId) { where.push('m.project_id = ?'); params.push(projectId); }
    if (scenario) { where.push('m.scenario = ?'); params.push(scenario); }
    if (stepPrefix) { where.push('substr(m.step_key, 1, ?) = ?'); params.push(stepPrefix.length, stepPrefix); }
    if (normalizedStartAt) { where.push('julianday(m.created_at) >= julianday(?)'); params.push(normalizedStartAt); }
    if (normalizedEndAt) { where.push('julianday(m.created_at) <= julianday(?)'); params.push(normalizedEndAt); }
    if (discoveryRequestId) { where.push('m.discovery_request_id = ?'); params.push(discoveryRequestId); }
    const sql = `SELECT m.id, m.run_id, m.project_id, m.discovery_request_id, m.chapter_index, m.step_key, m.scenario,
      m.status, m.attempt, m.phase, m.duration_ms, m.fail_reason, m.total_tokens,
      COALESCE(m.internal_retries, 0) AS internal_retries, m.created_at, m.model_version,
      r.stage, r.gate_status, r.started_at, r.finished_at, r.prompt_version, r.context_version,
      r.constitution_revision
      FROM generation_step_metrics m
      LEFT JOIN generation_runs r ON r.id = m.run_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY m.created_at DESC LIMIT ?`;
    const rows = this.databaseService.getDb().prepare(sql).all(...params, boundedLimit) as any[];
    const items = rows.map(row => ({
      ...row,
      fail_reason: row.fail_reason == null ? null : redactDiagnosticText(row.fail_reason),
    }));
    return {
      items,
      count: items.length,
      limit: boundedLimit,
      filters: { projectId: projectId ?? null, scenario: scenario ?? null, stepPrefix: stepPrefix ?? null, startAt: normalizedStartAt, endAt: normalizedEndAt, discoveryRequestId: discoveryRequestId ?? null },
    };
  }


  @Get('idea-activity')
  ideaActivity(@Query('startAt') startAt?: string) {
    const timestamp = startAt ? Date.parse(startAt) : null;
    if (startAt && !Number.isFinite(timestamp)) throw new BadRequestException('startAt must be a valid timestamp');
    // Deliberately exclude raw prompts, outputs and context snapshots. A model
    // run exists before any finished step metrics or final discovery audit.
    const rows = this.databaseService.getDb().prepare(
      "SELECT id,stage,scenario,status,started_at,finished_at,duration_ms,model,error " +
      "FROM generation_runs WHERE scenario='idea_generate' " +
      "AND (? IS NULL OR julianday(started_at)>=julianday(?) " +
      "OR julianday(finished_at)>julianday(?) OR status='running') " +
      "ORDER BY started_at DESC LIMIT 200"
    ).all(startAt ? new Date(timestamp!).toISOString() : null,
      startAt ? new Date(timestamp!).toISOString() : null,
      startAt ? new Date(timestamp!).toISOString() : null) as Array<Record<string,unknown>>;
    return {items: rows.map(row=>({...row,
      error:row.error==null?null:redactDiagnosticText(String(row.error))})),
      count:rows.length,truncated:rows.length===200};
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
   * 以及已激活项目缺少业务 Canon 的编排/持久化故障。
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
    let latestCreationFailure: Record<string, unknown> | null = null;
    let creationFailureQueryError: string | null = null;
    try {
      const failure = db.prepare(`SELECT id,output_text,error,finished_at FROM generation_runs
        WHERE project_id=? AND status='failed' AND output_text LIKE '%"kind":"creation_stage_failure"%'
        ORDER BY started_at DESC LIMIT 1`).get(projectId) as any;
      if (typeof failure?.output_text === 'string') {
        const payload = JSON.parse(failure.output_text);
        if (payload.kind === 'creation_stage_failure') latestCreationFailure = {
          runId: failure.id, step: payload.step, origin: payload.origin, finishedAt: failure.finished_at,
          message: redactDiagnosticText(String(failure.error || '')),
          ...(payload.statusPersistenceError ? { statusPersistenceError: redactDiagnosticText(String(payload.statusPersistenceError)) } : {}),
        };
      }
    } catch (error) {
      creationFailureQueryError = redactDiagnosticText(error instanceof Error ? error.message : String(error));
    }
    const persistenceQueryErrors: string[] = [];
    const count = (table: string, extra = ''): number | null => {
      try {
        const row = db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE project_id=?${extra}`).get(projectId) as any;
        return Number(row?.c) || 0;
      } catch (error) {
        persistenceQueryErrors.push(table + ': ' + redactDiagnosticText(error instanceof Error ? error.message : String(error)));
        return null;
      }
    };
    const persisted = {
      worldSettings: count('world_settings'),
      characters: count('characters'),
      chapterOutlines: count('outlines', " AND level='chapter'"),
      chapters: count('chapters'),
      timelineEvents: (() => {
        try {
          const row = db.prepare('SELECT COUNT(*) c FROM timeline_events e JOIN timelines t ON e.timeline_id=t.id WHERE t.project_id=?').get(projectId) as any;
          return Number(row?.c) || 0;
        } catch (error) {
          persistenceQueryErrors.push('timeline_events: ' + redactDiagnosticText(error instanceof Error ? error.message : String(error)));
          return null;
        }
      })(),
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
    const persistenceUnknown = Object.entries(persisted).filter(([, value]) => value === null).map(([key]) => key);
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
    // generation_runs.status=success only means an individual model call completed.
    // Source review or a later quality Gate can reject that output before any Canon write.
    // A failed/stalled creation with no world row is therefore not evidence of lost data.
    const projectStatus = String(project?.status || '').toLowerCase();
    const persistenceCheckApplicable = ['active', 'completed', 'success'].includes(projectStatus);
    const persistenceMismatch = persistenceCheckApplicable ? observedPersistenceMismatch : [];
    const pendingPersistenceMismatch: string[] = [];

    return {
      projectStatus: project?.status ?? null,
      latestCreationFailure,
      creationFailureQueryError,
      sample: { stepMetrics: metrics.length, generationRuns: runs.length },
      persisted,
      persistenceMismatch,
      pendingPersistenceMismatch,
      persistenceUnknown,
      persistenceQueryErrors,
      persistenceStatus: persistenceQueryErrors.length ? 'unknown'
        : isCreating && !creationStalled ? 'pending'
        : !persistenceCheckApplicable ? 'not_applicable'
        : persistenceMismatch.length ? 'mismatch' : pendingPersistenceMismatch.length ? 'pending' : 'consistent',
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
