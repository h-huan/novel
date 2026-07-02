import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { ILLMService } from './llm.interface';
import { LLMRequest, LLMResponse } from './chain.types';
import { ModelRouterService } from '../routing/model-router.service';
import { FailoverService } from '../routing/failover.service';

type RuntimeModel = {
  provider: string;
  apiModel: string;
  keyNames: string[];
  baseUrlNames: string[];
};

@Injectable()
export class RealLLMService implements ILLMService {
  private readonly logger = new Logger(RealLLMService.name);

  constructor(
    private readonly modelRouter: ModelRouterService,
    private readonly failover: FailoverService,
  ) {}

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
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    const routedModel = this.modelRouter.getModelForScenario(
      request.scenario || 'default',
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

    // ⚠️ 关键：用 Promise.race 包裹主 LLM 调用，确保超时一定生效
    // 原因：OpenAI SDK 内置的 timeout 在某些场景（代理/自定义 baseURL/网络异常）不触发 abort
    // FailoverService.executeWithFailover 有 callWithTimeout（setTimeout 兜底），但主路径没有
    try {
      const content = await Promise.race([
        this.callModel(
          modelName,
          request.prompt,
          request.systemPrompt,
          routedModel.temperature,
          request.maxTokens,
          callTimeout,
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`LLM 主调用超时 (${callTimeout / 1000}s): model=${modelName}, scenario=${request.scenario || 'default'}`)), callTimeout)
        ),
      ]);

      return this.toResponse(content, modelName, request, startTime);
    } catch (err: any) {
      this.logger.warn(
        `[RealLLM] model ${modelName} failed; configured-model-only mode is enabled`,
      );
      throw err;

      const fallbackContent = await this.failover.executeWithFailover(
        modelName,
        async (fallbackModel: string) => {
          return this.callModel(
            fallbackModel,
            request.prompt,
            request.systemPrompt,
            routedModel.temperature,
            request.maxTokens,
            callTimeout,
          );
        },
        undefined,
        callTimeout, // 传递超时覆盖给 FailoverService
      );

      if (!fallbackContent.success) {
        throw new Error(`all models failed: ${fallbackContent.error}`);
      }

      return this.toResponse(
        fallbackContent.data as string,
        fallbackContent.modelUsed,
        request,
        startTime,
      );
    }
  }

  /**
   * 流式生成（返回 token 迭代器）
   * 用于 SSE 场景，避免长文本生成超时
   */
  async *generateStream(request: LLMRequest): AsyncGenerator<string> {
    const routedModel = this.modelRouter.getModelForScenario(
      request.scenario || 'default',
      {
        chapterFunction: request.chapterFunction,
        retryCount: request.retryCount,
        role: request.role,
      },
    );

    const modelName = routedModel.modelName;
    this.logger.log(`[RealLLM:Stream] model: ${modelName}`);

    const timeout = request.timeout || 600_000;

    try {
      yield* this.callModelStream(
        modelName,
        request.prompt,
        request.systemPrompt,
        routedModel.temperature,
        request.maxTokens,
        timeout,
      );
    } catch (err) {
      this.logger.warn(`[RealLLM:Stream] ${modelName} failed, failover disabled`);
      throw err;
      // 降级：复用 failover 的非流式降级，然后 yield 完整文本
      const fallback = await this.failover.executeWithFailover(
        modelName,
        async (fb) => this.callModel(fb, request.prompt, request.systemPrompt, routedModel.temperature, request.maxTokens, timeout),
        undefined,
        timeout,
      );
      if (fallback.success) {
        yield fallback.data as string;
      } else {
        throw new Error(`all models failed: ${fallback.error}`);
      }
    }
  }

  private async *callModelStream(
    modelName: string,
    prompt: string,
    systemPrompt?: string,
    temperature?: number,
    maxTokens?: number,
    timeout?: number,
  ): AsyncGenerator<string> {
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
        maxTokens,
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
        maxTokens ?? 4096,
        timeout ?? 600_000,
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
    maxTokens: number = 4096,
    timeout: number = 600_000,
  ): AsyncGenerator<string> {
    const providerLabel = this.getProviderLabel(provider);
    const client = new OpenAI({
      apiKey,
      baseURL: this.normalizeOpenAIBaseUrl(baseUrl || this.getDefaultBaseUrl(provider), provider),
      maxRetries: 0,
      timeout,
    });

    try {
      const stream = await client.chat.completions.create({
        model,
        messages: messages as any,
        temperature,
        max_tokens: maxTokens,
        stream: true,
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
    maxTokens: number = 4096,
    timeoutMs: number = 600_000,
  ): AsyncGenerator<string> {
    const url = this.normalizeClaudeMessagesUrl(baseUrl);
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
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

  private async callModel(
    modelName: string,
    prompt: string,
    systemPrompt?: string,
    temperature?: number,
    maxTokens?: number,
    timeout?: number,
  ): Promise<string> {
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
      return this.callClaude(
        apiKey,
        baseUrl,
        runtimeModel.apiModel,
        prompt,
        systemPrompt,
        temp,
        maxTokens,
        timeout,
      );
    }

    return this.callOpenAICompatible(
      apiKey,
      baseUrl,
      runtimeModel.apiModel,
      provider,
      messages,
      temp,
      maxTokens,
      timeout,
    );
  }

  private async callOpenAICompatible(
    apiKey: string,
    baseUrl: string | undefined,
    model: string,
    provider: string,
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    temperature: number,
    maxTokens: number = 4096,
    timeout: number = 180_000,  // 默认3分钟，复杂创作节点需要更长时间
  ): Promise<string> {
    const providerLabel = this.getProviderLabel(provider);
    const client = new OpenAI({
      apiKey,
      baseURL: this.normalizeOpenAIBaseUrl(
        baseUrl || this.getDefaultBaseUrl(provider),
        provider,
      ),
      maxRetries: 0,
      timeout,
    });

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: messages as any,
        temperature,
        max_tokens: maxTokens,
      });

      return completion.choices?.[0]?.message?.content || '';
    } catch (err: any) {
      const status = err?.status ? `${err.status} ` : '';
      const message = err?.message || String(err);
      const errorBody = err?.error ? JSON.stringify(err.error, null, 2) : '';
      const usedBaseUrl = this.normalizeOpenAIBaseUrl(baseUrl || this.getDefaultBaseUrl(provider), provider);
      this.logger.error(`${providerLabel} API error: ${status}${message}`);
      if (errorBody) {
        this.logger.error(`${providerLabel} API error body: ${errorBody}`);
      }
      this.logger.error(`${providerLabel} [debug] baseUrl=${usedBaseUrl}, model=${model}, apiKeyPrefix=${apiKey ? apiKey.substring(0, 6) : 'EMPTY'}`);
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
    maxTokens: number = 4096,
    timeoutMs: number = 60_000,
  ): Promise<string> {
    const url = this.normalizeClaudeMessagesUrl(baseUrl);

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
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

    return this.createRuntimeModel('deepseek', modelName);
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
    content: string,
    model: string,
    request: LLMRequest,
    startTime: number,
  ): LLMResponse {
    return {
      content,
      model,
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
