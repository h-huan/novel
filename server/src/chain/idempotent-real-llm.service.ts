import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { RealLLMService } from './real-llm.service';
import type { LLMRequest, LLMResponse } from './chain.types';
import { ModelRouterService } from '../routing/model-router.service';
import { GenerationMetricsService } from '../modules/generation-metrics/generation-metrics.service';
import { DatabaseService } from '../database/database.service';
import { currentCreationProjectId } from '../common/creation-context';
import { readConstitution } from '../modules/project/creative-constitution';
import { compileContext } from '../modules/generation-metrics/context-compiler';
import { qualityStage } from '../routing/scenario-taxonomy';
import { standardDirectiveCache } from '../modules/module-standards/standard-directive.cache';

const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const AUTOMATIC_WHOLE_CHAPTER_REPAIR_STEP = 'body_alignment_repair';

/**
 * The public provider token is still RealLLMService. This subclass keeps runtime
 * invariants at the single LLM boundary without adding a second router or quality system:
 * 1) exact successful creation/planning calls may be reused after recovery;
 * 2) the historical automatic whole-chapter alignment rewrite is physically blocked;
 * 3) project-scoped outputs carry their generation_runs.id so downstream Canon commits
 *    can prove which exact gated generation produced the artifact.
 */
@Injectable()
export class IdempotentRealLLMService extends RealLLMService {
  constructor(
    private readonly runtimeRouter: ModelRouterService,
    metrics: GenerationMetricsService,
    private readonly database: DatabaseService,
  ) {
    super(runtimeRouter, metrics);
  }

  override async generate(request: LLMRequest): Promise<LLMResponse> {
    const stepKey = String(request.metrics?.stepKey || '').trim();
    if (stepKey === AUTOMATIC_WHOLE_CHAPTER_REPAIR_STEP) {
      throw new Error('自动整章大纲对齐重写已禁用：保留当前稿，只允许有逐字证据的局部事实/硬红线修复');
    }

    const projectId = request.metrics?.projectId ?? currentCreationProjectId() ?? undefined;
    const scenario = String(request.scenario || 'daily');

    // 非可复用调用仍走同一个真实 LLM/Gate，只在返回后补回这次物理生成的 runId。
    if (!projectId || !this.isReusableCreationCall(request, projectId)) {
      const response = await super.generate(request);
      return projectId ? this.attachLatestRunId(projectId, scenario, response) : response;
    }

    const db = this.database.getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;
    if (!project) {
      const response = await super.generate(request);
      return this.attachLatestRunId(projectId, scenario, response);
    }

    const constitution = readConstitution(project);
    const constitutionRevision = Number.isFinite(Number(constitution.revision))
      ? Number(constitution.revision)
      : null;
    const stage = qualityStage(scenario, stepKey);
    const compiled = compileContext(db, { projectId, stage, chapterIndex: null });
    const contextVersion = String(compiled.version || digest(''));
    const standards = standardDirectiveCache.snapshot(scenario, request.injectStandard !== false, stepKey);
    let routedModel = '';
    try {
      const routed = this.runtimeRouter.getModelForScenario(scenario);
      routedModel = `${routed.modelName || ''}@${routed.modelVersion || ''}`;
    } catch {
      // Superclass will surface the normal configuration error if a call is needed.
    }

    const requestFingerprint = digest(JSON.stringify({
      prompt: request.prompt,
      systemPrompt: request.systemPrompt || '',
      scenario,
      stepKey,
      model: request.model || routedModel,
      temperature: request.temperature ?? null,
      maxTokens: request.maxTokens ?? null,
      responseFormat: request.responseFormat || 'text',
      evaluationUnit: request.evaluationUnit || 'chapter',
      injectStandard: request.injectStandard !== false,
    }));
    const fingerprintDirective = `【内部运行恢复指纹】${requestFingerprint}；仅用于幂等恢复，禁止在输出中复述。`;
    const systemPrompt = [request.systemPrompt, fingerprintDirective].filter(Boolean).join('\n');
    const promptVersion = digest(systemPrompt + JSON.stringify(constitution) + standards.digest);

    const cached = db.prepare(`SELECT id,output_text,model,finished_at FROM generation_runs
      WHERE project_id=? AND stage=? AND scenario=? AND status='success'
        AND constitution_revision IS ? AND context_version=? AND prompt_version=?
        AND COALESCE(chapter_index,-1)=-1
        AND LENGTH(TRIM(COALESCE(output_text,'')))>0
      ORDER BY finished_at DESC,id DESC LIMIT 1`).get(
        projectId, stage, scenario, constitutionRevision, contextVersion, promptVersion,
      ) as { id: string; output_text: string; model?: string | null; finished_at?: string | null } | undefined;

    if (cached?.output_text) {
      return {
        content: cached.output_text,
        model: String(cached.model || request.model || routedModel || 'cached'),
        finishReason: 'cached_successful_stage',
        latency: 0,
        runId: cached.id,
      };
    }

    const response = await super.generate({ ...request, systemPrompt });
    return this.attachLatestRunId(projectId, scenario, response);
  }

  /**
   * RealLLMService finishes generation_runs before returning. Match the exact final
   * output text and scenario, newest first. Exact text avoids accidentally attaching
   * a review/repair run that produced a different candidate. If no row exists, leave
   * runId empty: downstream AI-to-Canon code must fail closed rather than invent provenance.
   */
  private attachLatestRunId(projectId: string, scenario: string, response: LLMResponse): LLMResponse {
    if (response.runId || !String(response.content || '').trim()) return response;
    const row = this.database.getDb().prepare(`SELECT id FROM generation_runs
      WHERE project_id=? AND scenario=? AND status='success' AND output_text=?
      ORDER BY finished_at DESC,id DESC LIMIT 1`).get(projectId, scenario, response.content) as { id: string } | undefined;
    return row?.id ? { ...response, runId: row.id } : response;
  }

  private isReusableCreationCall(request: LLMRequest, projectId?: string): boolean {
    if (!projectId || request.deferQualityGate !== true) return false;
    if (request.metrics?.chapterIndex != null) return false;
    const stepKey = String(request.metrics?.stepKey || '').trim();
    if (!stepKey) return false;
    const identity = `${String(request.scenario || '')} ${stepKey}`.toLowerCase();
    if (/idea|inspiration|writ|body|chapter|review|repair|refin|polish|enhance|adapt/.test(identity)) return false;
    return /world|outline|character|organization|foreshadow|timeline|entity|foundation|skeleton|planning|plan/.test(identity);
  }
}
