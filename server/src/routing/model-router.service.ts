/**
 * 模型路由引擎
 *
 * 核心职责：
 * - 模型注册表管理（写手/评审/策划 三类角色，覆盖6模型）
 * - 五个用户配置场景覆盖全部内部写作阶段
 * - Temperature 动态调节（基础温度+重试升温+爆发章降温）
 * - BYOK 接口（用户自己的 API Key 管理）
 *
 * 遵循 NestJS 依赖注入模式，所有模型调用使用 ILLMService 抽象接口
 */
import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { cwd } from 'process';
import { modelSceneTab } from './scenario-taxonomy';

// ==================== 类型定义 ====================

export interface ModelVersion {
  id: string;
  label: string;
  tier: 'high' | 'medium' | 'low';
}

export interface ModelInfo {
  name: string;
  provider: string;
  tier: 'high' | 'medium' | 'low';
  capabilities: string[];
  versions?: ModelVersion[];
}

export interface RoleModelEntry {
  model: string;
  priority: number;
  label: string;
}

export interface RoleConfig {
  models: RoleModelEntry[];
}

export interface ScenarioRoute {
  model: string;
  temperature: number;
  label: string;
  routing_strategy?: string;
}

export interface ChapterFunctionRoute {
  model: string;
  tier: string;
  temperature: number;
  label: string;
}

export interface UserKeyEntry {
  projectId: string;
  modelName: string;
  apiKey: string;
  baseUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutedModel {
  modelName: string;
  modelVersion: string;
  temperature: number;
  tier: string;
  role: string;
}

export interface RouteConfig {
  models: Record<string, ModelInfo>;
  model_versions?: Record<string, string>;
  roles: Record<string, RoleConfig>;
  scenarios: Record<string, ScenarioRoute>;
  chapter_function_routing: Record<string, ChapterFunctionRoute>;
  defaults: {
    temperature: number;
    maxTokens: number;
    timeout: number;
  };
}

/** 写作模式（custom 已废弃，场景模型在所有模式下均生效） */
export type WritingMode = 'economy' | 'normal' | 'premium';

/** 写作模式标签（模式本身只影响温度/成本说明，绝不改变"设置里配置的模型"） */
const WRITING_MODE_LABELS: Record<'economy'|'normal'|'premium', string> = {
  economy: '省钱模式',
  normal:  '常规模式',
  premium: '高品质模式',
};

@Injectable()
export class ModelRouterService implements OnModuleInit {
  private readonly logger = new Logger(ModelRouterService.name);

  /** 路由配置 */
  private config!: RouteConfig;

  /** 当前写作模式 */
  private currentMode: WritingMode = 'normal';

  /** 当前模式是否来自持久化配置，而非进程默认值 */
  private hasPersistedMode = false;

  /** 模式持久化文件路径 */
  private readonly modePath: string;

  /** UserKey 持久化文件路径 */
  private readonly userKeysPath: string;

  /** 自定义提供商持久化文件路径 */
  private readonly customProvidersPath: string;

  /** 自定义场景模型映射持久化文件路径 */
  private readonly customScenesPath: string;

  /** 自定义场景模型映射（key=场景名, value=模型名） */
  private customScenes: Record<string, string> = {};

  /** 用户 API Key 注册表 key=项目ID_model名, value=Key记录 */
  private readonly userKeys = new Map<string, UserKeyEntry>();

  // 自定义提供商列表（用户通过 BYOK 注册的已配置 API Key 的提供商）
  private readonly customProviders = new Map<string, { name: string; baseUrl: string; apiKey: string }>();

  constructor(private readonly configService: ConfigService) {
    const dataDir = process.env.DATA_DIR || path.join(cwd(), 'data');
    this.modePath = path.join(dataDir, 'writing-mode.json');
    this.userKeysPath = path.join(dataDir, 'user-keys.json');
    this.customProvidersPath = path.join(dataDir, 'custom-providers.json');
    this.customScenesPath = path.join(dataDir, 'custom-scenes.json');
  }

  // ==================== 初始化 ====================

  async onModuleInit(): Promise<void> {
    await this.loadConfig();
    this.loadPersistedMode();
    this.loadPersistedUserKeys();
    this.loadPersistedCustomProviders();
    this.loadPersistedCustomScenes();
    this.logger.log(`模型路由引擎初始化完成，已加载 ${Object.keys(this.config.models).length} 个模型配置`);
  }

  /** 从持久化文件加载写作模式 */
  private loadPersistedMode(): void {
    try {
      if (fs.existsSync(this.modePath)) {
        const raw = fs.readFileSync(this.modePath, 'utf-8');
        const data = JSON.parse(raw);
        // 废弃的 custom 模式：自动恢复为 normal
        if (data.mode === 'custom') {
          this.currentMode = 'normal';
          this.logger.log('检测到已废弃的 custom 模式，已自动恢复为 normal');
          this.persistMode();
          return;
        }
        if (data.mode && ['economy', 'normal', 'premium'].includes(data.mode)) {
          this.currentMode = data.mode;
          this.hasPersistedMode = true;
          this.logger.log(`已恢复写作模式: ${data.mode}`);
        }
      }
    } catch (e) {
      this.logger.warn(`读取写作模式文件失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** 持久化当前写作模式 */
  private persistMode(): void {
    try {
      const dir = path.dirname(this.modePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.modePath, JSON.stringify({ mode: this.currentMode }), 'utf-8');
    } catch (e) {
      this.logger.warn(`保存写作模式失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** 从磁盘加载用户 API Key */
  private loadPersistedUserKeys(): void {
    try {
      if (fs.existsSync(this.userKeysPath)) {
        const raw = fs.readFileSync(this.userKeysPath, 'utf-8');
        const arr: UserKeyEntry[] = JSON.parse(raw);
        for (const entry of arr) {
          const projectId = String(entry.projectId || 'global').trim() || 'global';
          const modelName = String(entry.modelName || '').trim();
          const apiKey = String(entry.apiKey || '').trim();
          if (!modelName || !apiKey) continue;
          const key = `${projectId}_${modelName}`;
          this.userKeys.set(key, {
            ...entry,
            projectId,
            modelName,
            apiKey,
            baseUrl: typeof entry.baseUrl === 'string' && entry.baseUrl.trim() ? entry.baseUrl.trim() : undefined,
            createdAt: new Date(entry.createdAt),
            updatedAt: new Date(entry.updatedAt),
          });
        }
        this.logger.log(`已从磁盘恢复 ${arr.length} 个用户 API Key`);
      }
    } catch (e) {
      this.logger.warn(`读取用户 Key 文件失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** 持久化用户 API Key 到磁盘 */
  private persistUserKeys(): void {
    try {
      const dir = path.dirname(this.userKeysPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const arr = Array.from(this.userKeys.values());
      fs.writeFileSync(this.userKeysPath, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (e) {
      this.logger.warn(`保存用户 Key 失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** 从磁盘加载自定义提供商 */
  private loadPersistedCustomProviders(): void {
    try {
      if (fs.existsSync(this.customProvidersPath)) {
        const raw = fs.readFileSync(this.customProvidersPath, 'utf-8');
        const arr: Array<{ name: string; baseUrl: string; apiKey: string }> = JSON.parse(raw);
        for (const p of arr) {
          this.customProviders.set(p.name, p);
        }
        this.logger.log(`已从磁盘恢复 ${arr.length} 个自定义提供商`);
      }
    } catch (e) {
      this.logger.warn(`读取自定义提供商文件失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** 持久化自定义提供商到磁盘 */
  private persistCustomProviders(): void {
    try {
      const dir = path.dirname(this.customProvidersPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const arr = Array.from(this.customProviders.values());
      fs.writeFileSync(this.customProvidersPath, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (e) {
      this.logger.warn(`保存自定义提供商失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** 从磁盘加载自定义场景模型映射 */
  private loadPersistedCustomScenes(): void {
    try {
      if (fs.existsSync(this.customScenesPath)) {
        const raw = fs.readFileSync(this.customScenesPath, 'utf-8');
        const stored = JSON.parse(raw) as Record<string, unknown>;
        if (!this.hasPersistedMode) {
          const configuredModes = new Set(
            Object.keys(stored)
              .map(key => key.includes(':') ? key.slice(key.lastIndexOf(':') + 1) : '')
              .filter(mode => ['economy', 'normal', 'premium'].includes(mode)),
          );
          if (configuredModes.size === 1) {
            this.currentMode = [...configuredModes][0] as WritingMode;
            this.hasPersistedMode = true;
            this.persistMode();
            this.logger.log(`根据现有场景配置恢复写作模式: ${this.currentMode}`);
          }
        }
        this.customScenes = this.normalizeSceneMappings(stored);
        if (JSON.stringify(stored) !== JSON.stringify(this.customScenes)) this.persistCustomScenes();
        this.logger.log(`已从磁盘恢复 ${Object.keys(this.customScenes).length} 个自定义场景模型映射`);
      }
    } catch (e) {
      this.logger.warn(`读取自定义场景文件失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** 持久化自定义场景模型映射到磁盘 */
  private persistCustomScenes(): void {
    try {
      const dir = path.dirname(this.customScenesPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.customScenesPath, JSON.stringify(this.customScenes, null, 2), 'utf-8');
    } catch (e) {
      this.logger.warn(`保存自定义场景模型映射失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * 加载路由配置文件
   * 优先读取外部配置路径，其次使用内置 JSON
   */
  private async loadConfig(): Promise<void> {
    const configPath = this.configService.get<string>('ROUTE_CONFIG_PATH');
    if (configPath && fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      this.config = JSON.parse(raw);
      this.logger.log(`从外部配置加载路由表: ${configPath}`);
    } else {
      // 使用内置配置
      const builtInPath = path.join(__dirname, 'route-config.json');
      const raw = fs.readFileSync(builtInPath, 'utf-8');
      this.config = JSON.parse(raw);
      this.logger.log('加载内置路由配置');
    }
  }

  // ==================== 核心路由方法 ====================

  /**
   * 根据场景获取路由模型
   * @param scenario 写作场景名称
   * @param options 附加选项
   */
  getModelForScenario(
    scenario: string,
    options?: {
      chapterFunction?: string;      // 章节功能（正文生成时使用动态路由）
      retryCount?: number;           // 重试次数
      isClimax?: boolean;            // 是否是爆发章节
      role?: string;                 // 指定角色（writer/reviewer/planner）
    },
  ): RoutedModel {
    // 未指定场景（或显式 'default'/'daily'）只使用当前模式的日常模型。
    if (!scenario || scenario === 'default' || scenario === 'daily') {
      const dailyModel = this.customScenes[`daily:${this.currentMode}`];
      if (!dailyModel) {
        throw new Error(
          `未配置日常模型（场景: daily, 模式: ${this.currentMode}）。` +
          `请在「设置 → 模型配置」中为日常场景选择模型后再使用。` +
          `未单独配置任务模型时会使用日常模型，因此必须先配置。`
        );
      }
      const dailyVersion = dailyModel; // 配置什么版本就原样用什么名称，不做版本映射/别名
      this.logger.debug(`[日常模型] 未指定场景 → ${dailyVersion}`);
      return {
        modelName: dailyVersion,
        modelVersion: dailyVersion,
        temperature: this.config.scenarios.writing?.temperature ?? this.config.defaults.temperature,
        tier: 'configured',
        role: options?.role || 'writer',
      };
    }

    const routeScenario = modelSceneTab(scenario);
    if (routeScenario === 'daily' && !['daily', 'default'].includes(scenario)) {
      this.logger.debug(`未单独配置的场景 ${scenario} 使用日常场景模型`);
    }
    const scenarioRoute = routeScenario === 'daily'
      ? this.config.scenarios.writing
      : this.config.scenarios[routeScenario];
    if (!scenarioRoute) {
      throw new Error(`模型场景 ${routeScenario} 缺少温度配置`);
    }

    // Temperature 动态调节
    let temperature = scenarioRoute.temperature;
    temperature = this.adjustTemperature(temperature, options);

    // 【模型选择规则 · 严格按配置，不降级】
    // 1. 指定场景优先用该场景的自定义模型（customScenes）
    // 2. 场景未配置时，按当前模式明确继承日常模型
    // 3. 日常模型也未配置时，明确报错提醒用户配置，绝不静默降级到 route-config 默认模型
    // 配置什么模型就用什么模型，这是不同场景 tab 存在的意义。
    const dailyModel = this.customScenes[`daily:${this.currentMode}`];

    // 自定义场景模型：不管当前模式是什么，有自定义分配就优先使用
    const customKey = `${routeScenario}:${this.currentMode}`;
    const customModel = this.customScenes[customKey];
    if (customModel) {
      const customVersion = customModel; // 配置什么版本就原样用什么名称，不做版本映射/别名
      this.logger.debug(`[场景自定义] ${scenario}(${this.currentMode}) → ${customVersion}`);
      return {
        modelName: customVersion,
        modelVersion: customVersion,
        temperature,
        tier: 'configured',
        role: options?.role || 'writer',
      };
    }

    // 场景未配置：按当前模式继承日常模型
    if (dailyModel) {
      const dailyVersion = dailyModel; // 配置什么版本就原样用什么名称，不做版本映射/别名
      this.logger.debug(`[场景继承日常模型] ${scenario}(${this.currentMode}) → ${dailyVersion}`);
      return {
        modelName: dailyVersion,
        modelVersion: dailyVersion,
        temperature,
        tier: 'configured',
        role: options?.role || 'writer',
      };
    }

    // 日常模型也未配置：明确报错，绝不降级到 route-config 默认模型
    throw new Error(
      `场景「${scenario}」未配置模型，且日常模型也未配置（模式: ${this.currentMode}）。` +
      `请在「设置 → 模型配置」中为该场景或日常场景选择模型后再使用。` +
      `配置什么模型就用什么模型，未配置不自动降级——这是不同场景 tab 存在的意义。`
    );
  }

  /**
   * 获取所有可用模型版本列表（供前端下拉框使用）
   */
  getAvailableVersions(): Array<{ modelKey: string; versions: Array<{ id: string; label: string }> }> {
    const result: Array<{ modelKey: string; versions: Array<{ id: string; label: string }> }> = [];
    for (const [key, info] of Object.entries(this.config.models)) {
      if (info.versions && info.versions.length > 0) {
        result.push({
          modelKey: key,
          versions: info.versions.map(v => ({ id: v.id, label: v.label })),
        });
      }
    }
    return result;
  }

  // ==================== 写作模式管理 ====================

  /**
   * 设置写作模式（经济/常规/高品质）
   */
  setWritingMode(mode: WritingMode): void {
    this.currentMode = mode;
    this.hasPersistedMode = true;
    this.persistMode();
    this.logger.log(`写作模式已切换: ${WRITING_MODE_LABELS[mode]}`);
  }

  /**
   * 获取当前写作模式
   */
  getWritingMode(): WritingMode {
    return this.currentMode;
  }

  /**
   * 获取所有写作模式列表
   */
  getWritingModes(): Array<{ key: WritingMode; label: string }> {
    return Object.entries(WRITING_MODE_LABELS).map(([key, label]) => ({
      key: key as WritingMode,
      label,
    }));
  }

  /**
   * 获取指定角色的候选模型列表（按优先级排序）
   * @param role 角色名称
   */
  getRoleModels(role: string): RoleModelEntry[] {
    const roleConfig = this.config.roles[role];
    if (!roleConfig) {
      this.logger.warn(`未知角色: ${role}`);
      return [];
    }
    return [...roleConfig.models].sort((a, b) => a.priority - b.priority);
  }

  /**
   * 获取可用模型列表
   */
  getAvailableModels(): ModelInfo[] {
    return Object.values(this.config.models);
  }

  // ==================== Temperature 动态调节 ====================

  /**
   * 动态调节 Temperature
   * 规则：
   * - 基础温度 + 每次重试 +0.1
   * - 爆发章节 -0.2
   * - 范围约束 [0.2, 1.2]
   */
  private adjustTemperature(
    baseTemp: number,
    options?: { retryCount?: number; isClimax?: boolean },
  ): number {
    let temp = baseTemp;

    if (options?.retryCount && options.retryCount > 0) {
      temp += options.retryCount * 0.1;
    }

    if (options?.isClimax) {
      temp -= 0.2;
    }

    return Math.max(0.2, Math.min(1.2, temp));
  }

  // ==================== BYOK 管理 ====================

  /**
   * 注册用户自己的 API Key
   * @param projectId 项目ID
   * @param modelName 模型名称
   * @param apiKey API Key
   * @param baseUrl 可选自定义端点
   */
  registerUserKey(
    projectId: string,
    modelName: string,
    apiKey: string,
    baseUrl?: string,
  ): void {
    const normalizedProjectId = projectId.trim() || 'global';
    const normalizedModelName = modelName.trim();
    const normalizedApiKey = apiKey.trim();
    if (!normalizedModelName || !normalizedApiKey) throw new Error('提供商和 API Key 不能为空');
    const key = `${normalizedProjectId}_${normalizedModelName}`;
    this.userKeys.set(key, {
      projectId: normalizedProjectId,
      modelName: normalizedModelName,
      apiKey: normalizedApiKey,
      baseUrl: baseUrl?.trim() || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    this.logger.log(`已注册用户 Key: 项目=${normalizedProjectId}, 模型=${normalizedModelName}`);
    this.persistUserKeys();
  }

  /**
   * 获取用户的 API Key
   */
  getUserKey(projectId: string, modelName: string): UserKeyEntry | undefined {
    const key = `${projectId}_${modelName}`;
    return this.userKeys.get(key);
  }

  /**
   * 删除用户 API Key
   */
  removeUserKey(projectId: string, modelName: string): boolean {
    const key = `${projectId}_${modelName}`;
    const deleted = this.userKeys.delete(key);
    if (deleted) {
      this.logger.log(`已删除用户 Key: 项目=${projectId}, 模型=${modelName}`);
      this.persistUserKeys();
    }
    return deleted;
  }

  /**
   * 检查是否有用户的 API Key 可用
   */
  hasUserKey(projectId: string, modelName: string): boolean {
    return this.userKeys.has(`${projectId}_${modelName}`);
  }

  /**
   * 获取项目中已注册的所有 Key
   */
  getProjectKeys(projectId: string): UserKeyEntry[] {
    const result: UserKeyEntry[] = [];
    for (const [, entry] of this.userKeys) {
      if (entry.projectId === projectId) {
        result.push(entry);
      }
    }
    return result;
  }

  /**
   * 获取全部已注册 Key（设置页使用）
   */
  getAllUserKeys(): UserKeyEntry[] {
    return Array.from(this.userKeys.values());
  }

  // ==================== 自定义提供商管理 ====================

  /**
   * 注册自定义 AI 提供商
   */
  registerCustomProvider(name: string, baseUrl: string, apiKey: string): void {
    this.customProviders.set(name, { name, baseUrl, apiKey });
    this.logger.log(`已注册自定义提供商: ${name}`);
    this.persistCustomProviders();
  }

  /**
   * 获取所有已注册的自定义提供商
   */
  getCustomProviders(): Array<{ name: string; baseUrl: string }> {
    return Array.from(this.customProviders.values()).map(p => ({
      name: p.name,
      baseUrl: p.baseUrl,
    }));
  }

  /**
   * 删除自定义提供商
   */
  removeCustomProvider(name: string): boolean {
    const deleted = this.customProviders.delete(name);
    if (deleted) {
      this.persistCustomProviders();
    }
    return deleted;
  }

  /**
   * 获取已注册的 API Key 提供商列表（含内置和环境变量），用于拉取模型
   */
  getConfiguredProviders(): Array<{ name: string; baseUrl: string; apiKey: string }> {
    const providers: Array<{ name: string; baseUrl: string; apiKey: string }> = [];

    // 环境变量中的提供商
    const envConfigs = [
      { name: 'deepseek', envKey: 'DEEPSEEK_API_KEY', envUrl: 'DEEPSEEK_BASE_URL', defaultUrl: 'https://api.deepseek.com' },
      { name: 'openai', envKey: 'OPENAI_API_KEY', envUrl: 'OPENAI_BASE_URL', defaultUrl: 'https://api.openai.com' },
      { name: 'claude', envKey: 'CLAUDE_API_KEY', envUrl: 'CLAUDE_BASE_URL', defaultUrl: 'https://api.anthropic.com' },
      { name: 'zhipu', envKey: 'GLM_API_KEY', envUrl: 'GLM_BASE_URL', defaultUrl: 'https://open.bigmodel.cn/api/paas/v4' },
      { name: 'qwen', envKey: 'QWEN_API_KEY', envUrl: 'QWEN_BASE_URL', defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    ];
    for (const cfg of envConfigs) {
      const key = process.env[cfg.envKey];
      if (key) {
        providers.push({
          name: cfg.name,
          baseUrl: process.env[cfg.envUrl] || cfg.defaultUrl,
          apiKey: key,
        });
      }
    }

    // BYOK 注册的提供商
    for (const [, entry] of this.userKeys) {
      const existing = providers.find(p => p.name === entry.modelName);
      if (existing) {
        existing.apiKey = entry.apiKey;
        existing.baseUrl = entry.baseUrl || existing.baseUrl;
      } else {
        providers.push({
          name: entry.modelName,
          baseUrl: entry.baseUrl || 'https://api.deepseek.com',
          apiKey: entry.apiKey,
        });
      }
    }

    // 自定义提供商
    for (const [, cp] of this.customProviders) {
      providers.push(cp);
    }

    return providers;
  }

  // ==================== 辅助方法 ====================

  /**
   * 判断模型是否为高性能模型
   */
  isHighTier(modelName: string): boolean {
    return this.config.models[modelName]?.tier === 'high';
  }

  /**
   * 判断模型是否为低成本模型
   */
  isLowTier(modelName: string): boolean {
    return this.config.models[modelName]?.tier === 'low';
  }

  /**
   * 获取完整路由配置（供外部查看）
   */
  getConfig(): RouteConfig {
    return { ...this.config };
  }

  /**
   * 获取模型信息
   */
  getModelInfo(modelName: string): ModelInfo | undefined {
    return this.config.models[modelName];
  }

  // ==================== 自定义场景模型映射 ====================

  /**
   * 获取自定义场景模型映射
   */
  getCustomScenes(): Record<string, string> {
    return { ...this.customScenes };
  }

  /**
   * 保存自定义场景模型映射
   */
  setCustomScenes(scenes: Record<string, string>): void {
    this.customScenes = this.normalizeSceneMappings(scenes, true);
    this.logger.log(`自定义场景模型已保存: ${Object.keys(this.customScenes).length} 个场景模式`);
    this.persistCustomScenes();
  }

  private normalizeSceneMappings(raw: Record<string, unknown>, strict = false): Record<string, string> {
    const result: Record<string, string> = {};
    const allowedScenes = new Set(['idea_generate', 'outline', 'writing', 'polish', 'daily']);
    const modes: WritingMode[] = ['economy', 'normal', 'premium'];
    const canonicalModelId = (value: string) => {
      const modelId = value.trim();
      return modelId === 'deepseek-v4-flash' ? 'deepseek-flash' : modelId;
    };
    for (const [key, value] of Object.entries(raw || {})) {
      const separator = key.lastIndexOf(':');
      if (separator > 0 && typeof value === 'string' && value.trim()) {
        const scene = key.slice(0, separator);
        const mode = key.slice(separator + 1) as WritingMode;
        if (allowedScenes.has(scene) && modes.includes(mode)) result[`${scene}:${mode}`] = canonicalModelId(value);
        else if (strict) throw new Error(`无效场景模型配置: ${key}`);
        continue;
      }
      // One-time in-memory migration of historical flat/nested storage. Only
      // the canonical scene:mode form is persisted and used afterwards.
      if (!strict && allowedScenes.has(key) && typeof value === 'string' && value.trim()) {
        for (const mode of modes) result[`${key}:${mode}`] = canonicalModelId(value);
      } else if (!strict && allowedScenes.has(key) && value && typeof value === 'object' && !Array.isArray(value)) {
        for (const mode of modes) {
          const model = (value as Record<string, unknown>)[mode];
          if (typeof model === 'string' && model.trim()) result[`${key}:${mode}`] = canonicalModelId(model);
        }
      } else if (strict) {
        throw new Error(`无效场景模型配置: ${key}`);
      }
    }
    return result;
  }
}
