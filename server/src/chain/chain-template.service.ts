/**
 * 固定生产编排。
 *
 * Prompt Chain 可视化编辑器和运行时 CRUD 已删除。生产环境只保留两条当前长篇流程所需的
 * 固定编排，不能在运行时新增、复制、改写或执行任意 Chain，避免出现第二套小说生产线。
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChainEngineService } from './chain-engine.service';
import type { ChainTemplate, ChainTemplateSummary } from './chain-template.types';
import type { PromptChain } from './chain.types';

const FIXED_CHAIN_IDS = new Set([
  'long-novel-init-foundation',
  'long-novel-flexible-outline',
]);

@Injectable()
export class ChainTemplateService {
  private readonly templates = new Map<string, ChainTemplate>();

  constructor(private readonly chainEngine: ChainEngineService) {
    this.registerFixedProductionChains();
  }

  private registerFixedProductionChains(): void {
    const now = 'code-defined';

    this.templates.set('long-novel-init-foundation', {
      id: 'long-novel-init-foundation',
      name: '长篇初始地基',
      version: '2.0.0',
      description: '主线与结局骨架验收通过后，以该骨架为输入生成世界规则',
      nodes: [
        {
          id: 'node_1_skeleton', name: '主线与结局骨架', type: 'prompt', chainId: 'outline',
          promptTemplateId: 'long-novel-main-skeleton', modelConfig: { temperature: 0.7 },
          inputMapping: { story_setting: 'user_input.story_setting', targetWords: 'user_input.targetWords', genre: 'user_input.genre' },
          outputMapping: {}, timeout: 120, retryCount: 0,
        },
        {
          id: 'node_2_worldview', name: '世界规则', type: 'prompt', chainId: 'world_building',
          promptTemplateId: 'long-novel-init-worldview', modelConfig: { temperature: 0.6 },
          inputMapping: { story_setting: 'user_input.story_setting', skeleton: 'chain_output.node_1_skeleton', genre: 'user_input.genre' },
          outputMapping: {}, timeout: 120, retryCount: 0,
        },
      ],
      variables: [
        { name: 'story_setting', source: 'user_input', path: 'user_input.story_setting', required: true },
        { name: 'targetWords', source: 'user_input', path: 'user_input.targetWords', required: true },
        { name: 'genre', source: 'user_input', path: 'user_input.genre', required: false },
      ],
      executionMode: 'sequential',
      config: { timeout: 300, maxRetries: 0, enableLogging: true, strictMode: true },
      createdAt: now,
      updatedAt: now,
    });

    this.templates.set('long-novel-flexible-outline', {
      id: 'long-novel-flexible-outline',
      name: '长篇灵活大纲',
      version: '1.0.0',
      description: '剧情分析→分卷大纲→章纲三阶段固定生成流程',
      nodes: [
        {
          id: 'node_1_analysis', name: '剧情分析', type: 'prompt', chainId: 'long-novel-flexible-outline',
          promptTemplateId: 'long-novel-story-analysis', modelConfig: { temperature: 0.5 },
          inputMapping: {
            story_setting: 'user_input.story_setting', targetWords: 'user_input.targetWords', genre: 'user_input.genre',
            chapterLimit: 'user_input.chapterLimit', platform_directive: 'user_input.platform_directive',
          },
          outputMapping: {}, timeout: 240, retryCount: 0,
        },
        {
          id: 'node_2_volumes', name: '分卷大纲', type: 'prompt', chainId: 'long-novel-flexible-outline',
          promptTemplateId: 'long-novel-volume-outline', modelConfig: { temperature: 0.6 },
          inputMapping: {
            story_setting: 'user_input.story_setting', platform_directive: 'user_input.platform_directive',
            chapterLimit: 'user_input.chapterLimit',
          },
          outputMapping: {}, timeout: 420, retryCount: 0,
        },
        {
          id: 'node_3_chapters', name: '章纲生成', type: 'prompt', chainId: 'long-novel-flexible-outline',
          promptTemplateId: 'long-novel-chapter-outline', modelConfig: { temperature: 0.6 },
          inputMapping: {
            story_setting: 'user_input.story_setting', platform_directive: 'user_input.platform_directive',
            chapterLimit: 'user_input.chapterLimit', wordRangeText: 'user_input.wordRangeText',
          },
          outputMapping: {}, timeout: 600, retryCount: 0,
        },
      ],
      variables: [
        { name: 'story_setting', source: 'user_input', path: 'user_input.story_setting', required: true },
        { name: 'targetWords', source: 'user_input', path: 'user_input.targetWords', required: true },
        { name: 'genre', source: 'user_input', path: 'user_input.genre', required: false },
        { name: 'chapterLimit', source: 'user_input', path: 'user_input.chapterLimit', required: false },
        { name: 'platform_directive', source: 'user_input', path: 'user_input.platform_directive', required: true },
        { name: 'wordRangeText', source: 'user_input', path: 'user_input.wordRangeText', required: true },
        { name: 'planning', source: 'user_input', path: 'user_input.planning', required: false },
      ],
      executionMode: 'sequential',
      config: { timeout: 1500, maxRetries: 0, enableLogging: true, strictMode: false },
      createdAt: now,
      updatedAt: now,
    });
  }

  getSummaries(): ChainTemplateSummary[] {
    return [...this.templates.values()].map(template => ({
      id: template.id,
      name: template.name,
      version: template.version,
      description: template.description,
      nodes: template.nodes.length,
      executionMode: template.executionMode,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    }));
  }

  getDetail(id: string): ChainTemplate {
    this.assertFixed(id);
    const template = this.templates.get(id);
    if (!template) throw new NotFoundException(`固定生产流程不存在: ${id}`);
    return template;
  }

  async executeChain(
    id: string,
    userInput: Record<string, unknown>,
    onProgress?: (nodeIndex: number, nodeId: string, status: 'started' | 'completed' | 'failed', result?: any) => void,
  ): Promise<any> {
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
    return this.chainEngine.execute(chain, userInput, onProgress);
  }

  /** 以下方法只为旧 Controller 编译期过渡；运行时能力已经删除。 */
  save(): never { throw this.removed(); }
  delete(): never { throw this.removed(); }
  duplicate(): never { throw this.removed(); }
  validate(): never { throw this.removed(); }
  executeTest(): never { throw this.removed(); }

  private assertFixed(id: string): void {
    if (!FIXED_CHAIN_IDS.has(id)) {
      throw new BadRequestException(`运行时 Prompt Chain 已删除，不允许执行任意流程: ${id}`);
    }
  }

  private removed(): BadRequestException {
    return new BadRequestException('运行时 Prompt Chain 编辑/保存/复制/测试能力已删除；小说流程只允许代码定义的固定生产链');
  }
}
