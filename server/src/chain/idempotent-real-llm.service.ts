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

/**
 * The public provider token is still RealLLMService. This subclass adds exactly
 * one concern at the boundary: successful creation/planning calls with identical
 * immutable inputs may be reused after restart/recovery. It does not introduce
 * another model router, quality gate or generation implementation.
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
    const projectId = request.metrics?.projectId ?? currentCreationProjectId() ?? undefined;
    if (!projectId || !this.isReusableCreationCall(request, projectId)) return super.generate(request);

    const db = this.database.getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;
    if (!project) return super.generate(request);

    const constitution = readConstitution(project);
    const constitutionRevision = Number.isFinite(Number(constitution.revision))
      ? Number(constitution.revision)
      : null;
    const stepKey = String(request.metrics?.stepKey || '');
    const scenario = String(request.scenario || 'daily');
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
    // beginRun persists a hash of systemPrompt + constitution + standard digest.
    // Put the full-request fingerprint into systemPrompt only for idempotent
    // structured creation calls so a different prompt/model can never collide.
    const fingerprintDirective = `【内部运行恢复指纹】${requestFingerprint}；仅用于幂等恢复，禁止在输出中复述。`;
    const systemPrompt = [request.systemPrompt, fingerprintDirective].filter(Boolean).join('\n');
    const promptVersion = digest(systemPrompt + JSON.stringify(constitution) + standards.digest);

    const cached = db.prepare(`SELECT output_text,model,finished_at FROM generation_runs
      WHERE project_id=? AND stage=? AND scenario=? AND status='success'
        AND constitution_revision IS ? AND context_version=? AND prompt_version=?
        AND COALESCE(chapter_index,-1)=-1
        AND LENGTH(TRIM(COALESCE(output_text,'')))>0
      ORDER BY finished_at DESC,id DESC LIMIT 1`).get(
        projectId, stage, scenario, constitutionRevision, contextVersion, promptVersion,
      ) as { output_text: string; model?: string | null; finished_at?: string | null } | undefined;

    if (cached?.output_text) {
      return {
        content: cached.output_text,
        model: String(cached.model || request.model || routedModel || 'cached'),
        finishReason: 'cached_successful_stage',
        latency: 0,
      };
    }

    return super.generate({ ...request, systemPrompt });
  }

  private isReusableCreationCall(request: LLMRequest, projectId?: string): boolean {
    if (!projectId || request.deferQualityGate !== true) return false;
    if (request.metrics?.chapterIndex != null) return false;
    const stepKey = String(request.metrics?.stepKey || '').trim();
    if (!stepKey) return false;
    const identity = `${String(request.scenario || '')} ${stepKey}`.toLowerCase();
    // Creative prose, review and repair need a fresh judgment/output when the
    // caller explicitly invokes them. Only deterministic creation/planning
    // artifacts are safe to reuse by exact frozen-input identity.
    if (/idea|inspiration|writ|body|chapter|review|repair|refin|polish|enhance|adapt/.test(identity)) return false;
    return /world|outline|character|organization|foreshadow|timeline|entity|foundation|skeleton|planning|plan/.test(identity);
  }
}
