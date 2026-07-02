/**
 * ChainTemplateService - Prompt Chain 模板管理服务
 *
 * 管理 Chain 模板的 CRUD、验证、执行测试
 * 当前使用内存存储，后续可迁移到数据库
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ChainEngineService } from './chain-engine.service';
import {
  PromptChain,
  ChainNode,
  NodeType,
  ExecutionMode,
  ChainConfig,
  VariableDef,
  VariableSource,
} from './chain.types';

export interface ChainTemplate {
  id: string;
  name: string;
  version: string;
  description: string;
  nodes: ChainNode[];
  variables: VariableDef[];
  executionMode: ExecutionMode;
  config: ChainConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ChainTemplateSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  nodes: number;
  executionMode: ExecutionMode;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ChainTemplateService {
  private readonly logger = new Logger(ChainTemplateService.name);
  private templates: Map<string, ChainTemplate> = new Map();

  constructor(private readonly chainEngine: ChainEngineService) {
    this.seedDefaultTemplates();
  }

  /** 种子数据：预置三个默认 Chain 模板 */
  private seedDefaultTemplates(): void {
    const now = new Date().toISOString();

    this.templates.set('tianlong-8step', {
      id: 'tianlong-8step',
      name: '天龙8步正文生成',
      version: '1.0.0',
      description: '天龙8步法生成完整章节正文（目标→诱因→行动→阻碍→误判→反转→代价→钩子→合成→质检）',
      nodes: [
        { id: 'node_1_goal', name: '目标设定', type: 'prompt', chainId: 'tianlong-8step', promptTemplateId: 'tianlong-step1-goal', modelConfig: { primary: 'deepseek', temperature: 0.6, tier: 'balanced', maxTokens: 512 }, inputMapping: { chapter_context: 'user_input.chapterContext' }, outputMapping: { goal: 'node_1.goal' }, timeout: 60, retryCount: 0 },
        { id: 'node_2_trigger', name: '诱因', type: 'prompt', chainId: 'tianlong-8step', promptTemplateId: 'tianlong-step2-trigger', modelConfig: { primary: 'deepseek', temperature: 0.7, tier: 'balanced', maxTokens: 512 }, inputMapping: { goal: 'chain_output.node_1' }, outputMapping: { trigger: 'node_2.trigger' }, timeout: 60, retryCount: 0 },
        { id: 'node_3_action', name: '行动', type: 'prompt', chainId: 'tianlong-8step', promptTemplateId: 'tianlong-step3-action', modelConfig: { primary: 'deepseek', temperature: 0.8, tier: 'performance', maxTokens: 1024 }, inputMapping: { goal: 'chain_output.node_1', trigger: 'chain_output.node_2' }, outputMapping: { action: 'node_3.action' }, timeout: 120, retryCount: 1 },
        { id: 'node_4_obstacle', name: '阻碍', type: 'prompt', chainId: 'tianlong-8step', promptTemplateId: 'tianlong-step4-obstacle', modelConfig: { primary: 'deepseek', temperature: 0.7, tier: 'balanced', maxTokens: 1024 }, inputMapping: { action: 'chain_output.node_3' }, outputMapping: { obstacle: 'node_4.obstacle' }, timeout: 60, retryCount: 0 },
        { id: 'node_5_misjudge', name: '误判', type: 'prompt', chainId: 'tianlong-8step', promptTemplateId: 'tianlong-step5-misjudge', modelConfig: { primary: 'deepseek', temperature: 0.7, tier: 'balanced', maxTokens: 1024 }, inputMapping: { goal: 'chain_output.node_1', trigger: 'chain_output.node_2', action: 'chain_output.node_3', obstacle: 'chain_output.node_4' }, outputMapping: { misjudge: 'node_5.misjudge' }, timeout: 60, retryCount: 0 },
        { id: 'node_6_reversal', name: '反转', type: 'prompt', chainId: 'tianlong-8step', promptTemplateId: 'tianlong-step6-reversal', modelConfig: { primary: 'deepseek', temperature: 0.9, tier: 'performance', maxTokens: 1024 }, inputMapping: { goal: 'chain_output.node_1', trigger: 'chain_output.node_2', action: 'chain_output.node_3', obstacle: 'chain_output.node_4', misjudge: 'chain_output.node_5' }, outputMapping: { reversal: 'node_6.reversal' }, timeout: 120, retryCount: 1 },
        { id: 'node_7_cost', name: '代价', type: 'prompt', chainId: 'tianlong-8step', promptTemplateId: 'tianlong-step7-cost', modelConfig: { primary: 'deepseek', temperature: 0.6, tier: 'balanced', maxTokens: 512 }, inputMapping: { reversal: 'chain_output.node_6' }, outputMapping: { cost: 'node_7.cost' }, timeout: 60, retryCount: 0 },
        { id: 'node_8_hook', name: '钩子', type: 'prompt', chainId: 'tianlong-8step', promptTemplateId: 'tianlong-step8-hook', modelConfig: { primary: 'deepseek', temperature: 0.7, tier: 'balanced', maxTokens: 512 }, inputMapping: { goal: 'chain_output.node_1', trigger: 'chain_output.node_2', reversal: 'chain_output.node_6', cost: 'chain_output.node_7' }, outputMapping: { hook: 'node_8.hook' }, timeout: 60, retryCount: 0 },
        { id: 'node_9_synthesis', name: '章节合成', type: 'transform', chainId: 'tianlong-8step', modelConfig: { primary: 'deepseek', temperature: 0.3, tier: 'economy', maxTokens: 2048 }, inputMapping: { goal: 'chain_output.node_1', trigger: 'chain_output.node_2', action: 'chain_output.node_3', obstacle: 'chain_output.node_4', misjudge: 'chain_output.node_5', reversal: 'chain_output.node_6', cost: 'chain_output.node_7', hook: 'chain_output.node_8' }, outputMapping: { synthesis: 'node_9.synthesis' }, timeout: 30, retryCount: 0 },
        { id: 'node_10_qa', name: '章节质检', type: 'prompt', chainId: 'tianlong-8step', promptTemplateId: 'tianlong-chapter-qa', modelConfig: { primary: 'deepseek', temperature: 0.3, tier: 'economy', maxTokens: 512 }, inputMapping: { chapter_outline: 'chain_output.context.chapterOutline', full_text: 'chain_output.node_9' }, outputMapping: { qa: 'node_10.qa' }, timeout: 60, retryCount: 0 },
      ],
      variables: [
        { name: 'chapterContext', source: 'user_input', path: 'user_input.chapterContext', required: true },
      ],
      executionMode: 'sequential',
      config: { timeout: 240, maxRetries: 1, enableLogging: true, enableQualityGate: false, strictMode: false },
      createdAt: now,
      updatedAt: now,
    });

    // 灵感种子智能补全 chain
    this.templates.set('inspiration-seed-enrich', {
      id: 'inspiration-seed-enrich',
      name: '灵感种子智能补全',
      version: '1.2.0',
      description: '灵感转项目时自动丰富骨架种子实体（角色→世界观→组织→地点）',
      nodes: [
        { id: 'node_1_character', name: '角色深度补全', type: 'prompt', chainId: 'inspiration-seed-enrich', promptTemplateId: 'seed-character-enrich', modelConfig: { primary: 'deepseek', fallback: 'deepseek-v4-flash', temperature: 0.6, tier: 'economy' }, inputMapping: { hook: 'user_input.hook', description: 'user_input.description', characters: 'user_input.characters' }, outputMapping: {}, timeout: 30, retryCount: 2, skipOnEmptyInput: true, description: '基于角色名+hook生成性格五维/背景/对话风格' },
        { id: 'node_2_worldview', name: '世界观补全', type: 'prompt', chainId: 'inspiration-seed-enrich', promptTemplateId: 'seed-worldview-enrich', modelConfig: { primary: 'deepseek', fallback: 'deepseek-v4-flash', temperature: 0.5, tier: 'economy' }, inputMapping: { hook: 'user_input.hook', description: 'user_input.description', setting: 'user_input.setting' }, outputMapping: {}, timeout: 30, retryCount: 2, description: '基于setting+hook生成地理/历史/规则/势力格局' },
        { id: 'node_3_organization', name: '组织生成', type: 'prompt', chainId: 'inspiration-seed-enrich', promptTemplateId: 'seed-organization-gen', modelConfig: { primary: 'deepseek', fallback: 'deepseek-v4-pro', temperature: 0.6, tier: 'economy' }, inputMapping: { worldview: 'chain_output.node_2_worldview' }, outputMapping: {}, timeout: 20, retryCount: 1, description: '基于世界观生成2-3个主要势力' },
        { id: 'node_4_location', name: '地点生成', type: 'prompt', chainId: 'inspiration-seed-enrich', promptTemplateId: 'seed-location-gen', modelConfig: { primary: 'deepseek', fallback: 'deepseek-v4-flash', temperature: 0.6, tier: 'economy' }, inputMapping: { worldview: 'chain_output.node_2_worldview', isLong: 'user_input.isLong' }, outputMapping: {}, timeout: 30, retryCount: 2, description: '长篇按6层层级/短篇简化生成地点' },
      ],
      variables: [
        { name: 'hook', source: 'user_input', path: 'user_input.hook', required: false },
        { name: 'description', source: 'user_input', path: 'user_input.description', required: false },
        { name: 'setting', source: 'user_input', path: 'user_input.setting', required: false },
        { name: 'characters', source: 'user_input', path: 'user_input.characters', required: false },
        { name: 'isLong', source: 'user_input', path: 'user_input.isLong', required: false },
      ],
      executionMode: 'sequential',
      config: { timeout: 120, maxRetries: 2, enableLogging: true, enableQualityGate: false, strictMode: false },
      createdAt: now,
      updatedAt: now,
    });

    // 长篇灵活大纲 chain (v2.0: 单次LLM调用综合生成)
    this.templates.set('long-novel-flexible-outline', {
      id: 'long-novel-flexible-outline',
      name: '长篇灵活大纲',
      version: '2.0.0',
      description: '单次LLM调用综合生成完整大纲（核心设定+世界观7维+角色5+6维+卷章结构+伏笔10+反转3+时间线10+）',
      nodes: [
        { id: 'node_1_comprehensive', name: '综合大纲生成', type: 'prompt', chainId: 'long-novel-flexible-outline', promptTemplateId: 'long-novel-comprehensive-outline', modelConfig: { primary: 'deepseek', temperature: 0.7, tier: 'performance', maxTokens: 8192 }, inputMapping: { story_setting: 'user_input.story_setting', targetWords: 'user_input.targetWords', genre: 'user_input.genre', chapterLimit: 'user_input.chapterLimit' }, outputMapping: { coreSetting: 'node_1.coreSetting', worldview: 'node_1.worldview', characters: 'node_1.characters', volumes: 'node_1.volumes', foreshadowings: 'node_1.foreshadowings', reversals: 'node_1.reversals', timeline: 'node_1.timeline' }, timeout: 300, retryCount: 1 },
      ],
      variables: [
        { name: 'story_setting', source: 'user_input', path: 'user_input.story_setting', required: true },
        { name: 'targetWords', source: 'user_input', path: 'user_input.targetWords', required: true },
        { name: 'genre', source: 'user_input', path: 'user_input.genre', required: false },
        { name: 'chapterLimit', source: 'user_input', path: 'user_input.chapterLimit', required: false, defaultValue: '30' },
      ],
      executionMode: 'sequential',
      config: { timeout: 240, maxRetries: 2, enableLogging: true, enableQualityGate: false, strictMode: false },
      createdAt: now,
      updatedAt: now,
    });

    // 长篇初始地基 chain (v1.0: 创建时仅生成核心设定+世界观+卷骨架)
    this.templates.set('long-novel-init-foundation', {
      id: 'long-novel-init-foundation',
      name: '长篇初始地基',
      version: '1.0.0',
      description: '创建长篇项目时生成核心设定（14字段）+世界观（7维详细）+卷骨架（供后续增删改查）',
      nodes: [
        { id: 'node_1_foundation', name: '核心设定+世界观生成', type: 'prompt', chainId: 'long-novel-init-foundation', promptTemplateId: 'long-novel-init-foundation', modelConfig: { primary: 'deepseek', temperature: 0.7, tier: 'performance', maxTokens: 4096 }, inputMapping: { story_setting: 'user_input.story_setting', targetWords: 'user_input.targetWords', genre: 'user_input.genre' }, outputMapping: { coreSetting: 'node_1.coreSetting', worldview: 'node_1.worldview', skeletonVolumes: 'node_1.skeletonVolumes' }, timeout: 120, retryCount: 1 },
      ],
      variables: [
        { name: 'story_setting', source: 'user_input', path: 'user_input.story_setting', required: true },
        { name: 'targetWords', source: 'user_input', path: 'user_input.targetWords', required: true },
        { name: 'genre', source: 'user_input', path: 'user_input.genre', required: false },
      ],
      executionMode: 'sequential',
      config: { timeout: 150, maxRetries: 2, enableLogging: true, enableQualityGate: false, strictMode: false },
      createdAt: now,
      updatedAt: now,
    });
  }
  getSummaries(): ChainTemplateSummary[] {
    return Array.from(this.templates.values()).map(t => ({
      id: t.id,
      name: t.name,
      version: t.version,
      description: t.description,
      nodes: t.nodes.length,
      executionMode: t.executionMode,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  /** 获取完整模板详情 */
  getDetail(id: string): ChainTemplate {
    const tmpl = this.templates.get(id);
    if (!tmpl) throw new NotFoundException(`Chain 模板不存在: ${id}`);
    return tmpl;
  }

  /** 保存模板（创建或更新） */
  save(data: {
    id?: string;
    name: string;
    description: string;
    nodes: any[];
    variables?: any[];
    executionMode?: ExecutionMode;
    config?: Partial<ChainConfig>;
  }): ChainTemplate {
    const now = new Date().toISOString();
    const existing = data.id ? this.templates.get(data.id) : undefined;

    const template: ChainTemplate = {
      id: data.id || uuidv4(),
      name: data.name,
      version: existing ? this.bumpVersion(existing.version) : '1.0.0',
      description: data.description,
      nodes: data.nodes.map((n, i) => ({
        ...n,
        id: n.id || `node_${i + 1}_${n.name?.toLowerCase().replace(/\s+/g, '_') || 'unnamed'}`,
        chainId: data.id || uuidv4(),
      })),
      variables: (data.variables || []).map((v: any) => ({
        name: v.name,
        source: v.source as VariableSource,
        path: v.path,
        required: v.required,
        defaultValue: v.defaultValue,
        description: v.description,
      })),
      executionMode: data.executionMode || 'sequential',
      config: {
        timeout: data.config?.timeout ?? 300,
        maxRetries: data.config?.maxRetries ?? 1,
        enableLogging: data.config?.enableLogging ?? true,
        enableQualityGate: data.config?.enableQualityGate ?? false,
        strictMode: data.config?.strictMode ?? false,
      },
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.templates.set(template.id, template);
    this.logger.log(`保存 Chain 模板: ${template.id} (${template.name})`);
    return template;
  }

  /** 删除模板 */
  delete(id: string): void {
    if (!this.templates.has(id)) {
      throw new NotFoundException(`Chain 模板不存在: ${id}`);
    }
    this.templates.delete(id);
    this.logger.log(`删除 Chain 模板: ${id}`);
  }

  /** 复制模板 */
  duplicate(id: string): ChainTemplate {
    const original = this.getDetail(id);
    const now = new Date().toISOString();
    const dupe: ChainTemplate = {
      ...original,
      id: uuidv4(),
      name: `${original.name} (副本)`,
      version: '1.0.0',
      description: `${original.description} (由 ${original.id} 复制)`,
      createdAt: now,
      updatedAt: now,
    };
    this.templates.set(dupe.id, dupe);
    this.logger.log(`复制 Chain 模板: ${id} → ${dupe.id}`);
    return dupe;
  }

  /** 验证 Chain 结构 */
  validate(chainData: { nodes: any[]; executionMode?: string }): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!chainData.nodes || chainData.nodes.length === 0) {
      errors.push('Chain 必须包含至少一个节点');
      return { valid: false, errors, warnings };
    }

    // 检查节点 ID 唯一性
    const ids = chainData.nodes.map(n => n.id);
    const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupIds.length > 0) {
      errors.push(`节点 ID 重复: ${[...new Set(dupIds)].join(', ')}`);
    }

    // 检查节点有效性
    const validTypes: NodeType[] = ['prompt', 'condition', 'parallel', 'loop', 'transform'];
    for (const node of chainData.nodes) {
      if (!node.name) errors.push(`节点 ${node.id || '(未命名)'} 缺少名称`);
      if (!validTypes.includes(node.type)) {
        errors.push(`节点 ${node.name || node.id} 类型无效: ${node.type}，有效类型: ${validTypes.join(', ')}`);
      }
      if (node.type === 'prompt' && !node.promptTemplateId) {
        warnings.push(`Prompt 节点 ${node.name || node.id} 未指定模板`);
      }
      if (!node.id) errors.push('所有节点必须包含 id 字段');
    }

    // 检查是否有孤立节点（没有连接）
    if (chainData.nodes.length > 1) {
      const hasAnyEdges = chainData.nodes.some(n => (n.nextOnSuccess?.length || 0) > 0 || n.branches?.length > 0);
      if (!hasAnyEdges) {
        warnings.push('多个节点但未定义节点间连接关系（nextOnSuccess）');
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /** 执行 Chain 测试 */
  async executeTest(id: string, testData?: Record<string, unknown>): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    const template = this.getDetail(id);

    // 将模板转换为 PromptChain 格式
    const chain: PromptChain = {
      id: template.id,
      name: template.name,
      version: template.version,
      description: template.description,
      nodes: template.nodes,
      variables: template.variables,
      executionMode: template.executionMode,
      config: template.config,
    };

    const userInput = testData || { material: '测试数据', platform: 'zhihu', keywords: '测试' };

    try {
      const result = await this.chainEngine.execute(chain, userInput);
      return { success: result.status === 'completed' || result.status === 'partial', result };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '执行失败' };
    }
  }

  /**
   * 正式执行 Chain（用于生产流程，非测试）
   * 返回 ChainExecutionResult，包含 outputs / nodeResults / status 等
   */
  async executeChain(id: string, userInput: Record<string, unknown>): Promise<any> {
    const template = this.getDetail(id);

    const chain: PromptChain = {
      id: template.id,
      name: template.name,
      version: template.version,
      description: template.description,
      nodes: template.nodes,
      variables: template.variables,
      executionMode: template.executionMode,
      config: template.config,
    };

    const result = await this.chainEngine.execute(chain, userInput);
    return result; // 直接返回 ChainExecutionResult
  }

  private bumpVersion(current: string): string {
    const parts = current.split('.').map(Number);
    if (parts.length !== 3) return '1.0.1';
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}
