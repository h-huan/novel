/**
 * SeedEnrichChainService - 灵感种子智能补全 Chain 服务
 *
 * 将灵感种子（骨架实体）通过 Prompt Chain 丰富为完整设定：
 * 1. 构建 ChainEngine 执行参数
 * 2. 执行 inspiration-seed-enrich chain（角色→世界观→组织→地点）
 * 3. 将 chain 输出回填到种子实体（update/create）
 *
 * 设计文档: server/src/chain/docs/inspiration-seed-enrich-chain.md (v1.2.0)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ChainEngineService } from './chain-engine.service';
import { ChainTemplateService } from './chain-template.service';
import { PromptRegistryService } from './prompt-registry.service';
import type { ChainResult, PromptChain } from './chain.types';
import { CharacterService } from '../modules/character/character.service';
import { WorldSettingService } from '../modules/world-setting/world-setting.service';
import { OrganizationService } from '../modules/organization/organization.service';
import { MapPointService } from '../modules/map-point/map-point.service';
import type { MapLevel } from '@novel/shared';

/** chain 输入 */
export interface SeedEnrichInput {
  hook: string;
  description: string;
  setting: string;
  characters: string[];
  isLong: boolean;
}

/** 已创建的骨架种子（用于回填） */
export interface SeedEnrichContext {
  projectId: string;
  characters: { id: string; name: string }[];
  worldSettingId?: string;
}

/** 补全结果摘要 */
export interface SeedEnrichResult {
  status: 'completed' | 'partial' | 'failed';
  enriched: {
    characters: number;
    worldSetting: boolean;
    organizations: number;
    locations: number;
  };
  errors: string[];
  latency: number;
}

// ==================== Chain 输出接口（内部类型） ====================

interface CharacterEnrichItem {
  name: string;
  personality?: {
    extraversion: number;
    agreeableness: number;
    conscientiousness: number;
    neuroticism: number;
    openness: number;
  };
  background?: string;
  appearance?: string;
  dialogueStyle?: string;
  dialoguePatterns?: string[];
}

interface WorldviewEnrichOutput {
  name?: string;
  era?: string;
  geography?: string;
  history?: string;
  rules?: string;
  factionLayout?: string;
  constraints?: Array<{
    category: string;
    rule: string;
    description: string;
    severity: string;
  }>;
}

interface OrganizationGenItem {
  name: string;
  type: string;
  description: string;
}

interface LocationGenItem {
  name: string;
  level: string;
  parentId?: string;
  description: string;
}

/** MapLevel 排序优先级（父级在前） */
const LEVEL_ORDER: Record<string, number> = {
  world: 0,
  region: 1,
  country: 2,
  city: 3,
  location: 4,
  scene: 5,
};

@Injectable()
export class SeedEnrichChainService {
  private readonly logger = new Logger(SeedEnrichChainService.name);

  constructor(
    private readonly chainEngine: ChainEngineService,
    private readonly chainTemplate: ChainTemplateService,
    private readonly promptRegistry: PromptRegistryService,
    private readonly characterService: CharacterService,
    private readonly worldSettingService: WorldSettingService,
    private readonly organizationService: OrganizationService,
    private readonly mapPointService: MapPointService,
  ) {}

  /**
   * 执行灵感种子智能补全
   *
   * @param input  灵感数据
   * @param ctx    已创建的骨架种子上下文
   * @returns      补全结果摘要
   */
  async enrichSeeds(
    input: SeedEnrichInput,
    ctx: SeedEnrichContext,
  ): Promise<SeedEnrichResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const enriched = {
      characters: 0,
      worldSetting: false,
      organizations: 0,
      locations: 0,
    };

    try {
      // 1. 获取 chain 定义
      const chainTemplate = this.chainTemplate.getDetail('inspiration-seed-enrich');
      const chain: PromptChain = {
        id: chainTemplate.id,
        name: chainTemplate.name,
        version: chainTemplate.version,
        description: chainTemplate.description,
        nodes: chainTemplate.nodes,
        variables: chainTemplate.variables,
        executionMode: chainTemplate.executionMode,
        config: chainTemplate.config,
      };

      // 2. 执行 chain
      this.logger.log(
        `[seed-enrich] 开始执行，project=${ctx.projectId}，角色数=${input.characters.length}`,
      );
      const chainResult = await this.chainEngine.execute(chain, {
        hook: input.hook,
        description: input.description,
        setting: input.setting,
        characters: input.characters,
        isLong: input.isLong,
      });

      this.logger.log(
        `[seed-enrich] chain 执行完成，状态=${chainResult.status}，耗时=${chainResult.totalLatency}ms`,
      );

      // 3. 回填结果到种子实体
      // node_1: 角色回填
      try {
        const charOutput = chainResult.outputs['node_1_character'] as
          | { characters?: CharacterEnrichItem[] }
          | undefined;
        if (charOutput?.characters) {
          enriched.characters = this.applyCharacterEnrichment(
            charOutput.characters,
            ctx,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[seed-enrich] 角色回填失败: ${msg}`);
        errors.push(`角色回填失败: ${msg}`);
      }

      // node_2: 世界观回填
      try {
        const worldOutput = chainResult.outputs['node_2_worldview'] as
          | WorldviewEnrichOutput
          | undefined;
        if (worldOutput && ctx.worldSettingId) {
          enriched.worldSetting = this.applyWorldviewEnrichment(
            worldOutput,
            ctx.worldSettingId,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[seed-enrich] 世界观回填失败: ${msg}`);
        errors.push(`世界观回填失败: ${msg}`);
      }

      // node_3: 组织新建
      try {
        const orgOutput = chainResult.outputs['node_3_organization'] as
          | { organizations?: OrganizationGenItem[] }
          | undefined;
        if (orgOutput?.organizations) {
          enriched.organizations = this.applyOrganizationGen(
            orgOutput.organizations,
            ctx.projectId,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[seed-enrich] 组织创建失败: ${msg}`);
        errors.push(`组织创建失败: ${msg}`);
      }

      // node_4: 地点新建
      try {
        const locOutput = chainResult.outputs['node_4_location'] as
          | { locations?: LocationGenItem[] }
          | undefined;
        if (locOutput?.locations) {
          enriched.locations = this.applyLocationGen(
            locOutput.locations,
            ctx.projectId,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[seed-enrich] 地点创建失败: ${msg}`);
        errors.push(`地点创建失败: ${msg}`);
      }

      // 收集 chain 级别的错误
      for (const ce of chainResult.errors) {
        errors.push(`节点${ce.nodeId}: ${ce.message}`);
      }

      const status =
        errors.length === 0 && chainResult.status === 'completed'
          ? 'completed'
          : chainResult.status === 'failed'
            ? 'failed'
            : 'partial';

      return {
        status,
        enriched,
        errors,
        latency: Date.now() - startTime,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[seed-enrich] chain 执行异常: ${msg}`);
      errors.push(`chain 执行异常: ${msg}`);
      return {
        status: 'failed',
        enriched,
        errors,
        latency: Date.now() - startTime,
      };
    }
  }

  // ==================== 回填方法 ====================

  /**
   * 角色深度补全回填：按 name 匹配骨架角色，update 性格/背景/外貌/对话风格
   */
  private applyCharacterEnrichment(
    characters: CharacterEnrichItem[],
    ctx: SeedEnrichContext,
  ): number {
    let count = 0;
    for (const char of characters) {
      const existing = ctx.characters.find((c) => c.name === char.name);
      if (!existing) {
        this.logger.debug(`[seed-enrich] 角色未匹配到骨架: ${char.name}，跳过`);
        continue;
      }
      try {
        this.characterService.update(existing.id, {
          personality: char.personality,
          background: char.background,
          appearance: char.appearance,
          dialogueStyle: char.dialogueStyle,
          dialoguePatterns: char.dialoguePatterns,
        });
        count++;
      } catch (err) {
        this.logger.warn(
          `[seed-enrich] 角色 ${char.name} update 失败: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return count;
  }

  /**
   * 世界观补全回填：update era（当前 DTO 只支持 name/era，其余字段存入 constraints）
   */
  private applyWorldviewEnrichment(
    output: WorldviewEnrichOutput,
    worldSettingId: string,
  ): boolean {
    try {
      // update era（UpdateWorldSettingDto 当前只支持 name + era）
      this.worldSettingService.update(worldSettingId, {
        era: output.era,
      });

      // constraints 单独添加（addConstraint 支持 category/rule/description/severity）
      if (output.constraints && output.constraints.length > 0) {
        for (const c of output.constraints) {
          try {
            this.worldSettingService.addConstraint(worldSettingId, {
              category: c.category,
              rule: c.rule,
              description: c.description,
              severity: c.severity,
            });
          } catch (err) {
            this.logger.debug(
              `[seed-enrich] constraint 添加失败: ${err instanceof Error ? err.message : err}`,
            );
          }
        }
      }
      return true;
    } catch (err) {
      this.logger.warn(
        `[seed-enrich] 世界观 update 失败: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  /**
   * 组织生成：遍历数组 create 新组织
   */
  private applyOrganizationGen(
    organizations: OrganizationGenItem[],
    projectId: string,
  ): number {
    let count = 0;
    for (const org of organizations) {
      try {
        this.organizationService.create(projectId, {
          name: org.name,
          type: org.type as any,
          description: org.description,
        });
        count++;
      } catch (err) {
        this.logger.warn(
          `[seed-enrich] 组织 ${org.name} create 失败: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return count;
  }

  /**
   * 地点生成：按 level 排序（父级在前），create 新地点
   * parentId 是父地点的 name，需要运行时映射为 ID
   */
  private applyLocationGen(
    locations: LocationGenItem[],
    projectId: string,
  ): number {
    // 按 level 排序确保父级先创建
    const sorted = [...locations].sort((a, b) => {
      const la = LEVEL_ORDER[a.level] ?? 99;
      const lb = LEVEL_ORDER[b.level] ?? 99;
      return la - lb;
    });

    const nameToId = new Map<string, string>();
    let count = 0;

    for (const loc of sorted) {
      try {
        const parentId = loc.parentId
          ? nameToId.get(loc.parentId)
          : undefined;

        const mp = this.mapPointService.create(projectId, {
          name: loc.name,
          level: loc.level as MapLevel,
          description: loc.description,
          parentId,
        });
        nameToId.set(loc.name, mp.id);
        count++;
      } catch (err) {
        this.logger.warn(
          `[seed-enrich] 地点 ${loc.name} create 失败: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return count;
  }
}
