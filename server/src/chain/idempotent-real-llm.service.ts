import { Injectable, Logger } from '@nestjs/common';
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
import { LLM_TUNABLES } from '../config/llm-tunables';

const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const AUTOMATIC_WHOLE_CHAPTER_REPAIR_STEP = 'body_alignment_repair';

/**
 * The public provider token is still RealLLMService. This subclass keeps runtime
 * invariants at the single LLM boundary without adding a second router or quality system:
 * 1) exact successful creation/planning/review calls may be reused after recovery or duplicate orchestration;
 * 2) the historical automatic whole-chapter alignment rewrite is physically blocked;
 * 3) project-scoped outputs carry their generation_runs.id so downstream Canon commits
 *    can prove which exact gated generation produced the artifact;
 * 4) an exhausted transient transport failure gets one configurable outer recovery round
 *    with the exact same configured model/request, so a short socket reset does not abort
 *    the whole creation pipeline after RealLLM's single immediate network retry.
 *
 * Reuse is deliberately exact: prompt, system prompt, scenario, stepKey, model,
 * temperature, output budget, constitution revision, compiled context, standards and
 * chapter index must all match. Any real source/context change forces a new model call.
 */
@Injectable()
export class IdempotentRealLLMService extends RealLLMService {
  private readonly recoveryLogger = new Logger(IdempotentRealLLMService.name);

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

    // 非可复用调用仍走同一个真实 LLM/Gate，只在返回后按最终输出做原有的精确 runId 绑定。
    if (!projectId || !this.isReusableCreationCall(request, projectId)) {
      const response = await this.generateWithNetworkRecovery(request);
      return projectId ? this.attachLatestRunId(projectId, scenario, response) : response;
    }

    const db = this.database.getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;
    if (!project) {
      const response = await this.generateWithNetworkRecovery(request);
      return this.attachLatestRunId(projectId, scenario, response);
    }

    const constitution = readConstitution(project);
    const constitutionRevision = Number.isFinite(Number(constitution.revision))
      ? Number(constitution.revision)
      : null;
    const chapterIndex = request.metrics?.chapterIndex != null && Number.isFinite(Number(request.metrics.chapterIndex))
      ? Number(request.metrics.chapterIndex)
      : null;
    const stage = qualityStage(scenario, stepKey);
    const compiled = compileContext(db, { projectId, stage, chapterIndex });
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
      chapterIndex,
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

    const matchingRuns = () => db.prepare(`SELECT id,output_text,model,finished_at FROM generation_runs
      WHERE project_id=? AND stage=? AND scenario=? AND status='success'
        AND constitution_revision IS ? AND context_version=? AND prompt_version=?
        AND COALESCE(chapter_index,-1)=COALESCE(?,-1)
        AND LENGTH(TRIM(COALESCE(output_text,'')))>0
      ORDER BY finished_at DESC,id DESC LIMIT 2`).all(
        projectId, stage, scenario, constitutionRevision, contextVersion, promptVersion, chapterIndex,
      ) as Array<{ id: string; output_text: string; model?: string | null; finished_at?: string | null }>;

    const cached = matchingRuns()[0];
    if (cached?.output_text) {
      return {
        content: cached.output_text,
        model: String(cached.model || request.model || routedModel || 'cached'),
        finishReason: 'cached_successful_stage',
        latency: 0,
        runId: cached.id,
      };
    }

    const callStartedAt = new Date().toISOString();
    const response = await this.generateWithNetworkRecovery({ ...request, systemPrompt });
    if (response.runId) return response;

    // The structured creation path already has a complete deterministic fingerprint.
    // Bind provenance by that fingerprint, not by provider text formatting. Only the
    // single run completed during this physical call is eligible. Concurrent duplicate
    // matches remain ambiguous and therefore fail closed.
    const completed = matchingRuns().filter(row => String(row.finished_at || '') >= callStartedAt);
    return completed.length === 1 ? { ...response, runId: completed[0].id } : response;
  }

  /**
   * RealLLM already performs the immediate same-model transport retry. If that short
   * retry window is exhausted, recover once more at the provider boundary after a
   * configurable delay. This intentionally does not switch model/provider, loosen the
   * prompt, or swallow non-network failures. Each re-entry creates a fresh generation_run,
   * leaving the failed attempt auditable instead of pretending it succeeded.
   */
  private async generateWithNetworkRecovery(request: LLMRequest): Promise<LLMResponse> {
    const retries = Math.max(0, Math.floor(LLM_TUNABLES.NETWORK_RECOVERY_RETRIES));
    for (let recoveryAttempt = 0; ; recoveryAttempt += 1) {
      try {
        return await super.generate(request);
      } catch (error) {
        if (!this.isTransientNetworkFailure(error) || recoveryAttempt >= retries) {
          throw error;
        }
        const delayMs = Math.max(
          0,
          Math.floor(LLM_TUNABLES.NETWORK_RECOVERY_DELAY_MS * Math.pow(2, recoveryAttempt)),
        );
        this.recoveryLogger.warn(
          `[provider-network-recovery] 同配置模型恢复 ${recoveryAttempt + 1}/${retries}: `
          + `scenario=${request.scenario || 'daily'}, step=${request.metrics?.stepKey || 'unknown'}, delayMs=${delayMs}`,
        );
        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
  }

  private isTransientNetworkFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /网络连接失败\(|UND_ERR_SOCKET|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ConnectTimeout|EAI_AGAIN|ENETUNREACH|fetch failed|other side closed|socket hang up|Connection error|terminated/i.test(message);
  }

  /**
   * Non-reusable/user-facing calls keep the historical byte-for-byte output proof.
   * Structured creation calls use the stronger full request/context fingerprint above.
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
    const stepKey = String(request.metrics?.stepKey || '').trim();
    if (!stepKey) return false;
    const identity = `${String(request.scenario || '')} ${stepKey}`.toLowerCase();
    // Never cache user-facing prose or repair/polish operations. Those are mutable creative
    // outputs. Planning facts and evidence reviews are safe to reuse only when the complete
    // fingerprint above is byte-for-byte equivalent.
    if (/idea|inspiration|writ|body|repair|refin|polish|enhance|adapt/.test(identity)) return false;
    return /world|outline|chapter.?plan|character|organization|foreshadow|timeline|entity|foundation|skeleton|planning|plan|review|consistency|alignment|audit/.test(identity);
  }
}
