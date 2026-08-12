import { Injectable, Logger } from '@nestjs/common';
import OpenAI, { type ClientOptions } from 'openai';
import { ILLMService } from './llm.interface';
import { LLMRequest, LLMResponse } from './chain.types';
import { ModelRouterService } from '../routing/model-router.service';
import * as net from 'net';

type RuntimeModel = {
  provider: string;
  apiModel: string;
  keyNames: string[];
  baseUrlNames: string[];
};

type ModelCallResult = {
  content: string;
  finishReason?: string;
};

@Injectable()
export class RealLLMService implements ILLMService {
  private readonly logger = new Logger(RealLLMService.name);

  constructor(
    private readonly modelRouter: ModelRouterService,
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
    const config = this.modelRouter.getConfig();
    const scenarioConfig = (config.scenarios as any)?.[scenario];
    const value = Number(scenarioConfig?.maxTokens ?? config.defaults?.maxTokens);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`模型输出配置无效: scenario=${scenario} 未配置有效的 maxTokens`);
    }
    return value;
  }

  async onModuleInit() {
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

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const configuredMaxTokens = request.maxTokens ?? this.getConfiguredMaxTokens(request.scenario || 'default');
    if (!Number.isInteger(configuredMaxTokens) || configuredMaxTokens <= 0) {
      throw new Error(`模型输出配置无效: scenario=${request.scenario || 'default'} maxTokens=${String(request.maxTokens)}`);
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
      `[RealLLM] calling model: ${modelName} (version: ${routedModel.modelVersion}), scenario: ${request.scenario || 'default'}`,
    );

    const callTimeout = request.timeout ?? 600_000; // 默认10分钟
    const reasoningEffort = this.resolveReasoningEffort(request.scenario);

    // ⚠️ 关键：用带清除机制的超时包裹主 LLM 调用，确保超时一定生效，
    // 且重试时不会留下未处理的 reject 定时器（否则会产生 unhandledRejection）。
    // 超时后直接向上返回配置模型失败，不切换模型。
    const withTimeout = async (
      p: Promise<ModelCallResult>,
      ms: number,
    ): Promise<ModelCallResult> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutP = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `LLM 主调用超时 (${ms / 1000}s): model=${modelName}, scenario=${request.scenario || 'default'}`,
              ),
            ),
          ms,
        );
      });
      try {
        return await Promise.race([p, timeoutP]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    // JSON 模式下上游（代理/网关）偶发返回空 content 而非报错（已用真实 openai 包
    // 复现确认：同一模型/端点/json_object/2.8万字 prompt 都正常，空内容属瞬时上游故障）。
    // 保持"配置怎么配就怎么执行"：用同一配置模型重试，绝不切换模型或去掉 response_format（非降级）。
    // 调用方可显式传 maxEmptyRetries 提高关键验收器的重试次数。
    const maxEmptyRetries = request.maxEmptyRetries ?? 2;
    let lastEmptyError: Error | null = null;
    try {
      for (let attempt = 0; attempt <= maxEmptyRetries; attempt++) {
        // 空内容重试时给一个小幅温度抖动（封顶 0.5），尽量避开上游瞬时空内容 bug，
        // 温度仍由路由配置主导，绝不替换模型或去掉 response_format。
        const jitterTemp = attempt === 0
          ? routedModel.temperature
          : Math.min(0.5, Number(routedModel.temperature) + 0.1 * attempt);
        const result = await withTimeout(
          this.callModel(
            modelName,
            request.prompt,
            request.systemPrompt,
            jitterTemp,
            configuredMaxTokens,
            callTimeout,
            request.responseFormat,
            reasoningEffort,
          ),
          callTimeout,
        );

        // 空内容重试适用于所有请求（正文生成/结构化）：上游网关对任意请求都可能偶发返回空 content，
        // 正文生成因此被误报"未返回可验收内容"而整章失败。结构化仍额外校验输出被截断。
        if (!result.content.trim()) {
          lastEmptyError = new Error(
            `模型返回空内容(第${attempt + 1}次, 共 ${maxEmptyRetries + 1} 次机会): model=${modelName}, scenario=${request.scenario || 'default'}`,
          );
          this.logger.warn(lastEmptyError.message);
          continue;
        }
        if (request.responseFormat === 'json_object' && result.finishReason === 'length') {
          throw new Error(
            `结构化生成因输出长度被截断: model=${modelName}, scenario=${request.scenario || 'default'}, maxTokens=${configuredMaxTokens}`,
          );
        }

        return this.toResponse(result, modelName, request, startTime);
      }
      throw lastEmptyError!;
    } catch (err: any) {
      const msg = err?.message || String(err);
      // 网络级错误（ECONNRESET/ECONNREFUSED/ETIMEDOUT/terminated）整体重试
      // 现实观测：deepseek-v4-flash 在大陆出口路由下经常被中间设备 RST，需 ≥5 次指数退避才能稳过
      const isNetworkErr = msg.includes('ECONNRESET') || msg.includes('ECONNREFUSED')
        || msg.includes('ETIMEDOUT') || msg.includes('terminated') || msg.includes('socket hang up')
        || msg.includes('aborted') || msg.includes('ENETUNREACH') || msg.includes('EAI_AGAIN')
        || msg.includes('fetch failed') || msg.includes('UND_ERR_SOCKET') || msg.includes('other side closed')
        || msg.includes('Connection error');
      if (isNetworkErr) {
        const delays = [1500, 3000, 5000, 8000, 12000]; // 累计 ~30s
        for (let netRetry = 0; netRetry < delays.length; netRetry++) {
          await new Promise(r => setTimeout(r, delays[netRetry]));
          this.logger.warn(`[RealLLM] 网络重试 ${netRetry + 1}/${delays.length}（${msg.split('\n')[0]}，${delays[netRetry] / 1000}s 后）：model=${modelName}, scenario=${request.scenario || 'default'}`);
          try {
            const result = await withTimeout(
              this.callModel(modelName, request.prompt, request.systemPrompt, routedModel.temperature, configuredMaxTokens, callTimeout, request.responseFormat, reasoningEffort),
              callTimeout,
            );
            this.logger.log(`[RealLLM] 网络重试 ${netRetry + 1} 成功：model=${modelName}, scenario=${request.scenario || 'default'}`);
            return this.toResponse(result, modelName, request, startTime);
          } catch (innerErr: any) {
            const innerMsg = innerErr?.message || String(innerErr);
            // 若新错误不再是网络错误，立即停止重试（复用同一判定逻辑）
            const stillNetwork = innerMsg.includes('ECONNRESET') || innerMsg.includes('ECONNREFUSED') || innerMsg.includes('ETIMEDOUT')
              || innerMsg.includes('terminated') || innerMsg.includes('socket hang up')
              || innerMsg.includes('aborted') || innerMsg.includes('ENETUNREACH') || innerMsg.includes('EAI_AGAIN')
              || innerMsg.includes('fetch failed') || innerMsg.includes('UND_ERR_SOCKET') || innerMsg.includes('other side closed')
              || innerMsg.includes('Connection error');
            if (!stillNetwork) throw innerErr;
          }
        }
      }
      this.logger.warn(
        `[RealLLM] model ${modelName} failed (${request.scenario || 'default'}); configured-model-only mode is enabled: ${msg}`,
      );
      throw err;
    }
  }

  /**
   * 流式生成（返回 token 迭代器）
   * 用于 SSE 场景，避免长文本生成超时
   */
  async *generateStream(request: LLMRequest): AsyncGenerator<string> {
    const configuredMaxTokens = request.maxTokens ?? this.getConfiguredMaxTokens(request.scenario || 'default');
    if (!Number.isInteger(configuredMaxTokens) || configuredMaxTokens <= 0) {
      throw new Error(`模型输出配置无效: scenario=${request.scenario || 'default'} maxTokens=${String(request.maxTokens)}`);
    }
    const routedModel = this.modelRouter.getModelForScenario(
      request.scenario || 'daily',
      {
        chapterFunction: request.chapterFunction,
        retryCount: request.retryCount,
        role: request.role,
      },
    );

    const modelName = routedModel.modelName;
    this.logger.log(`[RealLLM:Stream] model: ${modelName}`);

    const timeout = request.timeout || 600_000;

    const reasoningEffort = this.resolveReasoningEffort(request.scenario);
    try {
      yield* this.callModelStream(
        modelName,
        request.prompt,
        request.systemPrompt,
        routedModel.temperature,
        configuredMaxTokens,
        timeout,
        reasoningEffort,
      );
    } catch (err) {
      this.logger.warn(`[RealLLM:Stream] ${modelName} failed, failover disabled`);
      throw err;
    }
  }

  private async *callModelStream(
    modelName: string,
    prompt: string,
    systemPrompt?: string,
    temperature?: number,
    maxTokens?: number,
    timeout?: number,
    reasoningEffort?: 'low' | 'medium' | 'high',
  ): AsyncGenerator<string> {
    if (!Number.isInteger(maxTokens) || Number(maxTokens) <= 0) {
      throw new Error(`模型输出配置无效: model=${modelName} 未传入有效的 maxTokens`);
    }
    const runtimeModel = this.resolveRuntimeModel(modelName);
    const provider = runtimeModel.provider;

    if (provider === 'anthropic') {
      yield* this.callClaudeStream(
        this.getApiKey(runtimeModel),
        this.getBaseUrl(runtimeModel),
        runtimeModel.apiModel,
        prompt,
        systemPrompt,
        temperature,
        maxTokens as number,
        timeout ?? 600_000,
      );
    } else {
      yield* this.callOpenAICompatibleStream(
        this.getApiKey(runtimeModel),
        this.getBaseUrl(runtimeModel),
        runtimeModel.apiModel,
        provider,
        this.buildMessages(systemPrompt, prompt),
        temperature ?? 0.7,
        maxTokens as number,
        timeout ?? 600_000,
        reasoningEffort,
      );
    }
  }

  private async *callOpenAICompatibleStream(
    apiKey: string,
    baseUrl: string | undefined,
    model: string,
    provider: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    temperature: number,
    maxTokens: number,
    timeout: number = 600_000,
    reasoningEffort?: 'low' | 'medium' | 'high',
  ): AsyncGenerator<string> {
    const providerLabel = this.getProviderLabel(provider);
    const proxyExtras = await this.resolveProxyExtras();
    const client = new OpenAI({
      apiKey,
      baseURL: this.normalizeOpenAIBaseUrl(baseUrl || this.getDefaultBaseUrl(provider), provider),
      // Keep retries on the configured provider/model.  The SDK retries
      // transport and transient HTTP failures before the higher-level JSON
      // retry runs; it never changes the user's configured route.
      maxRetries: 2,
      timeout,
      ...proxyExtras,
    });

    try {
      const stream = await client.chat.completions.create({
        model,
        messages: messages as any,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        ...(provider === 'deepseek'
          ? process.env.LLM_DISABLE_THINKING === '1'
            ? { thinking: { type: 'disabled' as const } }
            : (reasoningEffort
              ? { reasoning_effort: reasoningEffort as 'low' | 'medium' | 'high' }
              : {})
          : {}),
      });

      for await (const chunk of stream) {
        const token = chunk.choices?.[0]?.delta?.content || '';
        if (token) yield token;
      }
    } catch (err: any) {
      this.logger.error(`${providerLabel} stream error: ${err?.message || err}`);
      throw err;
    }
  }

  private async *callClaudeStream(
    apiKey: string,
    baseUrl: string | undefined,
    model: string,
    prompt: string,
    systemPrompt?: string,
    temperature?: number,
    maxTokens?: number,
    timeoutMs: number = 600_000,
  ): AsyncGenerator<string> {
    if (!Number.isInteger(maxTokens) || Number(maxTokens) <= 0) {
      throw new Error(`Claude 输出配置无效: model=${model} 未传入有效的 maxTokens`);
    }
    const url = this.normalizeClaudeMessagesUrl(baseUrl);
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens as number,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    };
    if (temperature !== undefined) body.temperature = temperature;
    if (systemPrompt) body.system = systemPrompt;

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
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Claude API error: ${response.status} ${errText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Claude stream: no reader');

      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.replace(/^data:\s*/, '').trim();
          if (!trimmed || trimmed === '[DONE]') continue;
          try {
            const json = JSON.parse(trimmed);
            const token = json?.delta?.text || json?.choices?.[0]?.delta?.content || '';
            if (token) yield token;
          } catch {
            // 非 JSON 行跳过
          }
        }
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
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

  private buildMessages(systemPrompt?: string, prompt?: string): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    if (prompt) messages.push({ role: 'user', content: prompt });
    return messages;
  }

  /** 解析 deepseek 推理强度。正文生成默认 'low'：推理模型先思考再输出，思考吃光 max_tokens
   *  就返回空正文/被截断（"返回内容为空/过长被截断"根因），限制思考量才能保证正文有输出空间。
   *  用户显式设 LLM_REASONING_EFFORT 时以其为准。 */
  private resolveReasoningEffort(scenario?: string): 'low' | 'medium' | 'high' | undefined {
    if (process.env.LLM_REASONING_EFFORT) {
      const v = process.env.LLM_REASONING_EFFORT as string;
      return v === 'low' || v === 'medium' || v === 'high' ? v : undefined;
    }
    const bodyScenarios = new Set(['daily', 'writing', 'writing_daily', 'writing_climax', 'body', 'body_by_outline', 'polish']);
    return bodyScenarios.has(scenario || '') ? 'low' : undefined;
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
  ): Promise<ModelCallResult> {
    const providerLabel = this.getProviderLabel(provider);
    const proxyExtras = await this.resolveProxyExtras();
    const client = new OpenAI({
      apiKey,
      baseURL: this.normalizeOpenAIBaseUrl(
        baseUrl || this.getDefaultBaseUrl(provider),
        provider,
      ),
      // See the streaming variant above. A fresh TCP/TLS connection can be
      // reset by the upstream gateway even when the model configuration is
      // valid, so give the same configured request two transport retries.
      maxRetries: 2,
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
        ...(responseFormat === 'json_object' ? { response_format: { type: 'json_object' as const } } : {}),
        // deepseek-v4-flash 默认先思考再输出（reasoning 可占 7500+ token，慢但保证对基线/一致性的遵循度）。
        // 用户硬性要求：质量和一致性优先。因此默认保留完整推理，不做任何削弱。
        // 速度是可选优化：LLM_REASONING_EFFORT=low/medium 可降推理量提速（一致性风险略升）；
        // LLM_DISABLE_THINKING=1 完全关闭（最快，但显著降低对基线的遵循度，不推荐）。
        ...(provider === 'deepseek'
          ? process.env.LLM_DISABLE_THINKING === '1'
            ? { thinking: { type: 'disabled' as const } }
            : (reasoningEffort
              ? { reasoning_effort: reasoningEffort as 'low' | 'medium' | 'high' }
              : {})
          : {}),
      });

      let content = '';
      let finishReason: string | undefined;
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) content += delta;
        const fr = chunk.choices?.[0]?.finish_reason;
        if (fr) finishReason = fr;
      }

      return {
        content: content || '',
        finishReason: finishReason || undefined,
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
        signal: controller.signal,
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
      deepseek: this.createRuntimeModel('deepseek', 'deepseek-chat'),
      'deepseek-v4-pro': this.createRuntimeModel(
        'deepseek',
        'deepseek-chat',
      ),
      'deepseek-v4-flash': this.createRuntimeModel(
        'deepseek',
        'deepseek-v4-flash',  // 代理服务常用模型名，保持原样不硬编码
      ),
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

    const modelInfo = this.modelRouter.getModelInfo(modelName);
    if (modelInfo?.provider) {
      return this.createRuntimeModel(
        modelInfo.provider,
        this.modelRouter.resolveModelVersion(modelName),
      );
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
    return {
      content,
      model,
      finishReason: result.finishReason,
      usage: {
        promptTokens: Math.ceil(request.prompt.length / 4),
        completionTokens: Math.ceil(content.length / 4),
        totalTokens: Math.ceil((request.prompt.length + content.length) / 4),
      },
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
