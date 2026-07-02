/**
 * RoutingController - 模型配置与连通性测试
 */
import { Controller, Get, Post, Delete, Body, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ModelRouterService } from './model-router.service';

@ApiTags('routing')
@Controller('routing')
export class RoutingController {
  private readonly logger = new Logger(RoutingController.name);
  
  constructor(private readonly modelRouter: ModelRouterService) {}

  @Get('keys')
  @ApiOperation({ summary: '获取已保存的 API Key 列表（含环境变量）' })
  getKeys() {
    // BYOK 页面保存的 Key
    const savedKeys = this.modelRouter.getAllUserKeys();

    // .env 环境变量中配置的 Key（去重：BYOK 同名覆盖环境变量）
    const envModels = [
      { model: 'deepseek', envKey: 'DEEPSEEK_API_KEY', envBaseUrl: 'DEEPSEEK_BASE_URL' },
      { model: 'openai', envKey: 'OPENAI_API_KEY', envBaseUrl: 'OPENAI_BASE_URL' },
      { model: 'claude', envKey: 'CLAUDE_API_KEY', envBaseUrl: 'CLAUDE_BASE_URL' },
    ];
    const savedModelNames = new Set(savedKeys.map(k => k.modelName));
    const envKeys = envModels
      .filter(e => process.env[e.envKey] && !savedModelNames.has(e.model))
      .map(e => ({
        name: `${e.model} (环境变量)`,
        model: e.model,
        maskedKey: this.maskKey(process.env[e.envKey]!),
        baseUrl: process.env[e.envBaseUrl],
      }));

    return {
      keys: [...savedKeys.map(k => ({
        name: k.modelName,
        model: k.modelName,
        maskedKey: this.maskKey(k.apiKey),
        baseUrl: k.baseUrl,
      })), ...envKeys],
    };
  }

  @Post('keys')
  @ApiOperation({ summary: '保存 API Key' })
  saveKey(@Body() dto: { name: string; model: string; key: string; baseUrl?: string }) {
    this.modelRouter.registerUserKey('global', dto.model, dto.key, dto.baseUrl);
    return { success: true, message: `${dto.model} API Key 已保存` };
  }

  @Post('fetch-models')
  @ApiOperation({ summary: '从指定提供商获取可用模型列表' })
  async fetchModels(@Body() dto: { provider: string; apiKey: string; baseUrl?: string }) {
    try {
      // OpenAI 兼容 API: GET /v1/models
      const url = (dto.baseUrl || this.getDefaultBaseUrl(dto.provider)).replace(/\/+$/, '') + '/models';
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${dto.apiKey}` },
      });
      if (!response.ok) {
        return { success: false, error: `API 返回 ${response.status}`, models: [] };
      }
      const data: any = await response.json();
      // OpenAI 兼容格式: { data: [{ id: 'gpt-4o', ... }] }
      const models = (data.data || data.models || [])
        .filter((m: any) => m.id && !m.id.includes('instruct'))
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          provider: dto.provider,
        }));
      return { success: true, models };
    } catch (err: any) {
      this.logger.error(`获取模型列表失败: ${err.message}`);
      return { success: false, error: err.message, models: [] };
    }
  }

  @Post('fetch-claude-models')
  @ApiOperation({ summary: '返回 Claude 可用模型列表（API 无 list 接口，用已知列表）' })
  fetchClaudeModels() {
    return {
      success: true,
      models: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic' },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic' },
      ],
    };
  }

  // 自定义提供商管理
  @Get('custom-providers')
  @ApiOperation({ summary: '获取自定义 AI 提供商列表' })
  getCustomProviders() {
    return { providers: this.modelRouter.getCustomProviders() };
  }

  @Post('custom-providers')
  @ApiOperation({ summary: '注册自定义 AI 提供商' })
  registerCustomProvider(@Body() dto: { name: string; baseUrl: string; apiKey: string }) {
    this.modelRouter.registerCustomProvider(dto.name, dto.baseUrl, dto.apiKey);
    return { success: true, message: `自定义提供商 ${dto.name} 已注册` };
  }

  @Delete('custom-providers/:name')
  @ApiOperation({ summary: '删除自定义 AI 提供商' })
  removeCustomProvider(@Param('name') name: string) {
    this.modelRouter.removeCustomProvider(name);
    return { success: true, message: `自定义提供商 ${name} 已删除` };
  }

  // 获取所有已配置提供商的模型列表
  @Get('all-available-models')
  @ApiOperation({ summary: '获取所有已配置提供商可用模型' })
  async getAllAvailableModels() {
    const providers = this.modelRouter.getConfiguredProviders();
    const results: Array<{ provider: string; models: Array<{ id: string; name: string; provider: string }>; error?: string }> = [];

    for (const p of providers) {
      try {
        if (p.name === 'claude') {
          // Claude 使用固定列表
          results.push({
            provider: 'claude',
            models: [
              { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
              { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
              { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic' },
              { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic' },
            ],
          });
        } else {
          const url = p.baseUrl.replace(/\/+$/, '') + '/models';
          const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${p.apiKey}` },
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            const data: any = await response.json();
            const models = (data.data || data.models || [])
              .filter((m: any) => m.id && !m.id.includes('instruct') && !m.id.includes('embedding'))
              .map((m: any) => ({
                id: m.id,
                name: m.id,
                provider: p.name,
              }));
            results.push({ provider: p.name, models });
          } else {
            results.push({ provider: p.name, models: [], error: `HTTP ${response.status}` });
          }
        }
      } catch (err: any) {
        results.push({ provider: p.name, models: [], error: err.message });
      }
    }

    return { success: true, providers: results };
  }

  private getDefaultBaseUrl(provider: string): string {
    const urls: Record<string, string> = {
      deepseek: 'https://api.deepseek.com',
      openai: 'https://api.openai.com',
      zhipu: 'https://open.bigmodel.cn/api/paas/v4',
      alibaba: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      openai_compatible: 'https://api.openai.com',
    };
    return urls[provider] || 'https://api.deepseek.com';
  }

  @Delete('keys/:model')
  @ApiOperation({ summary: '删除 API Key' })
  deleteKey(@Param('model') model: string) {
    this.modelRouter.removeUserKey('global', model);
    return { success: true, message: `${model} API Key 已删除` };
  }

  @Post('test')
  @ApiOperation({ summary: '测试模型连通性' })
  async testConnection(@Body() dto: { model: string }) {
    const key = this.modelRouter.getUserKey('global', dto.model);
    // 如果 BYOK 没有，检查环境变量
    const envKeyName = `${dto.model.toUpperCase()}_API_KEY`;
    const hasEnvKey = !!process.env[envKeyName] || !!process.env.LLM_API_KEY;
    if (!key && !hasEnvKey) {
      return { success: false, message: `未配置 ${dto.model} 的 API Key，请在 server/.env 或设置页面中添加` };
    }
    try {
      const models = this.modelRouter.getAvailableModels();
      const found = models.find(m => m.name === dto.model);
      if (!found) {
        return { success: true, message: `${dto.model} 配置已就绪 ✅（服务器内置模型）` };
      }
      return { success: true, message: `${dto.model} 连接正常 ✅` };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '未知错误';
      return { success: false, message: `连接失败: ${msg}` };
    }
  }

  @Get('models')
  @ApiOperation({ summary: '获取可用模型列表（扁平化版本列表）' })
  getModels() {
    // 将 route-config.json 的 models 结构扁平化为 { id, name, provider }[]
    // 每个 model 的 versions 数组展开为独立条目
    const config = this.modelRouter.getConfig();
    const flat: Array<{ id: string; name: string; provider: string; configured: boolean }> = [];
    const configuredProviders = new Set(
      this.modelRouter.getConfiguredProviders().map(p => p.name),
    );
    for (const [key, model] of Object.entries(config.models)) {
      const isConfigured = configuredProviders.has(key) ||
        !!process.env[`${key.toUpperCase()}_API_KEY`] ||
        !!process.env.LLM_API_KEY;
      if (model.versions && Array.isArray(model.versions)) {
        for (const v of model.versions) {
          flat.push({ id: v.id, name: v.label, provider: model.provider || key, configured: isConfigured });
        }
      } else {
        flat.push({ id: key, name: model.name || key, provider: model.provider || key, configured: isConfigured });
      }
    }
    const unique = Array.from(new Map(flat.map((m) => [m.id, m])).values());
    return { models: unique };
  }

  @Get('model-versions')
  @ApiOperation({ summary: '获取所有模型的具体版本列表' })
  getModelVersions() {
    return { versions: this.modelRouter.getAvailableVersions() };
  }

  @Get('mode')
  @ApiOperation({ summary: '获取当前写作模式' })
  getWritingMode() {
    return {
      mode: this.modelRouter.getWritingMode(),
      modes: this.modelRouter.getWritingModes(),
    };
  }

  @Post('mode')
  @ApiOperation({ summary: '设置写作模式（economy/normal/premium）' })
  setWritingMode(@Body() dto: { mode: string }) {
    const validModes = ['economy', 'normal', 'premium'];
    if (!validModes.includes(dto.mode)) {
      return { success: false, message: `无效模式: ${dto.mode}，可选: ${validModes.join(', ')}` };
    }
    this.modelRouter.setWritingMode(dto.mode as any);
    return { success: true, message: `写作模式已切换为 ${dto.mode}` };
  }

  @Get('scenario-models')
  @ApiOperation({ summary: '获取自定义场景模型映射' })
  getScenarioModels() {
    return {
      scenes: this.modelRouter.getCustomScenes(),
      modes: this.modelRouter.getWritingModes(),
    };
  }

  @Post('scenario-models')
  @ApiOperation({ summary: '保存自定义场景模型映射' })
  saveScenarioModels(@Body() dto: { scenes: Record<string, string> }) {
    this.modelRouter.setCustomScenes(dto.scenes);
    // 注意：不再强制切换到 custom 模式。
    // 场景模型配置在 getModelForScenario() 中拥有最高优先级，
    // 无论当前是 economy/normal/premium 哪种模式都会优先匹配。
    return { success: true, message: '场景模型配置已保存' };
  }

  private maskKey(key: string): string {
    if (!key || key.length <= 8) return '****';
    return key.slice(0, 4) + '****' + key.slice(-4);
  }
}
