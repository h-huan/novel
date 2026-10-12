import { reviewCharacterContracts } from '../modules/writing-quality/character-contract';
import { narrativeTrace } from '../modules/writing-quality/narrative-trace';
import { repairPrompt, executeRepair } from '../modules/writing-quality/repair-strategy-registry';
import { applyLocalPatches, compareRepair, repairRejectionDetails } from '../modules/writing-quality/local-repair';
import { isAutomaticQualityRepairIssue, isMissingStandardIssue, semanticEvidenceSources, verifySemanticEvidence, resolveExactCausalBasisSource, resolveQualityEvidence, qualityIssue, qualityGate } from '../modules/writing-quality/quality-issue';
import { buildChapterResponsibilityAuditPrompt, buildChapterResponsibilityRepairPrompt, describeChapterResponsibilityPlan, isEvidencedChapterResponsibilityConflict } from '../../shared/src/chapter-responsibility-review';
import { quotedText } from './quoted-text';
import { STORY_CAUSAL_REVIEW_POLICY, STORY_CAUSAL_STATE_POLICY } from '../../shared/src/system-workflow-rules.registry';
import { causalEvidenceAnchorOptions, causalExitResultAnchors, causalAuditRepairPrompt, materializeCausalAuditAnchors, validateCausalAudit, applyCausalAuditRepair, preserveCausalCountercheckAnchors } from '../modules/writing-quality/causal-review';
import { applySemanticEvidenceRepairs, semanticEvidenceRepairPrompt } from '../modules/writing-quality/semantic-evidence-repair';
import { buildExecutionStandard } from '../modules/project/creative-constitution';
import { classifyGateFailure, type GateFailureReport } from '../modules/writing-quality/gate-failure';
import { styleFingerprint } from '../modules/writing-quality/style-fingerprint';
import { missingDimensionJudgePrompt, parseStageScore, SCORE_DIMENSIONS, stageJudgePrompt } from '../modules/writing-quality/stage-score';
import { deterministicPlatformReview, partitionPlatformIssues } from '../modules/writing-quality/platform-quality-rules';
import type { QualityStage } from '../modules/writing-quality/quality-issue';
import { currentCreationProjectId, expectsProjectId } from '../common/creation-context';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import OpenAI, { type ClientOptions } from 'openai';
import { ILLMService } from './llm.interface';
import { LLMRequest, LLMResponse } from './chain.types';
import { ModelRouterService } from '../routing/model-router.service';
import { GenerationMetricsService } from '../modules/generation-metrics/generation-metrics.service';
import { standardDirectiveCache } from '../modules/module-standards/standard-directive.cache';
import { parseScoreReviewJson } from './review-json';
import { LLM_TUNABLES } from '../config/llm-tunables';
import { isEvaluationOutput, resolveScenarioRoute } from '../routing/scenario-taxonomy';
import { estimateTokens, PLANNING_TOKEN_WEIGHTS } from '../common/token-budget';
import { STRUCTURED_JSON_OUTPUT_CEILING, structuredTruncationError } from './structured-truncation';
import * as net from 'net';


/**
 * 支持在流式响应中回报真实 usage 的上游。未列出的 provider 不发送 stream_options，
 * 避免对严格的 OpenAI 兼容网关产生 400；这些 provider 走统一文本口径估算兜底。
 */
const STREAM_USAGE_PROVIDERS = new Set(['deepseek', 'openai', 'zhipu', 'alibaba']);

type RuntimeModel = {
  provider: string;
  apiModel: string;
  keyNames: string[];
  baseUrlNames: string[];
};

/** 上游真实 usage：reasoning token 也计入 completion_tokens。缺失才回退到统一文本口径估算。 */
type ModelUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

type ModelCallResult = {
  content: string;
  finishReason?: string;
  usage?: ModelUsage;
};

class GeneratedQualityGateError extends Error {
  /** 结构化标记：chain.controller 的重试循环靠它区分「Gate 拒绝」与「传输层故障」，不靠中文前缀嗅探。 */
  readonly gateRejection = true;
  constructor(readonly report: GateFailureReport, readonly generatedContent: string) {
    super(report.message);
    this.name = 'GeneratedQualityGateError';
  }
  /** 重跑一次生成能否改变结论（见 GateFailureReport.retryable）。 */
  get retryable(): boolean { return this.report.retryable; }
}

@Injectable()
export class RealLLMService implements ILLMService, OnApplicationBootstrap {
  private readonly logger = new Logger(RealLLMService.name);

  constructor(
    private readonly modelRouter: ModelRouterService,
    private readonly metrics: GenerationMetricsService,
  ) {}

  // ==================== 网络健壮性增强 ====================
  // 代理支持（可选）：若设置了 HTTPS_PROXY/HTTP_PROXY，则将 OpenAI 客户端的
  // fetch 实现替换为同包 undici 的 fetch + ProxyAgent，使受限网络（防火墙/GFW）
  // 下的请求能经代理出站。undici 为可选依赖，仅在配置代理时才加载。
  private proxyExtras: Partial<ClientOptions> | null = null;
  private proxyResolved = false;

  private hasProxyEnv(): boolean {
    return !!(
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy
    );
  }

  private async resolveProxyExtras(): Promise<Partial<ClientOptions>> {
    if (this.proxyResolved) return this.proxyExtras ?? {};
    this.proxyResolved = true;
    if (!this.hasProxyEnv()) {
      this.proxyExtras = {};
      return {};
    }
    const proxyUrl =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      '';
    try {
      // @ts-ignore undici 为可选依赖，仅在使用代理时需要
      const undici: any = await import('undici');
      const agent = new undici.ProxyAgent(proxyUrl);
      this.proxyExtras = { fetch: undici.fetch, fetchOptions: { dispatcher: agent } };
      this.logger.log(`[RealLLM] 检测到代理环境变量，已启用 HTTPS 代理: ${proxyUrl}`);
    } catch (e) {
      this.logger.warn(
        `[RealLLM] 已设置代理环境变量但无法加载 undici（请执行 pnpm add undici）：${e instanceof Error ? e.message : e}。代理未生效，将直连。`,
      );
      this.proxyExtras = {};
    }
    return this.proxyExtras ?? {};
  }

  /**
   * 把模糊的 "fetch failed" 网络错误挖到底层真实原因，返回可执行的排查建议。
   * 仅用于"无 HTTP 状态码"的连接层失败（DNS/防火墙/证书/超时）。
   */
  private describeNetworkError(err: any): { code: string; message: string; guidance: string } {
    let cur: any = err;
    let deepest: any = err;
    const codes: string[] = [];
    while (cur) {
      const code = cur.code || (typeof cur.errno === 'string' ? cur.errno : '');
      if (code) codes.push(code);
      deepest = cur;
      cur = cur.cause;
    }
    const code = codes[codes.length - 1] || '';
    const message = deepest?.message || err?.message || 'unknown';
    let guidance = '';
    if (/ENOTFOUND|EAI_AGAIN/.test(code)) {
      guidance = 'DNS 解析失败：本机无法解析该域名，请检查 DNS 设置/hosts，或确认 baseUrl 是否正确。';
    } else if (/ECONNREFUSED/.test(code)) {
      guidance = '连接被拒绝：目标地址/端口无服务，请检查 baseUrl 与端口是否正确。';
    } else if (/ETIMEDOUT|ConnectTimeout/.test(code)) {
      guidance = '连接超时：本机到该 API 的网络不通（可能被防火墙/GFW 拦截）。若身处受限网络，请设置 HTTPS_PROXY 后重启后端。';
    } else if (/ECONNRESET/.test(code)) {
      guidance = '连接被重置：请求被中间网络设备中断，可能是代理/防火墙或瞬时抖动，建议重试。';
    } else if (/UND_ERR_SOCKET/.test(code)) {
      guidance = '远端或中间链路关闭了连接；当前请求未取得完整响应。请稍后重试当前操作；若反复出现，再检查 API 服务状态和本机网络。';
    } else if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO|TLS/i.test(message + code)) {
      guidance = 'TLS/证书错误：无法验证服务器证书，请检查系统证书或代理的证书配置。';
    } else {
      guidance = '网络层连接失败（fetch failed）：可能是瞬时抖动或本机到 API 的网络不通。建议重试；若持续失败且身处受限网络，请设置 HTTPS_PROXY 代理后重启后端。';
    }
    return { code, message, guidance };
  }

  /** 启动网络预检：对配置了 Key 的提供商做一次 DNS+TCP 连通性探测（不阻塞启动）。 */
  private async probeConnectivity(): Promise<void> {
    if (this.hasProxyEnv()) return; // 走代理时直连探测不准，跳过
    const hosts = new Set<string>();
    const envProviders: Array<[string, string]> = [
      ['DEEPSEEK', process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'],
      ['OPENAI', process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'],
      ['ANTHROPIC', process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'],
      ['ZHIPU', process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'],
      ['ALIBABA', process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'],
    ];
    for (const [name, url] of envProviders) {
      if (process.env[`${name}_API_KEY`]) hosts.add(url);
    }
    try {
      const keys = this.modelRouter.getAllUserKeys?.() || [];
      for (const k of keys) {
        const url = k.baseUrl || this.getDefaultBaseUrl(this.resolveRuntimeModel(k.modelName).provider);
        if (url) hosts.add(url);
      }
    } catch { /* ignore */ }
    for (const url of hosts) {
      const ok = await this.checkHostReachable(url);
      if (!ok) {
        this.logger.warn(
          `⚠️ 启动网络预检失败：无法连接到 ${url}。若持续失败，请检查本机网络/防火墙，或在受限网络下设置 HTTPS_PROXY 后重启后端。`,
        );
      } else {
        this.logger.log(`网络预检通过：${url}`);
      }
    }
  }

  private checkHostReachable(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      let host: string;
      let port = 443;
      try {
        const u = new URL(url);
        host = u.hostname;
        port = u.port ? Number(u.port) : u.protocol === 'http:' ? 80 : 443;
      } catch {
        return resolve(false);
      }
      const socket = new net.Socket();
      const finish = (res: boolean) => {
        try { socket.destroy(); } catch { /* noop */ }
        resolve(res);
      };
      socket.setTimeout(5000);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
      socket.connect(port, host);
    });
  }

  getConfiguredMaxTokens(scenario: string): number {
    // 与模型/温度共用 resolveScenarioRoute（modelSceneTab 分类），
    // 不再按原始场景名直查 scenarios 表：同一场景两个答案就会让结构化输出被提前截断。
    const config = this.modelRouter.getConfig();
    const route = resolveScenarioRoute(config, scenario);
    const value = Number(route?.maxTokens ?? config.defaults?.maxTokens);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`模型输出配置无效: scenario=${scenario} 未配置有效的 maxTokens`);
    }
    return value;
  }

  // 等 ModelRouterService 恢复磁盘中的 BYOK 配置后再判断，避免启动时误报缺少 Key。
  async onApplicationBootstrap() {
    const available = await this.isAvailable();
    if (!available) {
      this.logger.warn(
        '⚠️ 未配置任何 LLM API Key！所有 AI 功能将失败。\n' +
        '请在应用「设置」页面添加 API Key（BYOK），或在环境变量中设置 DEEPSEEK_API_KEY / LLM_API_KEY。\n' +
        '获取 DeepSeek API Key: https://platform.deepseek.com'
      );
    } else {
      this.logger.log('LLM API Key 已配置，AI 功能可用');
    }
    // 不阻塞启动：后台做一次网络预检，连不上立刻告警
    void this.probeConnectivity();
  }

  /**
   * 检查指定场景的模型是否已配置。配置什么模型就用什么模型；
   * 场景未配置时按当前模式继承日常模型；日常模型也未配置时抛出明确错误。
   * 在创建项目等关键操作前调用，提前提醒用户配置，而不是生成到一半才失败。
   */
  assertScenarioModelConfigured(scenario: string): { modelName: string; modelVersion: string } {
    try {
      const routed = this.modelRouter.getModelForScenario(scenario || 'daily');
      return { modelName: routed.modelName, modelVersion: routed.modelVersion };
    } catch (error) {
      const started = Date.now();
      const run = this.metrics?.beginRun?.(currentCreationProjectId() ?? undefined, scenario, '模型配置预检', undefined, 'configuration_check');
      if (run) this.metrics.finishRun(run.id, 'failed', started, undefined, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const run = this.metrics?.beginRun?.(request.metrics?.projectId ?? currentCreationProjectId() ?? undefined, request.scenario || 'daily', request.prompt, request.systemPrompt, request.metrics?.stepKey, request.metrics?.chapterIndex, request.injectStandard !== false);
    const enriched = run?.constitution ? { ...request, systemPrompt: [request.systemPrompt,
      '【项目唯一创作宪法；所有生成内容必须继承】', JSON.stringify(run.constitution),
      ...(request.scenario === 'long-novel-flexible-outline' && run.context
        ? ['【框架规划与评审共用的已确认来源快照】以下世界规则、角色、伏笔与既有事实是本次规划的共同输入。条件、证据来源、埋设与回收位置须无损继承；候选不能覆盖已确认事实。', run.context] : []),
      ...(run.lessons || [])].filter(Boolean).join('\n') , metrics: { ...request.metrics, runId: run.id } } : request;
    let generatedOutput: string | undefined;
    try {
      const response = await this.generateInternal(enriched);
      if (run && response.model) this.metrics.setRunModel?.(run.id, response.model);
      generatedOutput = response.content;
      if (request.planningResponsibilityPreflight && run?.constitution && !request.deferQualityGate) {
        response.content = await this.compileVerifiedResponsibilities(run, enriched, response.content);
        generatedOutput = response.content;
      }
      if (!isEvaluationOutput(request.scenario, request.metrics?.stepKey)
        && !request.deferQualityGate && run?.constitution && ['world', 'character', 'outline', 'chapter', 'refinement'].includes(run.stage)) {
        response.content = await this.evaluateGeneratedRun(run, request, response.content);
        generatedOutput = response.content;
      }
      if (run) this.metrics.finishRun(run.id, 'success', start, response.content, undefined, response.model);
      return response;
    } catch (error) {
      if (run) this.metrics.finishRun(run.id, 'failed', start, generatedOutput, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** Reuse creation's responsibility audit at the fixed framework entry. */
  private async compileVerifiedResponsibilities(run: NonNullable<ReturnType<GenerationMetricsService['beginRun']>>, request: LLMRequest, content: string): Promise<string> {
    const reject = (message: string, incomplete = false): never => {
      throw new GeneratedQualityGateError(classifyGateFailure({ evaluationStatus: incomplete ? 'not_evaluated' : 'evaluated',
        topic: 'quality_gate', gateStatus: incomplete ? 'not_evaluated' : 'blocked',
        buckets: incomplete ? { review_incomplete: ['ARCH-005上游职责：' + message] } : { outline_alignment: ['ARCH-005上游职责：' + message] } }), content);
    };
    let plan: any;
    try { plan = JSON.parse(content); } catch { return reject('职责规划JSON不完整，未展开下游', true); }
    const structural = describeChapterResponsibilityPlan(plan);
    if (structural.length) return reject(structural.join('；'));
    const original = plan.chapterResponsibilities;
    const sources = run.context || '{}';
    const executionStandard = buildExecutionStandard(run.constitution!).directive;
    const brief = JSON.stringify(run.constitution!.confirmedStory || {});
    const audit = async (protocolAttempt = 0, failedResponse = '', protocolError = ''): Promise<any[]> => {
      const anchors = [...causalEvidenceAnchorOptions(JSON.stringify(plan), { project_context: sources }),
        ...plan.chapterResponsibilities.map((chapter: any) => ({ id: `chapter:c${chapter.chapter}:task`, source: 'body', text: chapter.responsibility }))];
      const byId = new Map(anchors.map(anchor => [anchor.id, anchor]));
      const response = await this.generateInternal({ ...request, scenario: 'review',
        prompt: buildChapterResponsibilityAuditPrompt({ executionStandard,
          creativeBrief: brief, shortStoryCard: run.constitution!.confirmedStory, worldContinuityDirective: '\n【冻结世界与已确认来源】' + sources,
          plan, includeSharedPolicies: false, entryExitContract: true })
          + '\n【逐字证据地址】' + JSON.stringify(anchors)
          + '\n不要手抄或拼接引文。conditionChecks使用taskAnchorId（必须chapter:c本章号:task）与bridgeAnchorIds数组替代taskEvidence/bridgeEvidence/bridgeSource；supported须至少一项body地址写出当前规划中实际取得、恢复或自主执行该条件的动作，另可引用世界规则证明机制允许。世界允许某种授权不等于人物已经取得；prerequisites仅重复资源名称不能证明取得，过去取得也不能证明已过期或被撤销后仍有效。找不到当前有效取得动作时保留gap，不能以世界描述代替。contradictions同样使用taskAnchorId及ruleAnchorIds（project_context中的规则原文地址）替代task/ruleEvidence，其它字段保留。系统按编号提取原文，未知编号仍判未完成。'
          + (protocolAttempt ? '\n【一次引用协议纠错】原评审：' + failedResponse + '\n校验错误：' + protocolError
            + '\n只补齐缺项或纠正逐字证据地址。原有consistent、问题成员、章号、判据、冲突、保留目标、fix和已给出的条件状态及理由必须保留，不重新评判、不增删问题。supported仅引用世界规则仍不完整，必须另外选择当前计划内实际取得条件的body地址；无真实地址则不能宣称纠错通过。返回完整原评审JSON。' : ''), responseFormat: 'json_object', temperature: 0,
        maxTokens: LLM_TUNABLES.QUALITY_REVIEW_MAXTOKENS, metrics: { ...request.metrics, stepKey: 'framework_responsibility_preflight' } });
      try {
      let value: any;
      try { value = JSON.parse(response.content); } catch { return reject('边界审查未返回完整JSON', true); }
      if (protocolAttempt) {
        let previous: any;
        try { previous = JSON.parse(failedResponse); } catch {}
        const same = (left: any, right: any, keys: string[]) => keys.every(key => left?.[key] === undefined || JSON.stringify(left[key]) === JSON.stringify(right?.[key]));
        if (previous && ((typeof previous.consistent === 'boolean' && value.consistent !== previous.consistent)
          || (Array.isArray(previous.contradictions) && (!Array.isArray(value.contradictions) || value.contradictions.length !== previous.contradictions.length
            || previous.contradictions.some((row: any, index: number) => !same(row, value.contradictions[index], ['chapter', 'criterion', 'conflict', 'retain', 'fix']))))
          || (Array.isArray(previous.conditionChecks) && previous.conditionChecks.some((row: any) => !same(row,
            value.conditionChecks?.find((check: any) => check.chapter === row.chapter), ['chapter', 'status', 'reason']))))) {
          return reject('引用纠错改变了原条件状态或问题清单，停止下游', true);
        }
      }
      for (const check of Array.isArray(value?.conditionChecks) ? value.conditionChecks : []) {
        if (check?.taskAnchorId) check.taskEvidence = check.taskAnchorId === `chapter:c${check.chapter}:task` ? byId.get(check.taskAnchorId)?.text : '';
        if (Array.isArray(check?.bridgeAnchorIds)) {
          const picked = check.bridgeAnchorIds.map((id: string) => byId.get(id));
          check.anchoredBridgeVerified = picked.some((anchor: any) => anchor?.source === 'body') && picked.every((anchor: any) => anchor
            && resolveQualityEvidence(anchor.source === 'body' ? JSON.stringify(plan) : sources, anchor.text).verified);
        }
      }
      for (const finding of Array.isArray(value?.contradictions) ? value.contradictions : []) {
        if (finding?.taskAnchorId) finding.task = finding.taskAnchorId === `chapter:c${finding.chapter}:task` ? byId.get(finding.taskAnchorId)?.text : '';
        if (Array.isArray(finding?.ruleAnchorIds)) {
          const picked = finding.ruleAnchorIds.map((id: string) => byId.get(id));
          finding.anchoredRuleEvidence = picked.length > 0 && picked.every((anchor: any) => anchor?.source === 'project_context'
            && resolveQualityEvidence(sources, anchor.text).verified) ? picked.map((anchor: any) => anchor.text) : [];
          finding.ruleEvidence = finding.anchoredRuleEvidence.join('\n');
        }
      }
      const protocolErrors: string[] = [];
      const contradictions = Array.isArray(value.contradictions) ? value.contradictions : [];
      if (typeof value?.consistent !== 'boolean' || !Array.isArray(value.contradictions)
        || value.consistent !== (contradictions.length === 0)) protocolErrors.push('边界审查结论与问题清单不一致');
      if (!Array.isArray(value.conditionChecks) || value.conditionChecks.length !== original.length
        || new Set(value.conditionChecks.map((check: any) => check?.chapter)).size !== original.length
        || value.conditionChecks.some((check: any) => {
          const chapter = plan.chapterResponsibilities[Number(check?.chapter) - 1];
          return !Number.isInteger(check?.chapter) || !chapter
            || !resolveQualityEvidence(chapter.responsibility, check.taskEvidence).verified
            || typeof check.reason !== 'string' || check.reason.trim().length < 8
            || !['supported', 'gap', 'not_required'].includes(check.status)
            || (check.status === 'gap' && !contradictions.some((finding: any) => finding.chapter === check.chapter))
            || (check.status === 'supported' && !(Array.isArray(check.bridgeAnchorIds) ? check.anchoredBridgeVerified
              : resolveQualityEvidence(check.bridgeSource === 'body' ? JSON.stringify(plan)
                : check.bridgeSource === 'project_context' ? sources : '', check.bridgeEvidence).verified));
        })) protocolErrors.push('逐章条件核对缺少取得路径、有效性证据或完整覆盖；supported至少需要一个写出实际取得动作的body地址，不能只引用project_context');
      for (const finding of contradictions) {
        const evidence = [...(finding.anchoredRuleEvidence || []), finding.ruleEvidence, ...quotedText(String(finding.ruleEvidence || '')).map(x => x.text)];
        if (!isEvidencedChapterResponsibilityConflict(finding) || finding.chapter > original.length
          || !resolveQualityEvidence(JSON.stringify(plan), finding.task).verified
          || !evidence.some(quote => resolveQualityEvidence(sources, quote).verified || resolveQualityEvidence(executionStandard, quote).verified)) {
          protocolErrors.push('边界审查缺少当前任务与冻结来源的逐字双边证据：第' + finding.chapter
            + '章ruleAnchorIds必须全部来自真实project_context，不能混入body或未知地址：' + JSON.stringify(finding.ruleAnchorIds || []));
        }
      }
      if (protocolErrors.length) return reject(protocolErrors.join('；'), true);
      return contradictions;
      } catch (error) {
        if (!protocolAttempt && error instanceof GeneratedQualityGateError && error.report.status === 503) {
          return audit(1, response.content, error.message);
        }
        throw error;
      }
    };
    const proveExitStates = async () => {
      const checked = await this.auditPlanningActions(run, { ...request, planningSources: {} },
        JSON.stringify({ volumes: [{ chapters: plan.chapterResponsibilities.map((chapter: any) =>
          ({ ...chapter, chapterNumber: chapter.chapter, chapterFunction: 'climax' })) }] }), 'exitState');
      if (!checked.verified) return reject('出口状态因果核对未完成：' + checked.errors.join('；'), true);
      return checked.issues.map(issue => {
        const chapter = plan.chapterResponsibilities.find((entry: any) => entry.chapter === issue.chapterNumber);
        if (!chapter) return reject('出口状态问题缺少实际章号', true);
        return { chapter: chapter.chapter, criterion: 'QLT-003', task: chapter.responsibility, conflict: issue.summary,
          ruleEvidence: STORY_CAUSAL_REVIEW_POLICY, retain: chapter.exitState,
          fix: '调整本章行动路径，补足以下决定结果的必要条件：' + issue.summary + '。沿已有资源、权限和人物选择实现既定目标，不改变冻结规则，不追加解释段。' };
      });
    };
    const findings = [...await audit(), ...await proveExitStates()];
    if (!findings.length) return content;
    const contracts = findings.map((finding, index) => ({ issueIndex: index + 1, chapters: [finding.chapter],
      forbiddenTask: finding.task, failureReason: finding.conflict,
      requiredReplacement: finding.fix, retain: finding.retain, criterion: finding.criterion, ruleEvidence: finding.ruleEvidence }));
    const repaired = await this.generateInternal({ ...request, scenario: 'outline', temperature: 0,
      prompt: buildChapterResponsibilityRepairPrompt({ strategyDirective: '只修已举证的职责条件及其后续依赖；保留原有规模、标题、功能、世界规则、真相和结局',
        issueContracts: contracts, currentPlan: plan, creativeBrief: brief, shortStoryCard: run.constitution!.confirmedStory,
        worldContinuityDirective: '\n【冻结世界与已确认来源】' + sources, requiredChapterCount: original.length,
        includeSharedPolicies: false, entryExitContract: true }), responseFormat: 'json_object',
      metrics: { ...request.metrics, stepKey: 'framework_responsibility_repair' } });
    let replacement: any;
    try { replacement = JSON.parse(repaired.content); } catch { return reject('职责修订JSON不完整，未展开下游', true); }
    if (describeChapterResponsibilityPlan(replacement).length || replacement.chapterResponsibilities.length !== original.length
      || !Array.isArray(replacement.resolutions) || replacement.resolutions.length !== contracts.length
      || replacement.resolutions.some((row: any) => !Array.isArray(row?.chapters) || !row.chapters.length
        || row.chapters.some((chapter: unknown) => !Number.isInteger(chapter) || Number(chapter) < 1 || Number(chapter) > original.length)
        || ['removedMechanism', 'replacementMechanism', 'ruleEvidence'].some(field => typeof row?.[field] !== 'string' || !row[field].trim()))
      || new Set(replacement.resolutions.map((row: any) => row.issueIndex)).size !== contracts.length
      || contracts.some(contract => !replacement.resolutions.some((row: any) => row.issueIndex === contract.issueIndex))) {
      return reject('职责修订丢失章节、条件或修复合同，未展开下游', true);
    }
    const earliest = Math.min(...findings.map(finding => finding.chapter));
    const stable = (value: any): any => Array.isArray(value) ? value.map(stable)
      : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
    if (replacement.chapterResponsibilities.some((chapter: any, index: number) => chapter.title !== original[index].title
      || chapter.function !== original[index].function
      || (index + 1 < earliest && JSON.stringify(stable(chapter)) !== JSON.stringify(stable(original[index]))))) {
      return reject('职责修订改变了未受影响章节或既有标题/功能，未展开下游');
    }
    plan = { ...plan, chapterResponsibilities: replacement.chapterResponsibilities };
    const remaining = [...await audit(), ...await proveExitStates()];
    if (remaining.length) return reject('一次职责修订后仍未通过，停止下游：' + remaining.map(finding => finding.conflict).join('；'));
    return JSON.stringify(plan);
  }

  async validateGeneratedContent(projectId: string, chapterIndex: number, content: string, context: string,
    validateRepairedContent?: (candidate: string) => Promise<unknown>): Promise<string> {
    const start = Date.now();
    const run = this.metrics.beginRun(projectId, 'writing', context, undefined, 'body_final_gate', chapterIndex);
    let finalContent = content;
    const reviewed = new Set<string>();
    const validateOnce = validateRepairedContent ? async (candidate: string) => {
      if (!reviewed.has(candidate)) {
        await validateRepairedContent(candidate);
        reviewed.add(candidate);
      }
    } : undefined;
    try {
      const checked = await this.evaluateGeneratedRun(run, { prompt: context, scenario: 'writing', metrics: { projectId, chapterIndex } }, content, validateOnce);
      finalContent = checked;
      if (checked !== content && validateOnce) {
        try {
          await validateOnce(checked);
        } catch (error) {
          this.metrics.blockRunValidation(run.id, error instanceof Error ? error.message : String(error));
          throw error;
        }
      }
      this.metrics.finishRun(run.id, 'success', start, checked);
      return checked;
    } catch (error) {
      this.metrics.finishRun(run.id, 'failed', start, finalContent, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** Uses the production assessor/executors, without replacing live chapter reports or learning from benchmark repairs. */
  async evaluateBenchmarkSample(projectId: string, chapterIndex: number | null, content: string, repair: boolean) {
    const started = Date.now();
    const run = this.metrics.beginRun(projectId, 'writing', 'benchmark-v1', undefined, 'benchmark', chapterIndex);
    const request: LLMRequest = { prompt: '对真实人工标注样本独立评审；人工标签不会传给评审器。', scenario: 'writing', metrics: { projectId, chapterIndex: chapterIndex ?? undefined } };
    try {
      const before = await this.assessGeneratedRun(run, request, content);
      let after: typeof before | null = null; let accepted = false; let introducedIssue = false;
      const repairAttempted = repair && before.issues.some(i => i.evaluation === 'evidenced' && ['high','blocking'].includes(i.severity));
      if (repairAttempted) {
        const strategyId = this.metrics.selectRepairStrategy(projectId, before.issues, run.id);
        try {
          const response = await this.generateInternal({ ...request, scenario: 'refinement', responseFormat: 'json_object',
            systemPrompt: [request.systemPrompt, '【项目唯一创作宪法；所有生成内容必须继承】',
              JSON.stringify(run.constitution), ...(run.lessons || [])].filter(Boolean).join('\n'),
            prompt: repairPrompt(strategyId, content) + '\n创作宪法：' + JSON.stringify(run.constitution) + '\n上下文：' + run.context + '\n问题：' + JSON.stringify(before.issues) + '\n原文：' + content });
          const candidate = executeRepair(strategyId, { content, issues: before.issues, contracts: JSON.parse(run.context).characterContracts || [] }, JSON.parse(response.content).patches);
          after = await this.assessGeneratedRun(run, request, candidate);
          accepted = compareRepair(before, after).accepted;
          if (strategyId === 'platform_metric_patch' && after.issues.filter(i => i.ruleId.startsWith('platform.')).length >= before.issues.filter(i => i.ruleId.startsWith('platform.')).length) accepted = false;
          introducedIssue = after.issues.some(i => i.evaluation === 'evidenced' && !before.issues.some(old => old.ruleId === i.ruleId));
        } catch (error) {
          accepted = false;
          this.logger.warn(`基准精修未应用 run=${run.id} strategy=${strategyId} reason=${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (!this.metrics.runIsCurrent(run.id, projectId)) throw new Error('评测期间项目上下文发生变化');
      this.metrics.finishRun(run.id, 'success', started, content);
      return { runId: run.id, before, after, repairAttempted, accepted, introducedIssue };
    } catch (error) {
      this.metrics.finishRun(run.id, 'failed', started, content, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async evaluateGeneratedRun(run: ReturnType<GenerationMetricsService['beginRun']>, request: LLMRequest, content: string,
    validateCandidate?: (candidate: string) => Promise<unknown>): Promise<string> {
    const before = await this.assessGeneratedRun(run, request, content);
    const gate = this.metrics.saveRunScore(run.id, run.projectId!, before);
    const repairIssues=before.issues.filter(isAutomaticQualityRepairIssue);
    const repairable = !before.issues.some(issue => issue.requiredPlanningCondition)
      && this.metrics.runIsCurrent(run.id, run.projectId!) && repairIssues.length>0;
    let rejectedCandidateDetails='';
    if (repairable) {
      const repairStarted = Date.now();
      const strategyId = this.metrics.selectRepairStrategy(run.projectId!, repairIssues, run.id);
      let candidate: string | null = null;
      let after: typeof before | null = null;
      let accepted = false;
      let reason = '';
      try {
        const repaired = await this.generateInternal({ ...request, scenario: 'refinement', responseFormat: 'json_object', maxTokens: LLM_TUNABLES.QUALITY_REPAIR_MAXTOKENS,
          // 精修是同一次生成的续写，必须与主生成（generate() 的 enriched.systemPrompt）注入同一份
          // 创作宪法与已验证经验。原先这里 systemPrompt 为空，等于精修链路没有执行标准：
          // 宪法只出现在 prompt 文本里，不参与 systemPrompt 注入。配置是前提，不降级。
          systemPrompt: [request.systemPrompt, '【项目唯一创作宪法；所有生成内容必须继承】',
            JSON.stringify(run.constitution), ...(run.lessons || [])].filter(Boolean).join('\n'),
          prompt: repairPrompt(strategyId, content) + '\n创作宪法：'
            + JSON.stringify(run.constitution) + '\n已确认上下文：' + run.context
            + '\n质量问题：' + JSON.stringify(repairIssues) + '\n原文：' + content,
          metrics: { ...request.metrics, runId: run.id, stepKey: 'quality_local_repair' },
        });
        candidate = executeRepair(strategyId, { content, issues: repairIssues, contracts: JSON.parse(run.context || '{}').characterContracts || [], structured: request.responseFormat === 'json_object' }, JSON.parse(repaired.content).patches);
        after = await this.assessGeneratedRun(run, request, candidate);
        ({ accepted, reason } = compareRepair(before, after));
        if (accepted && strategyId === 'platform_metric_patch'
          && after.issues.filter(i => i.ruleId.startsWith('platform.')).length >= before.issues.filter(i => i.ruleId.startsWith('platform.')).length) {
          accepted = false; reason = '平台确定性指标未改善，回滚';
        }
        if (!this.metrics.runIsCurrent(run.id, run.projectId!)) { accepted = false; reason = '生成期间创作配置或上下文变化，回滚'; }
        // Complete chapter acceptance precedes recording or learning an accepted patch.
        if (accepted && candidate !== null && validateCandidate) await validateCandidate(candidate);
      } catch (error) {
        accepted = false;
        reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`精修未应用 run=${run.id} project=${run.projectId} strategy=${strategyId} reason=${reason}`);
      }
      const repairId = this.metrics.recordRepair(run.id, run.projectId!, content, candidate, before, after, accepted, reason,
        strategyId, Date.now() - repairStarted);
      if(!accepted)rejectedCandidateDetails=repairRejectionDetails(after,reason||'未证明改善');
      if (!accepted) this.logger.warn(`精修回滚 run=${run.id} project=${run.projectId} strategy=${strategyId} reason=${reason || '未证明改善'}`);
      if (accepted && candidate !== null && after) {
        this.metrics.saveRunScore(run.id, run.projectId!, after);
        this.metrics.learnAcceptedRepair(run.projectId!, repairId, before, after);
        return candidate;
      }
    }
    if (!gate.passed) {
      const openIssues = before.issues.filter(i => i.status === 'open');
      const blocking = openIssues.filter(i => i.severity === 'blocking' || i.requiredPlanningCondition);
      this.logger.warn(`质量 Gate 阻断 run=${run.id} project=${run.projectId} stage=${run.stage} gate=${gate.status} `
        + `blocking=${blocking.map(i => `${i.ruleId}(${i.evaluation})`).join(',') || '无'} `
        + `详情=${blocking.map(i => i.message).join('；') || '评审证据不足'}`);
      // 分区只是文案归类，不是降级：severity / status / 是否阻断全部原样保留。
      // 此前把【全部 issues】（含 high 与未评估项）拼成一条长串，于是
      // 「项目卡片没设置分类/视角」（未执行标准）和「对话占比不足」「同一信息点反复重述」
      // （正文写得不好）混在同一句里，读起来像文章质量差——这正是用户反复看到的报错形态。
      // 分类口径与 chain.controller 共用唯一的 classifyGateFailure，两处不再各写一套中文前缀；
      // 分类只决定文案与状态码，severity / 是否阻断由 gate.passed 决定，原样保留。
      const missingStandard = blocking.filter(isMissingStandardIssue);
      const planningConditions = blocking.filter(issue => issue.requiredPlanningCondition);
      const proseQuality = blocking.filter(issue => !isMissingStandardIssue(issue) && !issue.requiredPlanningCondition);
      const report = classifyGateFailure({
        evaluationStatus: gate.status === 'not_evaluated' && blocking.length === 0 ? 'not_evaluated' : 'evaluated',
        topic: 'quality_gate',
        gateStatus: gate.status,
        buckets: {
          missing_standard: missingStandard.map(issue => issue.message),
          prose_hardline: proseQuality.map(issue => `${issue.ruleId}：${issue.message}`),
          outline_alignment: planningConditions.map(issue => `${issue.ruleId}：${issue.message}`),
          // 与既有行为一致：只有当 blocking 一条都没归出去时，才算「评审证据不足」，而不是把 blocking 重复报一遍。
          review_incomplete: (missingStandard.length || proseQuality.length || planningConditions.length)
            ? []
            : [
                ...openIssues.filter(issue => issue.severity !== 'info').map(issue => `${issue.ruleId}：${issue.message}`),
                ...Object.entries(before.dimensions).filter(([, value]) => value.status === 'not_evaluated')
                  .map(([key, value]) => `${key}：${value.reason}`),
              ],
        },
      });
      if(rejectedCandidateDetails){report.sections.push(rejectedCandidateDetails);report.detail+=' | '+rejectedCandidateDetails;report.message+='\n'+rejectedCandidateDetails;}
      throw new GeneratedQualityGateError(report, content);
    }
    return content;
  }

  private async assessGeneratedRun(run: NonNullable<ReturnType<GenerationMetricsService['beginRun']>>, request: LLMRequest, content: string) {
    if (!run.constitution) throw new Error('缺少创作宪法');
    // 判定单元随请求下传：片段调用方（二次加工分块改写、逐段精修、质检局部精修）声明 segment；
    // 整章生成与整章修复不声明，缺省即整章口径 —— 缺省不放宽任何整章级判据。
    const input = { projectId: run.projectId!, runId: run.id,
      stage: run.stage as QualityStage, content, constitution: run.constitution,
      reviewContext: request.planningSources ? JSON.stringify({ ...JSON.parse(run.context || '{}'), planningSources: request.planningSources }) : run.context,
      enforcePlanningConditions: run.stage === 'outline' && !!request.planningSources?.volumes,
      unit: request.evaluationUnit,
      contracts: JSON.parse(run.context || '{}').characterContracts || [] };
    const contractReview = reviewCharacterContracts(input, JSON.parse(run.context || '{}').characterContracts || []);
    const trace = narrativeTrace(content, run.previousChapters);
    const reviewContext = '\n角色归属证据与契约：' + JSON.stringify(contractReview) + '\n叙事风险模型（不是结论）：' + JSON.stringify(trace)
      + '\n【项目事实依据：basisSource=project_context，仅限下段原文】\n' + input.reviewContext
      + (request.planningSources ? '\n【本次已通过的前序规划：basisSource=chapter_plan】\n' + JSON.stringify(request.planningSources) : '')
      + (input.enforcePlanningConditions ? '\n【展开正文前的必要条件审查】当前动作、人物位置、关键物件或有效权限确有必要因果缺口时，使用evidenceKind=causal_gap并给双边原文依据；这类缺口不能仅按文风建议评分。普通自主动作不强加无来源程序，数字资料可共享，不能把“交出”自行理解为销毁所有副本；时间区间有交集不等于事件顺序冲突，须引用明确互斥的同一事件与时点。' : '')
      + '\n【本次生成提示，不能把其中的世界规则误标为execution_standard】\n' + request.prompt
      + '\n【执行标准依据：basisSource=execution_standard，仅限下段原文】\n' + buildExecutionStandard(run.constitution).directive
      + (['chapter', 'refinement'].includes(run.stage)
        ? '\n最近三章文体比较材料（仅依据提供范围比较人物声音、段落结构及叙述习惯；未提供的章节不可推断）：'
          + JSON.stringify(run.previousChapters.slice(0, 3)) : '');
    let combinedRaw: any = null;
    let score = parseStageScore(null, input);
    const assessmentDiagnostics: Array<Record<string, unknown>> = [];
    const evidenceSources = semanticEvidenceSources(content, input.reviewContext || '', buildExecutionStandard(run.constitution).directive);
    for (let reviewAttempt = 0; reviewAttempt < 2; reviewAttempt += 1) {
      const missing = SCORE_DIMENSIONS.filter(key => score.dimensions[key].status === 'not_evaluated');
      const pendingIssues: any[] = Array.isArray(combinedRaw?.issues) ? combinedRaw.issues : [];
      const invalidIndexes = pendingIssues.flatMap((issue, index) => verifySemanticEvidence(issue, content, evidenceSources).verified ? [] : [index]);
      if (reviewAttempt > 0 && missing.length === 0 && invalidIndexes.length === 0) break;
      let rawResponse = '';
      try {
        const judged = await this.generateInternal({
          // A malformed full review has no trustworthy finding list. A
          // dimensions-only completion cannot replace that full review.
          prompt: reviewAttempt === 0 || combinedRaw === null
            ? stageJudgePrompt(content, reviewContext, run.constitution, run.stage as QualityStage, request.evaluationUnit)
            : missingDimensionJudgePrompt(content, reviewContext, run.constitution, run.stage as QualityStage, missing)
              + (invalidIndexes.length ? '\n' + semanticEvidenceRepairPrompt(pendingIssues, invalidIndexes, content, evidenceSources).systemPrompt
                + '\n' + semanticEvidenceRepairPrompt(pendingIssues, invalidIndexes, content, evidenceSources).prompt
                + '\n合并上述输出为单个JSON对象，顶层包含dimensions与repairs；dimensions只补缺项，repairs只补原问题引用，不新增、删除或改判问题。' : ''),
          scenario: 'review', responseFormat: 'json_object', temperature: 0, maxTokens: LLM_TUNABLES.QUALITY_REVIEW_MAXTOKENS,
          maxEmptyRetries: 1,
          metrics: { ...request.metrics, runId: run.id, stepKey: reviewAttempt === 0 ? 'quality_gate' : 'quality_gate_evidence_completion' },
        });
        rawResponse = judged.content;
        const protocol = parseScoreReviewJson(rawResponse);
        const parsed = protocol.value;
        if (Array.isArray(parsed.issues)) parsed.issues = parsed.issues.map((issue: any, index: number) => {
          const corrected = resolveExactCausalBasisSource(issue, evidenceSources);
          if (corrected !== issue) assessmentDiagnostics.push({ attempt: reviewAttempt + 1, status: 'citation_source_normalized',
            issueIndex: index, originalSource: issue.basisSource, correctedSource: corrected.basisSource,
            basisEvidence: issue.basisEvidence, normalization: '逐字依据唯一定位；只校正来源地址，不改证据、结论或严重度' });
          return corrected;
        });
        if (!SCORE_DIMENSIONS.some(key => parsed.dimensions[key] && typeof parsed.dimensions[key] === 'object')
          && !(reviewAttempt > 0 && combinedRaw && missing.length === 0 && invalidIndexes.length > 0 && Array.isArray(parsed.repairs))) {
          throw new Error('评审协议无效：dimensions 必须是评分对象，issues 必须位于顶层，不能以缺项补评分替代完整评审');
        }
        if (protocol.normalized) assessmentDiagnostics.push({ attempt: reviewAttempt + 1, status: 'protocol_normalized',
          normalization: '仅校正 dimensions 与 issues 层级，原评分与问题清单全部保留',
          rawResponse: rawResponse.slice(0, 12000), responseChars: rawResponse.length });
        combinedRaw = combinedRaw && typeof combinedRaw === 'object'
          ? {
              ...combinedRaw,
              dimensions: { ...(combinedRaw.dimensions || {}), ...(parsed?.dimensions || {}) },
              issues: [...applySemanticEvidenceRepairs(pendingIssues, invalidIndexes, parsed, content, evidenceSources), ...(Array.isArray(parsed?.issues) ? parsed.issues : [])],
            }
          : parsed;
        score = parseStageScore(combinedRaw, input);
        if (score.status !== 'evaluated') assessmentDiagnostics.push({ attempt: reviewAttempt + 1,
          status: score.status, missingDimensions: SCORE_DIMENSIONS.filter(key => score.dimensions[key].status === 'not_evaluated'),
          rawResponse: rawResponse.slice(0, 12000), responseChars: rawResponse.length });
        if (score.status === 'evaluated') break;
      } catch (error) {
        assessmentDiagnostics.push({ attempt: reviewAttempt + 1, status: 'failed',
          error: error instanceof Error ? error.message : String(error), missingDimensions: missing,
          rawResponse: rawResponse.slice(0, 12000), responseChars: rawResponse.length });
        // One targeted same-model evidence completion is allowed below. If it
        // also fails, the result correctly remains not_evaluated.
      }
    }
    if (assessmentDiagnostics.length) (score as any).assessmentDiagnostics = assessmentDiagnostics;
    if (['chapter', 'refinement'].includes(run.stage)) {
      const fingerprint = styleFingerprint({ ...input, previousChapters: run.previousChapters, characterNames: run.characterNames });
      score.issues.push(...fingerprint.issues);
      (score as any).styleFingerprint = fingerprint;
      const platform = deterministicPlatformReview(input);
      const platformPartition = partitionPlatformIssues(platform.issues);
      score.issues.push(...platformPartition.confirmed);
      (score as any).platformSignalProbes = platformPartition.probes;
      (score as any).platformMeasurements = platform.measurements;
    }
    score.issues.push(...contractReview.issues);
    if (input.enforcePlanningConditions && score.status === 'evaluated') {
      const decisive = await this.auditPlanningActions(run, request, content);
      (score as any).planningActionAudit = decisive;
      if (!decisive.verified) {
        score.status = 'partial'; score.overallScore = null;
        score.issues.push(qualityIssue({ ...input, ruleId: 'ARCH-005.action_review', severity: 'medium',
          message: '关键场景因果审查未完成：' + decisive.errors.join('；'), source: 'planning_action_audit' }));
      } else for (const gap of decisive.issues) {
        score.issues.push({ ...qualityIssue({ ...input, ruleId: 'logic.causal_gap', severity: gap.severity,
          message: gap.summary, quote: gap.evidence, source: 'planning_action_audit' }), requiredPlanningCondition: true });
      }
    }
    (score as any).characterContractReview = contractReview;
    (score as any).narrativeTrace = trace;
    score.gateStatus = qualityGate(score.issues, score.status === 'evaluated').status;
    return score;
  }

  /** Reuse QLT-003's action/result validator for decisive framework scenes; scores cannot substitute for proof. */
  async validatePlanningActions(projectId: string, chapters: any[], planningSources: Record<string, unknown>) {
    if (!chapters.some(chapter => ['climax', 'explosion', 'resolution'].includes(chapter.chapterFunction))) return;
    const content = JSON.stringify({ volumes: [{ chapters }] });
    const started = Date.now();
    const run = this.metrics.beginRun(projectId, 'outline', content, undefined, 'framework_action_proof');
    try {
      const checked = await this.auditPlanningActions(run, { prompt: content, planningSources, metrics: { projectId } }, content);
      if (!checked.verified || checked.issues.length) {
        const report = classifyGateFailure({ topic: 'outline_alignment', evaluationStatus: checked.verified ? 'evaluated' : 'not_evaluated',
          buckets: checked.verified ? { outline_alignment: checked.issues.map(issue => issue.summary) } : { review_incomplete: checked.errors } });
        throw new GeneratedQualityGateError(report, content);
      }
      this.metrics.finishRun(run.id, 'success', started, content);
    } catch (error) {
      this.metrics.blockRunValidation(run.id, error instanceof Error ? error.message : String(error));
      this.metrics.finishRun(run.id, 'failed', started, content, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async auditPlanningActions(run: NonNullable<ReturnType<GenerationMetricsService['beginRun']>>, request: LLMRequest, content: string, resultField?: 'exitState'): Promise<{ verified: boolean; errors: string[]; issues: Array<{ severity: any; summary: string; evidence: string; chapterNumber?: number }>; audit: any }> {
    let chapters: any[] = [];
    try { chapters = JSON.parse(content).volumes.flatMap((volume: any) => volume.chapters || [])
      .filter((chapter: any) => ['climax', 'explosion', 'resolution'].includes(chapter.chapterFunction)); } catch {
      return { verified: false, errors: ['关键场景结构无法解析'], issues: [], audit: null };
    }
    if (!chapters.length) return { verified: true, errors: [], issues: [], audit: null };
    // Bound the input window, not the number of actual decisive outcomes that must be checked.
    if (chapters.length > 3) {
      const batches = [];
      for (let index = 0; index < chapters.length; index += 3) {
        batches.push(await this.auditPlanningActions(run, request,
          JSON.stringify({ volumes: [{ chapters: chapters.slice(index, index + 3) }] }), resultField));
      }
      return { verified: batches.every(batch => batch.verified), errors: batches.flatMap(batch => batch.errors),
        issues: batches.flatMap(batch => batch.issues), audit: batches.map(batch => batch.audit) };
    }
    const body = JSON.stringify(chapters);
    const sources = { project_context: run.context || '{}', chapter_plan: JSON.stringify(request.planningSources || {}) };
    const evidenceAnchors = causalEvidenceAnchorOptions(body, sources);
    const isWorldMechanism = (anchor: {source: string;path?:string}) => anchor.source === 'project_context'
      && /^(worldRules|world)(\.|$)/.test(anchor.path || '');
    const worldMechanisms = evidenceAnchors.filter(isWorldMechanism);
    const bodyAnchors = evidenceAnchors.filter(anchor => anchor.source === 'body');
    const chapterEvidenceCatalog = chapters.map(chapter => ({ chapterNumber: chapter.chapterNumber,
      anchorIds: bodyAnchors.filter(anchor => resolveQualityEvidence(JSON.stringify(chapter), anchor.text).verified).map(anchor => anchor.id),
      ...(resultField ? { resultAnchorIds: causalExitResultAnchors(bodyAnchors, chapter[resultField]).map(anchor => anchor.id) } : {}) }));
    let audit: any = null;
    let checked = { verified: false, errors: ['缺少关键场景行动结果审查'], issues: [] as any[] };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const countercheck = attempt > 0 && !!resultField;
        const prompt = countercheck ? {
          systemPrompt: '你是独立因果反证核查员，前一份审查没有权威。先从完整章纲提取行动前状态，再核对行动如何改变该状态，禁止从结果倒推条件已经具备。只报告有原文证据的矛盾或缺少必要条件，不评分，不改写，不要求解释未到期谜底。',
          prompt: STORY_CAUSAL_STATE_POLICY + '\n对完整章纲及原审查逐项反证。任务先已完成，后续行动还能改变该任务是否按时完成吗？进入权限与阻止屋内者离开的能力是否同一权限？目的、未来安排、心理和线索埋设不是已兑现的外部结果。先明确每个结果成立的必要条件，再寻找实际满足它的证据；不能重复新声称的能力改变作为机制。心理选择和日常直接结果可以引用本身实际叙述作为bridgeAnchorId，不要求外部手续，但supported不能漏掉引用地址。JSON:{"causalAudit":{"status":"evaluated","reason":"实际核算依据","transitions":[{"chapterNumber":1,"beforeStateAnchorId":"body完整行动顺序地址","requiredCondition":"成立必要条件","actionAnchorId":"body行动地址","resultAnchorId":"指定出口结果地址","bridgeAnchorId":"实际满足条件地址；gap或planned为空","status":"supported|gap|planned","reason":"实际依据"}]}}。\n原审查仅供核对，允许据原文推翻：' + JSON.stringify(audit)
            + '\n校验错误：' + checked.errors.join('；')
            + '\n【已确认的世界机制，可与本章实际操作合并证明条件；允许用于bridgeAnchorId，不要求正文重述】' + JSON.stringify(worldMechanisms)
            + '\n【本章行动与其它原文证据地址】' + JSON.stringify(evidenceAnchors.filter(anchor => !isWorldMechanism(anchor) && (anchor.source === 'body'
              || (anchor.source === 'project_context' && !/^(foreshadowing|outline|meta)(\.|$)/.test(anchor.path || ''))
              || audit?.transitions?.some((row: any) => row.bridgeAnchorId === anchor.id))))
            + '\n未证明的条件不能以未提供的来源或临时假设补齐。',
        } : causalAuditRepairPrompt(audit, checked.errors, body, sources, true, !!resultField);
        const response = await this.generateInternal({ ...prompt, scenario: 'review', injectStandard: false,
          systemPrompt: prompt.systemPrompt + '\n独立核对关键场景的必要因果，不评分、不改写场景。',
          prompt: '\n【完整章节结构，先按字段与事件顺序理解，后选择引文地址】' + body + '\n'
            + prompt.prompt + '\n每项transitions另带chapterNumber，须覆盖这些关键章：' + JSON.stringify(chapters.map(chapter => chapter.chapterNumber))
            + '。行动、结果证据必须实际属于声明的本章，不能以其它章节的结果代替。\n【章号与本章证据地址对应】' + JSON.stringify(chapterEvidenceCatalog)
            + (resultField ? '\n本次核对出口状态目录：对应章resultAnchorIds逐项各有一条transitions，不抽样、不合并多个结果为一项。resultAnchorId必须来自该目录。先阅读完整responsibility中的事件先后，再核对该结果全部必要环节，而非仅证明最容易成立的一环；reason须交代行动前状态、必要条件是否实际满足。尤其不能从结果倒推尚有未完成任务，或把进入权限当成剥夺对手原有能力。prerequisites是待满足条件，字段名及同义复述不证明已满足。普通直接结果不追加程序；未来安排、线索埋设使用planned及实际理由，无需bridge，不得配成已兑现结果或报gap；心理选择按原文直接核对。' : '')
            + (resultField ? '\n每条transitions（及纠错repairs）还必须填写beforeStateAnchorId（本章行动前完整状态的body地址，允许与actionAnchorId相同以保留同句先后）、requiredCondition（该结果成立所需的最小实际条件）。bridgeAnchorId只选实际满足此条件的原文，无则gap且留空。先输出这两项，再判断status。任务先已完成，后续行动还能改变该任务是否按时完成吗？进入权限与阻止屋内者离开的能力是否同一权限？不要用已完成目标或结果断言回答必要条件已满足。planned的beforeStateAnchorId可选择叙事安排原文，requiredCondition说明未到期，不追加程序。' : '')
            + '\n规划审查区分事件发生与读者获知：后章揭晓的先前事实可证明前章机制，未来才执行的动作不能证明前章结果；不能要求在悬念章提前揭晓幕后身份。',
          temperature: 0, responseFormat: 'json_object', maxTokens: LLM_TUNABLES.QUALITY_REVIEW_MAXTOKENS,
          metrics: { ...request.metrics, runId: run.id, stepKey: countercheck ? 'framework_action_state_countercheck' : 'framework_action_proof' } });
        const value = JSON.parse(response.content);
        audit = materializeCausalAuditAnchors(countercheck ? preserveCausalCountercheckAnchors(audit, value.causalAudit, body, sources)
          : attempt ? applyCausalAuditRepair(audit, checked.errors, value) : value.causalAudit, body, sources);
        checked = validateCausalAudit(audit, body, sources);
        if (Array.isArray(audit?.transitions)) audit.transitions.forEach((row: any, index: number) => {
          const chapter = chapters.find(candidate => candidate.chapterNumber === row.chapterNumber);
          if (resultField && (!chapter || !resolveQualityEvidence(JSON.stringify(chapter), row.beforeStateEvidence).verified
            || typeof row.requiredCondition !== 'string' || !row.requiredCondition.trim())) {
            checked.errors.push(`第${index + 1}项因果审查缺少行动前完整状态或必要条件核算`);
            checked.verified = false;
          }
          if (!chapter || !resolveQualityEvidence(JSON.stringify(chapter), row.actionEvidence).verified
            || !resolveQualityEvidence(JSON.stringify(chapter), row.resultEvidence).verified
            || (resultField && (typeof chapter[resultField] !== 'string'
              || !resolveQualityEvidence(chapter[resultField], row.resultEvidence).verified
              || !chapterEvidenceCatalog.find(entry => entry.chapterNumber === row.chapterNumber)?.resultAnchorIds?.includes(row.resultAnchorId)))) {
            checked.errors.push(`第${index + 1}项因果审查的章号或行动结果不属于该章${resultField ? '实际exitState' : ''}`);
            checked.verified = false;
          }
        });
        if (resultField) {
          const missing = chapterEvidenceCatalog.flatMap(entry => (entry.resultAnchorIds || []).filter(id =>
            !audit?.transitions?.some((row: any) => row.chapterNumber === entry.chapterNumber && row.resultAnchorId === id))
            .map(id => ({ chapterNumber: entry.chapterNumber, resultAnchorId: id })));
          if (chapterEvidenceCatalog.some(entry => !entry.resultAnchorIds?.length) || missing.length) {
            checked.verified = false;
            checked.errors.push('实际出口结果逐项核对未完整覆盖：' + missing.map(row => row.resultAnchorId).join('、'));
            // Address omissions within the existing correction call while preserving
            // all reviewed rows, including genuine gaps. Never rerun a valid verdict.
            if (Array.isArray(audit?.transitions)) for (const row of missing) {
              audit.transitions.push(row);
              checked.errors.push(`第${audit.transitions.length}项因果审查缺少该出口结果的行动及成立条件`);
            }
          }
        }
        if (checked.verified && (audit.status !== 'evaluated' || chapters.some(chapter => !audit.transitions.some((row: any) =>
          row.chapterNumber === chapter.chapterNumber && resolveQualityEvidence(JSON.stringify(chapter), row.actionEvidence).verified
            && resolveQualityEvidence(JSON.stringify(chapter), row.resultEvidence).verified)))) {
          checked = { ...checked, verified: false, errors: ['关键场景因果账目未按实际章号完整覆盖'] };
        }
        if (checked.verified && (!resultField || countercheck)) break;
      } catch (error) { checked = { verified: false,
        errors: [...(attempt ? checked.errors : []), error instanceof Error ? error.message : String(error)],
        issues: attempt ? checked.issues : [] }; }
    }
    return { ...checked, issues: checked.issues.map(issue => ({ ...issue,
      chapterNumber: audit?.transitions?.find((row: any) => row.status === 'gap' && row.reason === issue.summary)?.chapterNumber })), audit };
  }

  private async generateInternal(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const configuredMaxTokens = request.maxTokens ?? this.getConfiguredMaxTokens(request.scenario || 'daily');
    if (!Number.isInteger(configuredMaxTokens) || configuredMaxTokens <= 0) {
      throw new Error(`模型输出配置无效: scenario=${request.scenario || 'daily'} maxTokens=${String(request.maxTokens)}`);
    }

    const routedModel = this.modelRouter.getModelForScenario(
      request.scenario || 'daily',
      {
        chapterFunction: request.chapterFunction,
        retryCount: request.retryCount,
        role: request.role,
      },
    );

    // 路由服务已返回具体版本号（含自定义场景/写作模式），直接使用
    const modelName = routedModel.modelName;

    this.logger.log(
      `[RealLLM] calling model: ${modelName} (version: ${routedModel.modelVersion}), scenario: ${request.scenario || 'daily'}`,
    );

    const callTimeout = request.timeout ?? 600_000; // 默认10分钟
    const reasoningEffort = this.resolveReasoningEffort(request.scenario);

    // ⚠️ 关键：用带清除机制的超时包裹主 LLM 调用，确保超时一定生效，
    // 且重试时不会留下未处理的 reject 定时器（否则会产生 unhandledRejection）。
    // 超时后直接向上返回配置模型失败，不切换模型。
    const withTimeout = async (
      call: (signal: AbortSignal) => Promise<ModelCallResult>,
      ms: number,
    ): Promise<ModelCallResult> => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutP = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => {
            reject(
              new Error(
                `LLM 主调用超时 (${ms / 1000}s): model=${modelName}, scenario=${request.scenario || 'daily'}`,
              ),
            );
            controller.abort();
          },
          ms,
        );
      });
      try {
        return await Promise.race([call(controller.signal), timeoutP]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    // JSON 模式下上游（代理/网关）偶发返回空 content 而非报错（已用真实 openai 包
    // 复现确认：同一模型/端点/json_object/2.8万字 prompt 都正常，空内容属瞬时上游故障）。
    // 保持"配置怎么配就怎么执行"：用同一配置模型重试，绝不切换模型或去掉 response_format（非降级）。
    // 空内容没有可修订材料，可以按同一计划补发一次；再次为空即停止。
    // 即使旧调用点传入更大数字，也在这里统一封顶，避免业务层、SDK 与空响应重试相乘。
    const maxEmptyRetries = request.maxEmptyRetries === 0 ? 0 : 1;
    let thinkingDisabledAttempted = request.physicalCallBudget?.recoveryWithoutThinking === true;
    const callBudgetedModel = (...args: Parameters<RealLLMService['callModel']>) => {
      if (request.physicalCallBudget) {
        if (request.physicalCallBudget.remaining <= 0) {
          throw new Error('源头修订模型调用预算已用尽，已停止扩容或补发；本次未验收，不返回截断候选。');
        }
        request.physicalCallBudget.remaining--;
      }
      return this.callModel(...args);
    };
    // 显式单项契约与步骤/场景共同约束；普通多项 JSON 不获得额外恢复。
    const upstreamRepairUnit = request.structuredRepairUnitCount === 1 && request.scenario === 'review'
      && ['creation_cross_stage_repair','creation_cross_stage_path_design'].includes(request.metrics?.stepKey || '');
    const crossStageReviewUnit = request.structuredReviewUnitCount === 1 && request.scenario === 'review'
      && ['creation_cross_stage_review','creation_cross_stage_path_review'].includes(request.metrics?.stepKey || '');
    const singleStructuredUnit = upstreamRepairUnit || crossStageReviewUnit || request.metrics?.stepKey === 'creation_chapter_detail'
      || (request.structuredRepairIssueCount === 1 && request.scenario === 'refinement'
        && /^outline_local_repair_\d+$/.test(request.metrics?.stepKey || ''));
    const unitLabel = upstreamRepairUnit ? '单组源头修订' : crossStageReviewUnit ? '完整跨阶段决定' : request.metrics?.stepKey === 'creation_chapter_detail' ? '单章详细大纲' : '单项局部修复';
    let lastEmptyError: Error | null = null;
    // 结构化输出被 finish_reason=length 截断时的"同模型扩容"状态：模型与 json_object 模式都不变（非降级），
    // 只把输出上限翻倍后用同一 prompt 重试。硬顶由 structured-truncation.ts 单点定义，与调用侧预算同源。
    let currentMaxTokens = configuredMaxTokens;
    // ⚠️ 历史缺陷（防复发，勿改回）：截断扩容曾与"空内容重试"共用同一个 attempt 计数，
    // 于是扩容窗口被空内容预算吃掉 —— 配置 8192 时只能扩到 16384 就抛
    // "已扩容至 16384 仍不足"（真实故障：module-standards 归纳、评审链路连续失败）。
    // 截断的唯一成因是"输出配额装不下这一次结果"，与"上游偶发返回空内容"是两件事，
    // 因此必须是两个独立预算：扩容只受硬顶 STRUCTURED_JSON_OUTPUT_CEILING 约束，
    // 不够就继续翻倍，直到装得下或到顶；空内容重试次数单独计。
    let truncationExpansions = 0;
    let emptyRetriesUsed = 0;
    // 「关闭思考补发」的唯一实现：同一模型 / 同一 prompt / 同一 JSON 模式 / 同一配额，
    // 只把思考关掉，把整份配额让给正文。provider 是否支持这个开关由 callModel 判定（非 deepseek 自动忽略）。
    // 各调用点的【接受条件】不同——空内容分支只要非空即接受，硬顶截断分支必须「非空且非 length」——
    // 所以这里只负责发这一次物理调用，不替调用方判断它是否算成功。
    const callWithoutThinking = async (): Promise<ModelCallResult> => {
      thinkingDisabledAttempted = true;
      if(request.physicalCallBudget)request.physicalCallBudget.recoveryWithoutThinking=true;
      internalRetries++;
      return withTimeout(
        signal => callBudgetedModel(modelName, request.prompt, effectiveSystemPrompt, baseTemperature, currentMaxTokens, callTimeout, request.responseFormat, reasoningEffort, true, signal),
        callTimeout,
      );
    };
    // 扩容轮数上限由硬顶反推（从 1 翻到硬顶所需的最多轮数），避免理论上限之外的无限翻倍。
    const MAX_TRUNCATION_EXPANSIONS = Math.max(1, Math.ceil(Math.log2(STRUCTURED_JSON_OUTPUT_CEILING)));
    // 扩容的唯一算法：主循环与网络重试分支共用同一个口径，不允许出现第二套判断。
    // 返回下一档输出上限；已到硬顶则返回 null（调用方据此判定"扩容已无意义"）。
    const nextExpandedMaxTokens = (current: number): number | null => {
      const next = Math.min(STRUCTURED_JSON_OUTPUT_CEILING, Math.floor(current * 2));
      return next > current ? next : null;
    };
    // 温度优先级：调用方显式传入的 temperature > 路由配置的 temperature
    // 这样既保持了route-config的统一管理，又允许关键场景（如高潮章节）动态调整温度
    const baseTemperature = request.temperature !== undefined ? request.temperature : routedModel.temperature;
    let internalRetries = 0;
    // 保证一次物理调用只落一条遥测：主循环内已 emit 的业务失败（空/截断）throw 后会被外层 catch 接住，
    // 外层最终出口据此跳过，避免同一次失败重复记 truncated + failed 两条。
    let metricEmitted = false;
    const emit = (
      status: 'success' | 'empty' | 'truncated' | 'network_error' | 'failed',
      extra?: { resp?: LLMResponse; reason?: string },
    ) => {
      metricEmitted = true;
      this.recordStepMetric(request, modelName, status, Date.now() - startTime, internalRetries, extra);
    };
    // 公共小说规则只从 System Workflow Rule Registry 的运行时投影注入。
    // injectStandard=false 用于元任务：必须真正关闭公共规则，不能留下调用器内联的第二套前置规则。
    const standardDirective = request.injectStandard === false
      ? ''
      : standardDirectiveCache.get(request.scenario || 'daily', request.metrics?.stepKey);
    const effectiveSystemPrompt = [request.systemPrompt, standardDirective]
      .filter(s => typeof s === 'string' && s.trim()).join('\n\n');
    try {
      // physicalCalls 只用于日志与"第几次调用"表述，不参与任何预算判断
      // （预算判断全部走 truncationExpansions / emptyRetriesUsed 两个独立计数器）。
      for (let physicalCalls = 1; ; physicalCalls++) {
        const result = await withTimeout(
          signal => callBudgetedModel(
            modelName,
            request.prompt,
            effectiveSystemPrompt,
            baseTemperature,
            currentMaxTokens,
            callTimeout,
            request.responseFormat,
            reasoningEffort,
            thinkingDisabledAttempted || undefined,
            signal,
          ),
          callTimeout,
        );

        if (request.responseFormat === 'json_object' && result.finishReason === 'length') {
          // 关键修复：截断根因是输出配额不足，用相同 maxTokens 重试必然再次截断。
          // 在模型输出上限内把 maxTokens 翻倍，用【同一模型/同一 prompt/同一 json 模式】重试（不换模型、不去 json，非降级）。
          // 扩容预算独立于空内容重试预算：只要没到硬顶就继续翻倍，直到装得下或到顶。
          const expanded = nextExpandedMaxTokens(currentMaxTokens);
          if (expanded !== null && truncationExpansions < MAX_TRUNCATION_EXPANSIONS) {
            this.logger.warn(
              `结构化输出被长度截断，同模型扩容输出上限重试（不换模型/非降级）: model=${modelName}, scenario=${request.scenario || 'daily'}, maxTokens ${currentMaxTokens}→${expanded}`,
            );
            currentMaxTokens = expanded;
            truncationExpansions++;
            internalRetries++;
            continue;
          }
          // ⚠️ 历史缺陷（防复发，勿改回「到硬顶就直接判死」）：
          // 凡是首次预算就顶到硬顶的调用点（如 review 传 maxTokens=硬顶 32768），nextExpandedMaxTokens
          // 必然返回 null —— 那条扩容通道等于不存在，一次 finish_reason=length 就把整条评审作废，
          // 白烧一整个物理调用。实测证据（generation_step_metrics）：
          //   review 行 duration_ms=115915 / output_chars=0 / fail_reason=「结构化输出被长度截断，扩容后仍不足」，
          //   而 review 成功行 completion_tokens 仅 391~718 —— 说明这次截断不是「结构化结果装不下」，
          //   是推理(reasoning)把配额吃光了，一个字正文都没吐出来。
          // 恢复手段因此不是加配额（已在硬顶）、不是减字段、不是换模型（都是降级），而是本文件既有的
          // 「关闭思考补发」故障恢复：同一模型 / 同一 prompt / 同一 JSON 模式 / 同一配额，把整份配额让给结构化正文；
          // 正常路径仍保留完整推理。
          // 单章详细大纲已经是最小批量。实测第3章单章在硬顶截断（prompt=16574字，
          // 前两章同契约各输出 3482/4128 字），不能再按“减小批量”处理。
          // 单项局部修复也由调用方明确声明问题数量，并保持完整上下文、8处/20%补丁限制。
          // 对最小单元允许同模型、同提示词、同 JSON 契约关闭思考补发一次；
          // 其他多项结构化任务出现半截 JSON 时仍交回调用方缩小批量。
          if (!thinkingDisabledAttempted && (!result.content.trim() || singleStructuredUnit)) {
            this.logger.warn(
              `结构化输出在硬顶被长度截断（${singleStructuredUnit ? unitLabel : '无正文输出'}），同模型关闭思考补发（仅故障恢复，正常路径保留完整推理）: model=${modelName}, scenario=${request.scenario || 'daily'}, maxTokens=${currentMaxTokens}`,
            );
            const noThinkResult = await callWithoutThinking();
            // 关闭思考后必须「有正文 且 不是 length」，否则仍是没装下/没产出，不能当成功返回。
            if (noThinkResult.content.trim() && noThinkResult.finishReason !== 'length') {
              const __respTruncNoThink = this.toResponse(noThinkResult, modelName, request, startTime);
              emit('success', { resp: __respTruncNoThink });
              return __respTruncNoThink;
            }
          }
          emit('truncated', { resp:this.toResponse(result,modelName,request,startTime), reason: singleStructuredUnit
            ? `${unitLabel}在硬顶且同模型关闭思考补发后仍被截断`
            : '结构化输出被长度截断，扩容后仍不足' });
          throw structuredTruncationError(
            singleStructuredUnit
              ? `${unitLabel}在 ${currentMaxTokens} tokens 硬顶且同模型关闭思考补发后仍被截断；已停止本次修复`
              : `结构化生成因输出长度被截断（已扩容至 ${currentMaxTokens} 仍不足，请减小单次结构化批量）`,
            { maxTokens: currentMaxTokens, scenario: request.scenario, model: modelName },
          );
        }

        // 必须在 length 之后判断空内容。推理模型可能把预算耗尽后返回
        // content="" + finish_reason=length；把它当普通空响应会用原预算白跑一次。
        if (!result.content.trim()) {
          // 预算耗尽型空响应（content 空 + finish_reason=length，推理模型常见）：先扩容再重发，
          // 用原预算重放必然再次耗尽；模型/prompt/json 模式都不变（非降级）。
          if (result.finishReason === 'length') {
            const expanded = nextExpandedMaxTokens(currentMaxTokens);
            if (expanded !== null && truncationExpansions < MAX_TRUNCATION_EXPANSIONS) {
              this.logger.warn(
                `空内容且输出被长度截断，同模型扩容重试（不换模型/非降级）: model=${modelName}, scenario=${request.scenario || 'daily'}, maxTokens ${currentMaxTokens}→${expanded}`,
              );
              currentMaxTokens = expanded;
              truncationExpansions++;
              internalRetries++;
              continue;
            }
          }
          // 空响应的最后手段：扩容已到硬顶/已用完扩容机会（length 型），或空内容重试预算
          // 已用尽（非 length 型）时，关闭思考补发一次。故障恢复而非降级——此时模型已无法产出
          // 正文，关闭思考是让它能输出的唯一手段；正常路径仍保留完整推理。
          if (!thinkingDisabledAttempted && (result.finishReason === 'length' || emptyRetriesUsed >= maxEmptyRetries)) {
            this.logger.warn(
              `空内容且扩容后仍被思考耗尽，关闭思考补发（仅故障恢复，正常路径保留完整推理）: model=${modelName}, scenario=${request.scenario || 'daily'}, maxTokens=${currentMaxTokens}`,
            );
            const noThinkResult = await callWithoutThinking();
            if (noThinkResult.content.trim()) {
              const __respNoThink = this.toResponse(noThinkResult, modelName, request, startTime);
              emit('success', { resp: __respNoThink });
              return __respNoThink;
            }
            lastEmptyError = new Error(
              `模型返回空内容(关闭思考补发后仍为空): model=${modelName}, scenario=${request.scenario || 'daily'}, maxTokens=${currentMaxTokens}`,
            );
            this.logger.warn(lastEmptyError.message);
            emit('empty', { reason: lastEmptyError.message });
            throw lastEmptyError;
          }
          // 空内容重试预算用尽：没有更多不降级的手段可用，如实抛错，绝不静默兜底。
          if (emptyRetriesUsed >= maxEmptyRetries) {
            lastEmptyError = new Error(
              `模型返回空内容(空响应重试已用尽 ${emptyRetriesUsed}/${maxEmptyRetries}，已物理调用 ${physicalCalls} 次): model=${modelName}, scenario=${request.scenario || 'daily'}`,
            );
            this.logger.warn(lastEmptyError.message);
            emit('empty', { reason: lastEmptyError.message });
            throw lastEmptyError;
          }
          emptyRetriesUsed++;
          lastEmptyError = new Error(
            `模型返回空内容(第${emptyRetriesUsed}次空响应，共 ${maxEmptyRetries} 次重试机会，已物理调用 ${physicalCalls} 次): model=${modelName}, scenario=${request.scenario || 'daily'}`,
          );
          this.logger.warn(lastEmptyError.message);
          internalRetries++;
          // 空内容实测是上游瞬时故障（同 prompt/同模型时好时坏）：立刻重放命中率低，
          // 退避一次再重发，避免一次抖动就把整章质检判失败。
          await new Promise(resolve => setTimeout(resolve, LLM_TUNABLES.RETRY_BASE_DELAY_MS));
          continue;
        }

        const __resp = this.toResponse(result, modelName, request, startTime);
        emit('success', { resp: __resp });
        return __resp;
      }
      // 上面的循环只能通过 return / throw 退出（每个分支都在循环内定论）。
      // 保留这行作为不可达兜底，防止将来有人改动分支后出现"静默返回 undefined"。
      emit('empty', { reason: lastEmptyError?.message || '模型多次返回空内容' });
      throw lastEmptyError ?? new Error(`模型返回空内容: model=${modelName}, scenario=${request.scenario || 'daily'}`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      // 网络错误发生在拿到创作结果之前，可补发一次；重复网络错误交还调用方，
      // 不再与 SDK 和业务节点叠加成多轮隐式运行。
      const isNetworkErr = msg.includes('ECONNRESET') || msg.includes('ECONNREFUSED')
        || msg.includes('ETIMEDOUT') || msg.includes('terminated') || msg.includes('socket hang up')
        || msg.includes('aborted') || msg.includes('ENETUNREACH') || msg.includes('EAI_AGAIN')
        || msg.includes('fetch failed') || msg.includes('UND_ERR_SOCKET') || msg.includes('other side closed')
        || msg.includes('Connection error');
      if (isNetworkErr) {
        const delays = [1500];
        for (let netRetry = 0; netRetry < delays.length; netRetry++) {
          await new Promise(r => setTimeout(r, delays[netRetry]));
          this.logger.warn(`[RealLLM] 网络重试 ${netRetry + 1}/${delays.length}（${msg.split('\n')[0]}，${delays[netRetry] / 1000}s 后）：model=${modelName}, scenario=${request.scenario || 'daily'}`);
          try {
            const result = await withTimeout(
              // 这里曾在关闭思考的空内容补发断线后，网络重试又恢复默认思考模式，
              // 后果是重试与失败调用并非同一请求，推理再次耗尽预算且难以归因。
              signal => callBudgetedModel(modelName, request.prompt, effectiveSystemPrompt, baseTemperature, currentMaxTokens, callTimeout, request.responseFormat, reasoningEffort, thinkingDisabledAttempted || undefined, signal),
              callTimeout,
            );
            // 与主循环同一扩容口径（防复发，勿改回"只补发一轮"）：过去这里遇到
            // json+length 直接判死、遇到"空内容+length"只扩一轮，与主循环"翻倍到硬顶"不一致，
            // 也把"空内容+length"误报成"模型返回空内容"。现在统一为：不够就继续翻倍到硬顶。
            let settled = result;
            while (settled.finishReason === 'length'
              && (request.responseFormat === 'json_object' || !settled.content.trim())) {
              const next = nextExpandedMaxTokens(currentMaxTokens);
              if (next === null || truncationExpansions >= MAX_TRUNCATION_EXPANSIONS) {
                // 与主循环同一口径（防复发）：硬顶 + 一个字都没吐 = 推理想光了配额，
                // 先走「关闭思考补发」这条既有故障恢复通道，再判死。
                if (!thinkingDisabledAttempted && (!settled.content.trim() || singleStructuredUnit)) {
                  this.logger.warn(
                    `网络重试后最小结构化单元或空输出在硬顶截断，同模型关闭思考补发（仅故障恢复，正常路径保留完整推理）: model=${modelName}, scenario=${request.scenario || 'daily'}, maxTokens=${currentMaxTokens}`,
                  );
                  const noThinkResult = await callWithoutThinking();
                  if (noThinkResult.content.trim() && noThinkResult.finishReason !== 'length') {
                    const __respNetNoThink = this.toResponse(noThinkResult, modelName, request, startTime);
                    emit('success', { resp: __respNetNoThink });
                    return __respNetNoThink;
                  }
                }
                throw structuredTruncationError(
                  `结构化生成因输出长度被截断（网络重试+扩容至 ${currentMaxTokens} 仍不足）`,
                  { maxTokens: currentMaxTokens, scenario: request.scenario, model: modelName },
                );
              }
              this.logger.warn(
                `网络重试后输出被长度截断（或思考耗尽预算），同模型扩容补发（不换模型/非降级）: model=${modelName}, scenario=${request.scenario || 'daily'}, maxTokens ${currentMaxTokens}→${next}`,
              );
              currentMaxTokens = next;
              truncationExpansions++;
              internalRetries++;
              settled = await withTimeout(
                signal => callBudgetedModel(modelName, request.prompt, effectiveSystemPrompt, baseTemperature, currentMaxTokens, callTimeout, request.responseFormat, reasoningEffort, thinkingDisabledAttempted || undefined, signal),
                callTimeout,
              );
            }
            if (!settled.content.trim()) {
              throw new Error(
                `模型返回空内容（网络重试后）: model=${modelName}, scenario=${request.scenario || 'daily'}`,
              );
            }
            this.logger.log(`[RealLLM] 网络重试 ${netRetry + 1} 成功：model=${modelName}, scenario=${request.scenario || 'daily'}`);
            // 必须用 settled（扩容后的那次结果），否则会把扩容前那次空/截断的结果当成功返回。
            const __respNet = this.toResponse(settled, modelName, request, startTime);
            emit('success', { resp: __respNet });
            return __respNet;
          } catch (innerErr: any) {
            const innerMsg = innerErr?.message || String(innerErr);
            // 若新错误不再是网络错误，立即停止重试（复用同一判定逻辑）
            const stillNetwork = innerMsg.includes('ECONNRESET') || innerMsg.includes('ECONNREFUSED') || innerMsg.includes('ETIMEDOUT')
              || innerMsg.includes('terminated') || innerMsg.includes('socket hang up')
              || innerMsg.includes('aborted') || innerMsg.includes('ENETUNREACH') || innerMsg.includes('EAI_AGAIN')
              || innerMsg.includes('fetch failed') || innerMsg.includes('UND_ERR_SOCKET') || innerMsg.includes('other side closed')
              || innerMsg.includes('Connection error');
            if (!stillNetwork) {
              emit('failed', { reason: innerMsg });
              throw innerErr;
            }
            internalRetries++;
          }
        }
      }
      const isNetFinal = msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('UND_ERR_SOCKET') || msg.includes('socket hang up');
      this.logger.warn(
        `[RealLLM] model ${modelName} failed (${request.scenario || 'daily'}); configured-model-only mode is enabled: ${msg}`,
      );
      if (!metricEmitted) emit(isNetFinal ? 'network_error' : 'failed', { reason: msg });
      throw err;
    }
  }

  /**
   * 统一步骤埋点：每次物理 LLM 调用结束（成功/空/截断/网络错误/失败）记录一条，全容错，绝不影响生成主流程。
   */
  private recordStepMetric(
    request: LLMRequest,
    modelName: string,
    status: 'success' | 'empty' | 'truncated' | 'network_error' | 'failed',
    durationMs: number,
    internalRetries: number,
    extra?: { resp?: LLMResponse; reason?: string },
  ): void {
    try {
      const ctx = request.metrics;
      const finalProjectId = ctx?.projectId ?? currentCreationProjectId();
      if (!finalProjectId && expectsProjectId(request.scenario, ctx?.stepKey)) {
        this.logger.warn(`[埋点] 项目内场景 ${request.scenario || ctx?.stepKey || 'daily'} 缺少 projectId（未处于项目请求上下文、metrics 也未显式传入），该条只计入平台级、不计入任何单本书`);
      }
      const outputText = extra?.resp?.content;
      const outputWords = GenerationMetricsService.countWords(outputText);
      const target = ctx?.targetWords ?? null;
      this.metrics.record({
        projectId: finalProjectId,
        runId: ctx?.runId,
        chapterIndex: ctx?.chapterIndex ?? null,
        stepKey: ctx?.stepKey ?? null,
        scenario: request.scenario || 'daily',
        modelVersion: modelName,
        attempt: ctx?.attempt ?? 0,
        phase: (ctx?.attempt ?? 0) === 0 ? 'first' : 'retry',
        status,
        failReason: extra?.reason ?? null,
        durationMs,
        promptChars: request.prompt?.length ?? 0,
        outputText,
        outputWords,
        targetWords: target,
        deficitWords: target ? Math.max(0, target - outputWords) : null,
        promptTokens: extra?.resp?.usage?.promptTokens ?? null,
        completionTokens: extra?.resp?.usage?.completionTokens ?? null,
        totalTokens: extra?.resp?.usage?.totalTokens ?? null,
        internalRetries,
      });
    } catch {
      /* 埋点永不影响生成 */
    }
  }

  // ==================== 工具方法 ====================

  private getApiKey(runtimeModel: RuntimeModel): string {
    const userKey = this.modelRouter.getUserKey('global', runtimeModel.apiModel) ||
      this.modelRouter.getUserKey('global', runtimeModel.provider);
    return userKey?.apiKey || this.getFirstEnv(runtimeModel.keyNames) || process.env.LLM_API_KEY || '';
  }

  private getBaseUrl(runtimeModel: RuntimeModel): string | undefined {
    const userKey = this.modelRouter.getUserKey('global', runtimeModel.apiModel) ||
      this.modelRouter.getUserKey('global', runtimeModel.provider);
    return userKey?.baseUrl || this.getFirstEnv(runtimeModel.baseUrlNames) || undefined;
  }

  /** 推理强度只接受用户显式配置；系统不自行降低已选模型的推理等级。 */
  private resolveReasoningEffort(_scenario?: string): 'low' | 'medium' | 'high' | undefined {
    if (process.env.LLM_REASONING_EFFORT) {
      const v = process.env.LLM_REASONING_EFFORT as string;
      return v === 'low' || v === 'medium' || v === 'high' ? v : undefined;
    }
    return undefined;
  }

  private async callModel(
    modelName: string,
    prompt: string,
    systemPrompt?: string,
    temperature?: number,
    maxTokens?: number,
    timeout?: number,
    responseFormat: 'text' | 'json_object' = 'text',
    reasoningEffort?: 'low' | 'medium' | 'high',
    disableThinking?: boolean,
    signal?: AbortSignal,
  ): Promise<ModelCallResult> {
    if (!Number.isInteger(maxTokens) || Number(maxTokens) <= 0) {
      throw new Error(`模型输出配置无效: model=${modelName} 未传入有效的 maxTokens`);
    }
    const runtimeModel = this.resolveRuntimeModel(modelName);
    const provider = runtimeModel.provider;
    const userKey =
      this.modelRouter.getUserKey('global', modelName) ||
      this.modelRouter.getUserKey('global', provider);
    const apiKey =
      userKey?.apiKey ||
      this.getFirstEnv(runtimeModel.keyNames) ||
      process.env.LLM_API_KEY;
    const baseUrl =
      userKey?.baseUrl ||
      this.getFirstEnv(runtimeModel.baseUrlNames) ||
      process.env.LLM_BASE_URL;

    if (!apiKey) {
      throw new Error(
        `missing API key: set ${runtimeModel.keyNames.join(' or ')} or LLM_API_KEY`,
      );
    }

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const temp = temperature ?? 0.7;

    if (provider === 'anthropic') {
      const content = await this.callClaude(
        apiKey,
        baseUrl,
        runtimeModel.apiModel,
        prompt,
        systemPrompt,
        temp,
        maxTokens,
        timeout,
        signal,
      );
      return { content };
    }

    return this.callOpenAICompatible(
      apiKey,
      baseUrl,
      runtimeModel.apiModel,
      provider,
      messages,
      temp,
      maxTokens as number,
      timeout,
      responseFormat,
      reasoningEffort,
      disableThinking,
      signal,
    );
  }

  private async callOpenAICompatible(
    apiKey: string,
    baseUrl: string | undefined,
    model: string,
    provider: string,
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    temperature: number,
    maxTokens: number,
    timeout: number = 180_000,  // 默认3分钟，复杂创作节点需要更长时间
    responseFormat: 'text' | 'json_object' = 'text',
    reasoningEffort?: 'low' | 'medium' | 'high',
    disableThinking?: boolean,
    signal?: AbortSignal,
  ): Promise<ModelCallResult> {
    const providerLabel = this.getProviderLabel(provider);
    const proxyExtras = await this.resolveProxyExtras();
    const client = new OpenAI({
      apiKey,
      baseURL: this.normalizeOpenAIBaseUrl(
        baseUrl || this.getDefaultBaseUrl(provider),
        provider,
      ),
      // Avoid hidden SDK retries multiplying the explicit, measured retry
      // policy in generateInternal.
      maxRetries: 0,
      timeout,
      ...proxyExtras,
    });

    try {
      // ★ 改为流式调用：长生成期间持续收 chunk，防止中间网络设备 RST 空闲连接
      const stream = await client.chat.completions.create({
        model,
        messages: messages as any,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        // 流式调用默认不上报 usage。要求上游在最后一个 chunk 带上真实 token 计数，
        // 否则规划器只能靠文本长度估算，中文会被低估约 2.4 倍（这正是批次被放大的根因）。
        ...(STREAM_USAGE_PROVIDERS.has(provider) ? { stream_options: { include_usage: true as const } } : {}),
        ...(responseFormat === 'json_object' ? { response_format: { type: 'json_object' as const } } : {}),
        // deepseek-flash 默认先思考再输出（reasoning 可占 7500+ token，慢但保证对基线/一致性的遵循度）。
        // 用户硬性要求：质量和一致性优先。因此默认保留完整推理，不做任何削弱。
        // 速度是可选优化：LLM_REASONING_EFFORT=low/medium 可降推理量提速（一致性风险略升）；
        // LLM_DISABLE_THINKING=1 完全关闭（最快，但显著降低对基线的遵循度，不推荐）。
        ...(provider === 'deepseek'
          ? (process.env.LLM_DISABLE_THINKING === '1' || disableThinking === true)
            ? { thinking: { type: 'disabled' as const } }
            : (reasoningEffort
              ? { reasoning_effort: reasoningEffort as 'low' | 'medium' | 'high' }
              : {})
          : {}),
      }, { signal });

      let content = '';
      let finishReason: string | undefined;
      let usage: ModelUsage | undefined;
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) content += delta;
        const fr = chunk.choices?.[0]?.finish_reason;
        if (fr) finishReason = fr;
        const chunkUsage = (chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }).usage;
        if (chunkUsage) {
          usage = {
            promptTokens: typeof chunkUsage.prompt_tokens === 'number' ? chunkUsage.prompt_tokens : usage?.promptTokens,
            completionTokens: typeof chunkUsage.completion_tokens === 'number' ? chunkUsage.completion_tokens : usage?.completionTokens,
            totalTokens: typeof chunkUsage.total_tokens === 'number' ? chunkUsage.total_tokens : usage?.totalTokens,
          };
        }
      }

      return {
        content: content || '',
        finishReason: finishReason || undefined,
        usage,
      };
    } catch (err: any) {
      const status = err?.status ? `${err.status} ` : '';
      const message = err?.message || String(err);
      const errorBody = err?.error ? JSON.stringify(err.error, null, 2) : '';
      const errorCode = err?.code || err?.cause?.code || '';
      const causeMessage = err?.cause?.message || '';
      const usedBaseUrl = this.normalizeOpenAIBaseUrl(baseUrl || this.getDefaultBaseUrl(provider), provider);
      this.logger.error(`${providerLabel} API error: ${status}${message}`);
      if (errorBody) {
        this.logger.error(`${providerLabel} API error body: ${errorBody}`);
      }
      if (errorCode || causeMessage) {
        this.logger.error(`${providerLabel} transport detail: code=${errorCode || 'unknown'}, cause=${causeMessage || 'unknown'}`);
      }
      // 连接层失败（无 HTTP 状态码）：挖透底层真实原因并给出排查建议
      if (!err?.status) {
        const net = this.describeNetworkError(err);
        this.logger.error(
          `[RealLLM] 网络连接失败（非 API 错误）：code=${net.code || 'unknown'} | ${net.message}`,
        );
        this.logger.error(`[RealLLM] 排查建议：${net.guidance}`);
        throw new Error(
          `${providerLabel} 网络连接失败(${net.code || 'connection'}): ${net.guidance}`,
        );
      }
      // Endpoint and model are enough for diagnostics; never write any part
      // of a user credential to logs.
      this.logger.error(`${providerLabel} [debug] baseUrl=${usedBaseUrl}, model=${model}, apiKeyConfigured=${apiKey ? 'yes' : 'no'}`);
      throw new Error(`${providerLabel} API error: ${status}${message}`);
    }
  }

  private async callClaude(
    apiKey: string,
    baseUrl: string | undefined,
    model: string,
    prompt: string,
    systemPrompt?: string,
    temperature?: number,
    maxTokens?: number,
    timeoutMs: number = 60_000,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!Number.isInteger(maxTokens) || Number(maxTokens) <= 0) {
      throw new Error(`Claude 输出配置无效: model=${model} 未传入有效的 maxTokens`);
    }
    const url = this.normalizeClaudeMessagesUrl(baseUrl);

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens as number,
      messages: [{ role: 'user', content: prompt }],
    };

    if (temperature !== undefined) {
      body.temperature = temperature;
    }
    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(
          `Claude API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`,
        );
      }

      const data = (await response.json()) as any;
      if (data.content && Array.isArray(data.content)) {
        return data.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('\n');
      }

      return data.content?.[0]?.text || '';
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError' || err.name === 'AbortSignal') {
        throw new Error(
          `Claude LLM request timed out (${timeoutMs / 1000}s)`,
        );
      }
      throw err;
    }
  }

  private resolveRuntimeModel(modelName: string): RuntimeModel {
    const normalized = modelName.toLowerCase();
    const aliases: Record<string, RuntimeModel> = {
      gpt4o: this.createRuntimeModel('openai', 'gpt-4o'),
      'gpt-4o': this.createRuntimeModel('openai', 'gpt-4o'),
      openai: this.createRuntimeModel('openai', 'gpt-4o'),
      claude: this.createRuntimeModel(
        'anthropic',
        'claude-sonnet-4-20250514',
      ),
      zhipu: this.createRuntimeModel('zhipu', 'glm-4-plus'),
      glm: this.createRuntimeModel('zhipu', 'glm-4-plus'),
      qwen: this.createRuntimeModel('alibaba', 'qwen-plus'),
      alibaba: this.createRuntimeModel('alibaba', 'qwen-plus'),
    };

    if (aliases[normalized]) {
      return aliases[normalized];
    }

    // DeepSeek 任意具体模型 ID（deepseek-flash / deepseek-v4-pro / 代理侧其它 deepseek-* 名称）
    // 一律原样透传：配置/场景里是什么模型名，就向接口发什么名，绝不改写成任何固定默认版本，也不逐个硬编码。
    if (normalized.startsWith('deepseek-')) {
      return this.createRuntimeModel('deepseek', modelName);
    }
    // 只给了笼统提供商名 deepseek、没有具体版本：明确报错要求选择具体版本，绝不替用户默认。
    if (normalized === 'deepseek') {
      throw new Error(
        '模型只填了提供商名 "deepseek"、缺少具体模型 ID（如 deepseek-flash / deepseek-v4-pro）。' +
        '请到「设置 → 模型配置」选择提供商返回的具体模型 ID。',
      );
    }

    const modelInfo = this.modelRouter.getModelInfo(modelName);
    if (modelInfo?.provider) {
      return this.createRuntimeModel(modelInfo.provider, modelName);
    }

    if (normalized.startsWith('claude-')) {
      return this.createRuntimeModel('anthropic', modelName);
    }
    if (normalized.startsWith('gpt-') || normalized.startsWith('o')) {
      return this.createRuntimeModel('openai', modelName);
    }
    if (normalized.startsWith('glm-')) {
      return this.createRuntimeModel('zhipu', modelName);
    }
    if (normalized.startsWith('qwen-')) {
      return this.createRuntimeModel('alibaba', modelName);
    }

    // 兜底：绝不把未配置的模型名偷偷发送到 DeepSeek 等默认提供商。
    // 宁可明确报错，也不要"假成功"地调用一个作者并未添加的虚假模型。
    // 若需在设置中添加自定义模型，请通过 BYOK 配置对应的 API Key 与提供商，
    // 使其进入 config.models 或被别名/前缀识别。
    throw new Error(
      `未配置/无法识别的模型: "${modelName}"。请先在应用「设置」中通过 BYOK 配置该模型的 API Key 与提供商，不要使用未添加的虚假模型。`,
    );
  }

  private createRuntimeModel(provider: string, apiModel: string): RuntimeModel {
    const env: Record<
      string,
      { keyNames: string[]; baseUrlNames: string[] }
    > = {
      deepseek: {
        keyNames: ['DEEPSEEK_API_KEY'],
        baseUrlNames: ['DEEPSEEK_BASE_URL'],
      },
      openai: {
        keyNames: ['OPENAI_API_KEY'],
        baseUrlNames: ['OPENAI_BASE_URL'],
      },
      anthropic: {
        keyNames: ['CLAUDE_API_KEY', 'ANTHROPIC_API_KEY'],
        baseUrlNames: ['CLAUDE_BASE_URL', 'ANTHROPIC_BASE_URL'],
      },
      zhipu: {
        keyNames: ['GLM_API_KEY', 'ZHIPU_API_KEY'],
        baseUrlNames: ['GLM_BASE_URL', 'ZHIPU_BASE_URL'],
      },
      alibaba: {
        keyNames: ['QWEN_API_KEY', 'ALIBABA_API_KEY'],
        baseUrlNames: ['QWEN_BASE_URL', 'ALIBABA_BASE_URL'],
      },
      openai_compatible: {
        keyNames: ['CUSTOM_API_KEY'],
        baseUrlNames: ['CUSTOM_BASE_URL'],
      },
    };

    const envNames = env[provider] || env.openai_compatible;
    return { provider, apiModel, ...envNames };
  }

  private getDefaultBaseUrl(provider: string): string {
    const urls: Record<string, string> = {
      deepseek: 'https://api.deepseek.com',
      openai: 'https://api.openai.com/v1',
      zhipu: 'https://open.bigmodel.cn/api/paas/v4',
      alibaba: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      openai_compatible: 'https://api.openai.com/v1',
    };
    return urls[provider] || 'https://api.deepseek.com';
  }

  private normalizeOpenAIBaseUrl(baseUrl: string, provider: string): string {
    let normalized = baseUrl
      .replace(/\/+$/, '')
      .replace(/\/chat\/completions$/, '');
    if (provider === 'deepseek') {
      normalized = normalized.replace(/\/v1$/, '');
    }
    return normalized;
  }

  private normalizeClaudeMessagesUrl(baseUrl?: string): string {
    const normalized = (baseUrl || 'https://api.anthropic.com')
      .replace(/\/+$/, '')
      .replace(/\/v1\/messages$/, '')
      .replace(/\/messages$/, '');
    return `${normalized}/v1/messages`;
  }

  private getFirstEnv(names: string[]): string | undefined {
    for (const name of names) {
      if (process.env[name]) return process.env[name];
    }
    return undefined;
  }

  private getProviderLabel(provider: string): string {
    const labels: Record<string, string> = {
      deepseek: 'DeepSeek',
      openai: 'OpenAI',
      zhipu: 'GLM',
      alibaba: 'Qwen',
      anthropic: 'Claude',
      openai_compatible: 'Custom API',
    };
    return labels[provider] || provider;
  }

  private toResponse(
    result: ModelCallResult,
    model: string,
    request: LLMRequest,
    startTime: number,
  ): LLMResponse {
    const content = result.content;
    // 优先使用上游真实 usage（reasoning 已计入 completion_tokens，规划器据此得到真实的每章成本）；
    // 只有上游确实没给 usage 时才回退到全仓统一的文本口径估算，不再用「4 字符 1 token」的拉丁文启发式。
    const promptTokens = result.usage?.promptTokens ?? estimateTokens(request.prompt, PLANNING_TOKEN_WEIGHTS);
    const completionTokens = result.usage?.completionTokens ?? estimateTokens(content, PLANNING_TOKEN_WEIGHTS);
    const totalTokens = result.usage?.totalTokens ?? (promptTokens + completionTokens);
    return {
      content,
      model,
      finishReason: result.finishReason,
      usage: { promptTokens, completionTokens, totalTokens },
      latency: Date.now() - startTime,
    };
  }

  getModelName(): string {
    return 'real-llm';
  }

  async isAvailable(): Promise<boolean> {
    // 检查环境变量
    const hasEnvKey = !!(
      process.env.LLM_API_KEY ||
      process.env.DEEPSEEK_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.CLAUDE_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GLM_API_KEY ||
      process.env.ZHIPU_API_KEY ||
      process.env.QWEN_API_KEY ||
      process.env.ALIBABA_API_KEY ||
      process.env.CUSTOM_API_KEY
    );
    if (hasEnvKey) return true;

    // 检查 BYOK user-keys（任意模型有 Key 即认为可用）
    const allKeys = this.modelRouter.getAllUserKeys?.() || [];
    if (allKeys.length > 0) return true;

    return false;
  }
}
