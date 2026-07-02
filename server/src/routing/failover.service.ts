/**
 * 故障转移服务
 *
 * 实现健壮的模型调用容错机制：
 * - 超时（60秒无响应）→ 重试（1次）→ 降级
 * - 限流（429）→ 等待10秒 → 重试 → 降级
 * - 格式错误（非JSON）→ 重新请求 → 降级
 * - 降级链：Claude → GPT-4o → DeepSeek → 本地缓存
 * - 熔断：5分钟内失败5次 → 断开该模型3分钟 → 半开恢复
 *
 * 注意：重试次数和超时已调低以避免叠加爆炸。
 * 原配置(3次重试×180s超时+30s限流)导致单次LLM调用最坏可达17分钟，
 * 5个串行调用轻松超过前端10分钟SSE超时。
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ==================== 类型定义 ====================

export type FailoverErrorType = 'timeout' | 'rate_limit' | 'parse_error' | 'server_error' | 'unknown';

export interface FailoverResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  modelUsed: string;
  attempts: number;
  circuitBroken?: boolean;
  fromCache?: boolean;
}

export interface CircuitState {
  model: string;
  status: 'closed' | 'open' | 'half_open';
  failureCount: number;
  lastFailureTime: number;
  openedAt?: number;
  halfOpenCheckAt?: number;
}

/** 降级级别 */
export type DegradationLevel = 'model_fallback' | 'local_cache' | 'graceful_degradation';

/** 降级链定义 */
export interface FallbackChain {
  model: string;
  level: DegradationLevel;
}

@Injectable()
export class FailoverService {
  private readonly logger = new Logger(FailoverService.name);

  /** 熔断器状态表 */
  private readonly circuitBreakers = new Map<string, CircuitState>();

  /** 本地缓存（降级到本地时使用） */
  private readonly localCache = new Map<string, { data: unknown; timestamp: number }>();

  /** 降级链配置 */
  private readonly fallbackChains: Record<string, FallbackChain[]> = {
    claude: [
      { model: 'gpt4o', level: 'model_fallback' },
      { model: 'deepseek', level: 'model_fallback' },
      { model: 'LOCAL_CACHE', level: 'local_cache' },
      { model: 'GRACEFUL', level: 'graceful_degradation' },
    ],
    gpt4o: [
      { model: 'claude', level: 'model_fallback' },
      { model: 'deepseek', level: 'model_fallback' },
      { model: 'LOCAL_CACHE', level: 'local_cache' },
      { model: 'GRACEFUL', level: 'graceful_degradation' },
    ],
    deepseek: [
      { model: 'gpt4o', level: 'model_fallback' },
      { model: 'LOCAL_CACHE', level: 'local_cache' },
      { model: 'GRACEFUL', level: 'graceful_degradation' },
    ],
    glm: [
      { model: 'claude', level: 'model_fallback' },
      { model: 'deepseek', level: 'model_fallback' },
      { model: 'GRACEFUL', level: 'graceful_degradation' },
    ],
    qwen: [
      { model: 'claude', level: 'model_fallback' },
      { model: 'deepseek', level: 'model_fallback' },
      { model: 'GRACEFUL', level: 'graceful_degradation' },
    ],
  };

  /** 熔断配置 */
  private readonly circuitConfig = {
    failureThreshold: 5,          // 5分钟内失败5次触发熔断（降低以更快熔断）
    openDurationMs: 3 * 60 * 1000, // 熔断持续时间3分钟
    windowMs: 5 * 60 * 1000,       // 统计窗口5分钟
    halfOpenTimeoutMs: 30 * 1000,  // 半开状态等待时间
  };

  /** 超时时间 - 默认10分钟，可通过环境变量 MODEL_TIMEOUT_MS 配置 */
  private readonly timeoutMs: number;

  /** 最大重试次数（降低从3→1，避免重试叠加导致总耗时爆炸） */
  private readonly maxRetries = 1;

  /** 限流等待时间（降低从30s→10s） */
  private readonly rateLimitWaitMs = 10_000;

  constructor(@Optional() private readonly configService: ConfigService) {
    this.timeoutMs = this.configService?.get<number>('MODEL_TIMEOUT_MS') || 1_800_000; // 默认30分钟
  }

  // ==================== 核心执行方法 ====================

  /**
   * 执行带故障转移的模型调用
   *
   * @param model 首选模型
   * @param callFn 实际模型调用函数
   * @param cacheKey 缓存键（可选，启用本地缓存降级）
   * @param timeoutOverride 单次调用超时覆盖（毫秒）。不传则用 this.timeoutMs。
   *   分层策略：简单查询45s、中等生成60s、正文生成120s
   */
  async executeWithFailover<T>(
    model: string,
    callFn: (model: string) => Promise<T>,
    cacheKey?: string,
    timeoutOverride?: number,
  ): Promise<FailoverResult<T>> {
    // 检查熔断
    if (this.isCircuitOpen(model)) {
      this.logger.warn(`模型 ${model} 熔断中，尝试降级`);
      return this.executeFallbackChain<T>(model, callFn, cacheKey, 0);
    }

    let attempts = 0;
    let lastError: string | undefined;

    for (let retry = 0; retry <= this.maxRetries; retry++) {
      attempts++;

      try {
        const result = await this.callWithTimeout<T>(callFn, model, timeoutOverride ?? this.timeoutMs);
        // 成功调用，记录熔断恢复
        this.recordSuccess(model);
        return {
          success: true,
          data: result,
          modelUsed: model,
          attempts,
        };
      } catch (err) {
        const errorType = this.classifyError(err);
        lastError = err instanceof Error ? err.message : String(err);

        this.logger.warn(
          `模型 ${model} 调用失败(type=${errorType}, attempt=${retry + 1}/${this.maxRetries + 1}): ${lastError}`,
        );

        // 记录熔断失败
        this.recordFailure(model);

        if (errorType === 'rate_limit') {
          // 限流：等待30秒后重试
          this.logger.warn(`限流触发，等待 ${this.rateLimitWaitMs / 1000} 秒`);
          await this.delay(this.rateLimitWaitMs);
          continue;
        }

        if (errorType === 'timeout' && retry < this.maxRetries) {
          // 超时重试
          continue;
        }

        // 其他错误或已达到最大重试次数 -> 走降级
        break;
      }
    }

    // 所有重试失败，走降级链
    return this.executeFallbackChain<T>(model, callFn, cacheKey, attempts, timeoutOverride);
  }

  // ==================== 降级链 ====================

  /**
   * 执行降级链
   */
  private async executeFallbackChain<T>(
    originalModel: string,
    callFn: (model: string) => Promise<T>,
    cacheKey?: string,
    previousAttempts: number = 0,
    timeoutOverride?: number,
  ): Promise<FailoverResult<T>> {
    // 统一转大写匹配降级链
    const chainsUpper: Record<string, FallbackChain[]> = {};
    for (const [k, v] of Object.entries(this.fallbackChains)) {
      chainsUpper[k.toUpperCase()] = v;
    }
    const upper = originalModel.toUpperCase();
    let chain = chainsUpper[upper];
    if (!chain) {
      const family = upper.split(/[-_]/)[0];
      chain = chainsUpper[family];
    }
    if (!chain) {
      return {
        success: false,
        error: `模型 ${originalModel} 无降级链配置`,
        modelUsed: originalModel,
        attempts: previousAttempts,
      };
    }

    for (const fallback of chain) {
      if (fallback.model === 'LOCAL_CACHE') {
        // 尝试从本地缓存获取
        if (cacheKey && this.localCache.has(cacheKey)) {
          const cached = this.localCache.get(cacheKey)!;
          this.logger.log(`降级到本地缓存: ${cacheKey}`);
          return {
            success: true,
            data: cached.data as T,
            modelUsed: originalModel,
            attempts: previousAttempts,
            fromCache: true,
          };
        }
        continue;
      }

      if (fallback.model === 'GRACEFUL') {
        // 优雅降级：返回默认响应
        this.logger.warn(`模型 ${originalModel} 完全不可用，返回优雅降级响应`);
        return {
          success: false,
          error: `模型 ${originalModel} 不可用，已降级`,
          modelUsed: originalModel,
          attempts: previousAttempts,
          circuitBroken: this.isCircuitOpen(originalModel),
        };
      }

      // 尝试降级到备用模型
      if (this.isCircuitOpen(fallback.model)) {
        this.logger.warn(`降级目标 ${fallback.model} 也在熔断中，跳过`);
        continue;
      }

      try {
        this.logger.log(`降级到模型: ${fallback.model}`);
        const result = await this.callWithTimeout<T>(callFn, fallback.model, timeoutOverride ?? this.timeoutMs);
        return {
          success: true,
          data: result,
          modelUsed: fallback.model,
          attempts: previousAttempts,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`降级模型 ${fallback.model} 也失败: ${errorMsg}`);
        this.recordFailure(fallback.model);
      }
    }

    return {
      success: false,
      error: `所有降级模型均不可用`,
      modelUsed: originalModel,
      attempts: previousAttempts,
    };
  }

  // ==================== 熔断器 ====================

  /**
   * 检查模型是否处于熔断状态
   */
  isCircuitOpen(model: string): boolean {
    const state = this.circuitBreakers.get(model);
    if (!state) return false;

    if (state.status === 'closed') return false;

    if (state.status === 'open') {
      // 检查熔断持续时间是否已过
      if (state.openedAt && Date.now() - state.openedAt >= this.circuitConfig.openDurationMs) {
        // 进入半开状态
        state.status = 'half_open';
        state.halfOpenCheckAt = Date.now();
        this.logger.log(`模型 ${model} 熔断到期，进入半开状态`);
        return false; // 允许一次试探请求
      }
      return true;
    }

    // 半开状态：检查是否过了半开等待时间
    if (state.status === 'half_open') {
      if (state.halfOpenCheckAt && Date.now() - state.halfOpenCheckAt >= this.circuitConfig.halfOpenTimeoutMs) {
        return false; // 允许新请求
      }
      // 还在等待试探结果，暂时允许
      return false;
    }

    return false;
  }

  /**
   * 记录调用成功（关闭熔断或半开恢复）
   */
  recordSuccess(model: string): void {
    const state = this.circuitBreakers.get(model);
    if (state && state.status === 'half_open') {
      this.logger.log(`模型 ${model} 半开状态恢复，关闭熔断`);
      state.status = 'closed';
      state.failureCount = 0;
    }
  }

  /**
   * 记录调用失败
   */
  recordFailure(model: string): void {
    const now = Date.now();
    let state = this.circuitBreakers.get(model);

    if (!state) {
      state = {
        model,
        status: 'closed',
        failureCount: 1,
        lastFailureTime: now,
      };
      this.circuitBreakers.set(model, state);
      return;
    }

    // 如果超过统计窗口，重置计数
    if (now - state.lastFailureTime > this.circuitConfig.windowMs) {
      state.failureCount = 1;
      state.lastFailureTime = now;
      state.status = 'closed';
      return;
    }

    state.failureCount++;
    state.lastFailureTime = now;

    // 触发熔断
    if (state.failureCount >= this.circuitConfig.failureThreshold) {
      state.status = 'open';
      state.openedAt = now;
      this.logger.warn(
        `模型 ${model} 触发熔断！${this.circuitConfig.windowMs / 1000 / 60}分钟内失败 ${state.failureCount} 次，断开 ${this.circuitConfig.openDurationMs / 1000 / 60} 分钟`,
      );
    }
  }

  /**
   * 获取所有熔断器状态
   */
  getCircuitStates(): CircuitState[] {
    return Array.from(this.circuitBreakers.values());
  }

  /**
   * 手动重置熔断器
   */
  resetCircuit(model: string): void {
    this.circuitBreakers.delete(model);
    this.logger.log(`手动重置模型 ${model} 的熔断器`);
  }

  // ==================== 本地缓存 ====================

  /**
   * 写入本地缓存
   */
  setCache(key: string, data: unknown, ttlMs: number = 5 * 60 * 1000): void {
    this.localCache.set(key, { data, timestamp: Date.now() + ttlMs });
  }

  /**
   * 清除过期缓存
   */
  cleanExpiredCache(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.localCache) {
      if (now > entry.timestamp) {
        this.localCache.delete(key);
        count++;
      }
    }
    return count;
  }

  // ==================== 错误分类 ====================

  /**
   * 分类错误类型
   */
  private classifyError(err: unknown): FailoverErrorType {
    const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

    if (message.includes('timeout') || message.includes('timed out') || message.includes('aborted')) {
      return 'timeout';
    }
    if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
      return 'rate_limit';
    }
    if (message.includes('parse') || message.includes('json') || message.includes('unexpected token')) {
      return 'parse_error';
    }
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('server error')) {
      return 'server_error';
    }
    return 'unknown';
  }

  // ==================== 辅助方法 ====================

  /**
   * 带超时的调用
   */
  private async callWithTimeout<T>(
    fn: (model: string) => Promise<T>,
    model: string,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`模型 ${model} 请求超时 (${timeoutMs}ms)`));
      }, timeoutMs);

      fn(model)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
