import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { jsonrepair } from 'jsonrepair';
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
const SINGLE_IDEA_CARD_MARKER = 'JSON 结构（ideas 必须恰好 1 项）';
const SINGLE_IDEA_CARD_RECOVERY_DIRECTIVE =
  '【结构恢复】上一响应没有满足本次唯一输出契约。不要换题、不要重选 premise、不要修改题材身份；仅把同一个已选题材按原请求完整输出为 {"ideas":[{...}]}，且 ideas 必须恰好 1 项。不要返回空数组、单独的 idea 字段、裸卡片或额外解释。';
const STORY_CARD_REVIEW_MARKER = '【候选故事卡】';
const STORY_CARD_REPAIR_MARKER = '重新生成故事卡，完全丢弃候选卡中的错误机制，只能使用已确认题材与世界规则。';
const STORY_CARD_REPAIR_FLOOR =
  '【同一候选局部修复·覆盖前文“重新生成”措辞】这里的“重新生成故事卡”只表示返回完整 JSON，不表示从零重写故事卡。必须以【当前候选故事卡】为唯一修复底稿，只修改【禁止出现的错误】逐条点名的 scene/字段及其直接依赖；未被点名且不依赖冲突机制的 coreConflict、protagonistDesire、turningPoint、reveal、ending 和其它 scenes 原样保留。每条 fix 都是强制合同：人数、数量、并列证据、前置动作、时点和触发条件必须完整落到对应 goal/conflict/outcome，不得再用“有人/若干/相关证据/按馆规”等模糊概括替代精确要件。不得新增另一套人物关系、真相、反转、结局或世界规则。';

/**
 * The public provider token is still RealLLMService. This subclass keeps runtime
 * invariants at the single LLM boundary without adding a second router or quality system:
 * 1) exact successful creation/planning/review calls may be reused after recovery or duplicate orchestration;
 * 2) the historical automatic whole-chapter alignment rewrite is physically blocked;
 * 3) project-scoped outputs carry their generation_runs.id so downstream Canon commits
 *    can prove which exact gated generation produced the artifact;
 * 4) an exhausted transient transport failure gets one configurable outer recovery round
 *    with the exact same configured model/request, so a short socket reset does not abort
 *    the whole creation pipeline after RealLLM's single immediate network retry;
 * 5) the one-premise/one-card idea structuring contract gets one technical shape recovery
 *    on the same premise instead of silently turning a malformed provider JSON shape into
 *    a missing user-requested idea card;
 * 6) a short-story-card audit keeps the exact audited candidate for the immediately
 *    following repair, preventing the repair call from rebuilding the whole card from
 *    premise+rules and creating a different conflict elsewhere.
 *
 * Reuse is deliberately exact: prompt, system prompt, scenario, stepKey, model,
 * temperature, output budget, constitution revision, compiled context, standards and
 * chapter index must all match. Any real source/context change forces a new model call.
 */
@Injectable()
export class IdempotentRealLLMService extends RealLLMService {
  private readonly recoveryLogger = new Logger(IdempotentRealLLMService.name);
  private readonly reviewedShortStoryCardByProject = new Map<string, string>();
  private static readonly MAX_REVIEWED_STORY_CARD_CACHE = 128;

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
    this.captureReviewedShortStoryCard(request, projectId);
    const effectiveRequest = this.withReviewedShortStoryCardForRepair(request, projectId);
    const effectiveStepKey = String(effectiveRequest.metrics?.stepKey || '').trim();
    const scenario = String(effectiveRequest.scenario || 'daily');

    // 非可复用调用仍走同一个真实 LLM/Gate，只在返回后按最终输出做原有的精确 runId 绑定。
    if (!projectId || !this.isReusableCreationCall(effectiveRequest, projectId)) {
      const response = await this.generateWithNetworkRecovery(effectiveRequest);
      return projectId ? this.attachLatestRunId(projectId, scenario, response) : response;
    }

    const db = this.database.getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;
    if (!project) {
      const response = await this.generateWithNetworkRecovery(effectiveRequest);
      return this.attachLatestRunId(projectId, scenario, response);
    }

    const constitution = readConstitution(project);
    const constitutionRevision = Number.isFinite(Number(constitution.revision))
      ? Number(constitution.revision)
      : null;
    const chapterIndex = effectiveRequest.metrics?.chapterIndex != null && Number.isFinite(Number(effectiveRequest.metrics.chapterIndex))
      ? Number(effectiveRequest.metrics.chapterIndex)
      : null;
    const stage = qualityStage(scenario, effectiveStepKey);
    const compiled = compileContext(db, { projectId, stage, chapterIndex });
    const contextVersion = String(compiled.version || digest(''));
    const standards = standardDirectiveCache.snapshot(scenario, effectiveRequest.injectStandard !== false, effectiveStepKey);
    let routedModel = '';
    try {
      const routed = this.runtimeRouter.getModelForScenario(scenario);
      routedModel = `${routed.modelName || ''}@${routed.modelVersion || ''}`;
    } catch {
      // Superclass will surface the normal configuration error if a call is needed.
    }

    const requestFingerprint = digest(JSON.stringify({
      prompt: effectiveRequest.prompt,
      systemPrompt: effectiveRequest.systemPrompt || '',
      scenario,
      stepKey: effectiveStepKey,
      chapterIndex,
      model: effectiveRequest.model || routedModel,
      temperature: effectiveRequest.temperature ?? null,
      maxTokens: effectiveRequest.maxTokens ?? null,
      responseFormat: effectiveRequest.responseFormat || 'text',
      evaluationUnit: effectiveRequest.evaluationUnit || 'chapter',
      injectStandard: effectiveRequest.injectStandard !== false,
    }));
    const fingerprintDirective = `【内部运行恢复指纹】${requestFingerprint}；仅用于幂等恢复，禁止在输出中复述。`;
    const systemPrompt = [effectiveRequest.systemPrompt, fingerprintDirective].filter(Boolean).join('\n');
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
        model: String(cached.model || effectiveRequest.model || routedModel || 'cached'),
        finishReason: 'cached_successful_stage',
        latency: 0,
        runId: cached.id,
      };
    }

    const callStartedAt = new Date().toISOString();
    const response = await this.generateWithNetworkRecovery({ ...effectiveRequest, systemPrompt });
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
   *
   * For the explicit one-premise/one-card idea request, a successful transport can still
   * return the wrong JSON envelope. That is a technical protocol failure, not evidence
   * that the selected premise is bad. We first normalize harmless equivalent envelopes;
   * if there is still no single card, we re-issue the exact same premise once with only
   * an output-shape reminder. A second invalid response is returned unchanged so the
   * existing controller fails closed instead of inventing a card or weakening quality.
   */
  private async generateWithNetworkRecovery(request: LLMRequest): Promise<LLMResponse> {
    const first = await this.generatePhysicalWithNetworkRecovery(request);
    if (!this.isSingleIdeaCardStructuringRequest(request)) return first;

    const normalizedFirst = this.normalizeSingleIdeaCardEnvelope(first);
    if (normalizedFirst) return normalizedFirst;

    this.recoveryLogger.warn(
      `[idea-shape-recovery] 同一已选 premise 的完整题材卡输出形状无效，执行一次同题材结构恢复: scenario=${request.scenario || 'daily'}`,
    );
    const recoveryRequest: LLMRequest = {
      ...request,
      systemPrompt: [request.systemPrompt, SINGLE_IDEA_CARD_RECOVERY_DIRECTIVE].filter(Boolean).join('\n'),
    };
    const recovered = await this.generatePhysicalWithNetworkRecovery(recoveryRequest);
    return this.normalizeSingleIdeaCardEnvelope(recovered) ?? recovered;
  }

  private async generatePhysicalWithNetworkRecovery(request: LLMRequest): Promise<LLMResponse> {
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

  private captureReviewedShortStoryCard(request: LLMRequest, projectId?: string): void {
    if (!projectId) return;
    const prompt = String(request.prompt || '');
    const markerIndex = prompt.indexOf(STORY_CARD_REVIEW_MARKER);
    if (markerIndex < 0 || !prompt.includes('只核对故事卡是否忠实于已确认题材')) return;
    const start = markerIndex + STORY_CARD_REVIEW_MARKER.length;
    const tail = prompt.slice(start);
    const endMarkers = ['检查人物姓名', '并按下述能力边界编译', '题材未明确的关系不得被故事卡擅自确定'];
    let end = tail.length;
    for (const marker of endMarkers) {
      const index = tail.indexOf(marker);
      if (index >= 0) end = Math.min(end, index);
    }
    const raw = tail.slice(0, end).trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!this.looksLikeShortStoryCard(parsed)) return;
      const normalized = JSON.stringify(parsed);
      this.reviewedShortStoryCardByProject.delete(projectId);
      this.reviewedShortStoryCardByProject.set(projectId, normalized);
      while (this.reviewedShortStoryCardByProject.size > IdempotentRealLLMService.MAX_REVIEWED_STORY_CARD_CACHE) {
        const oldest = this.reviewedShortStoryCardByProject.keys().next().value as string | undefined;
        if (!oldest) break;
        this.reviewedShortStoryCardByProject.delete(oldest);
      }
    } catch {
      // Audit still runs normally; an unparsable embedded candidate cannot be used as a repair base.
    }
  }

  private withReviewedShortStoryCardForRepair(request: LLMRequest, projectId?: string): LLMRequest {
    if (!projectId) return request;
    const prompt = String(request.prompt || '');
    if (!prompt.includes(STORY_CARD_REPAIR_MARKER)) return request;
    const candidate = this.reviewedShortStoryCardByProject.get(projectId);
    if (!candidate) return request;
    return {
      ...request,
      prompt: `${prompt}\n【当前候选故事卡（唯一修复底稿）】${candidate}\n${STORY_CARD_REPAIR_FLOOR}`,
    };
  }

  private isSingleIdeaCardStructuringRequest(request: LLMRequest): boolean {
    return String(request.scenario || '') === 'idea_generate'
      && request.responseFormat === 'json_object'
      && String(request.prompt || '').includes(SINGLE_IDEA_CARD_MARKER);
  }

  private normalizeSingleIdeaCardEnvelope(response: LLMResponse): LLMResponse | null {
    const source = String(response.content || '').trim();
    if (!source) return null;
    const cleaned = source
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      try {
        parsed = JSON.parse(jsonrepair(cleaned));
      } catch {
        return null;
      }
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && Array.isArray(parsed.ideas) && parsed.ideas.length === 1
      && this.looksLikeIdeaCard(parsed.ideas[0])) {
      return response;
    }

    let card: any = null;
    if (Array.isArray(parsed) && parsed.length === 1 && this.looksLikeIdeaCard(parsed[0])) {
      card = parsed[0];
    } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && this.looksLikeIdeaCard(parsed.idea)) {
      card = parsed.idea;
    } else if (this.looksLikeIdeaCard(parsed)) {
      card = parsed;
    }
    if (!card) return null;

    // The text has changed client-side, so any provider/run provenance tied to the raw
    // bytes must not be carried forward as if it were an exact output match.
    const { runId: _runId, ...rest } = response;
    return {
      ...rest,
      content: JSON.stringify({ ideas: [card] }),
      finishReason: response.finishReason
        ? `${response.finishReason}|normalized_single_idea_card`
        : 'normalized_single_idea_card',
    };
  }

  private looksLikeIdeaCard(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const card = value as Record<string, unknown>;
    const title = String(card.title || '').trim();
    const narrativeSignals = [card.hook, card.description, card.coreConflict, card.mainReversal]
      .filter(item => String(item || '').trim().length > 0).length;
    return title.length > 0 && narrativeSignals >= 2;
  }

  private looksLikeShortStoryCard(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const card = value as Record<string, unknown>;
    return ['coreConflict', 'protagonistDesire', 'turningPoint', 'reveal', 'ending']
      .every(field => String(card[field] || '').trim().length > 0)
      && Array.isArray(card.scenes)
      && card.scenes.length > 0;
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
