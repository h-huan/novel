/**
 * InspirationService - 灵感管理 + 转换为项目
 *
 * 转换为项目时会同步创建种子实体：
 *   世界观（基于 setting）→ 角色（基于 characters）→ 核心伏笔（基于 hook）→ 大纲根节点（关联角色与伏笔）
 * 这样项目创建完成后，设定/角色/大纲/伏笔面板即有可编辑的初始数据，不会出现"空空如也"的状态。
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { InspirationRepository, InspirationRow } from '../../database/repositories/inspiration.repository';
import { ProjectRepository } from '../../database/repositories/project.repository';
import { OutlineService } from '../outline/outline.service';
import { CharacterService } from '../character/character.service';
import { WorldSettingService } from '../world-setting/world-setting.service';
import { ForeshadowingService } from '../foreshadowing/foreshadowing.service';
import { OrganizationService } from '../organization/organization.service';
import { MapPointService } from '../map-point/map-point.service';
import { TimelineService } from '../timeline/timeline.service';
import { ChainEngineService } from '../../chain/chain-engine.service';
import type { ChainResult } from '../../chain/chain.types';
import { INSPIRATION_SEED_ENRICH_CHAIN } from './inspiration-seed-enrich.chain';
import { CreateInspirationDto, UpdateInspirationDto, ConvertToProjectDto } from './dto/inspiration.dto';

export interface InspirationResponse {
  id: string;
  projectId: string | null;
  title: string;
  platform: string;
  hook: string;
  description: string;
  tags: string[];
  characters: string[];
  setting: string;
  estimatedWords: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** 转换为项目时同步创建的种子实体摘要 */
export interface ConvertSeeds {
  worldSetting?: { id: string; name: string };
  characters: { id: string; name: string; isPov: boolean }[];
  foreshadowing?: { id: string; content: string };
  outline?: { id: string; title: string; level: string };
  organization?: { id: string; name: string; type: string };
  mapRoot?: { id: string; name: string; level: string };
  timeline?: { id: string; name: string };
  errors?: string[];
}

export interface ConvertToProjectResult {
  inspiration: InspirationResponse;
  project: { id: string; title: string; type: string; status: string };
  seeds: ConvertSeeds;
  enrichmentStatus: 'pending' | 'completed' | 'failed';
  enrichmentErrors?: string[];
}

@Injectable()
export class InspirationService {
  private readonly logger = new Logger(InspirationService.name);

  constructor(
    private readonly inspirationRepo: InspirationRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly outlineService: OutlineService,
    private readonly characterService: CharacterService,
    private readonly worldSettingService: WorldSettingService,
    private readonly foreshadowingService: ForeshadowingService,
    private readonly organizationService: OrganizationService,
    private readonly mapPointService: MapPointService,
    private readonly timelineService: TimelineService,
    private readonly chainEngine: ChainEngineService,
  ) {}

  private toResponse(row: InspirationRow): InspirationResponse {
    return {
      id: row.id,
      projectId: row.project_id || null,
      title: row.title,
      platform: row.platform,
      hook: row.hook || '',
      description: row.description || '',
      tags: JSON.parse(row.tags || '[]'),
      characters: JSON.parse(row.characters || '[]'),
      setting: row.setting || '',
      estimatedWords: row.estimated_words,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** 获取所有灵感 */
  findAll(): InspirationResponse[] {
    return this.inspirationRepo.findAll().map((r) => this.toResponse(r));
  }

  /** 根据状态筛选 */
  findByStatus(status: string): InspirationResponse[] {
    return this.inspirationRepo.findByStatus(status).map((r) => this.toResponse(r));
  }

  /** 根据平台筛选 */
  findByPlatform(platform: string): InspirationResponse[] {
    return this.inspirationRepo.findByPlatform(platform).map((r) => this.toResponse(r));
  }

  /** 获取单条灵感 */
  findOne(id: string): InspirationResponse {
    const row = this.inspirationRepo.findById(id);
    if (!row) throw new NotFoundException(`灵感不存在: ${id}`);
    return this.toResponse(row);
  }

  /** 创建灵感 */
  create(dto: CreateInspirationDto): InspirationResponse {
    const now = new Date().toISOString();
    const id = uuid();

    this.inspirationRepo.insert({
      id,
      project_id: null,
      title: dto.title,
      platform: dto.platform || 'manual',
      hook: dto.hook || '',
      description: dto.description || '',
      tags: JSON.stringify(dto.tags || []),
      characters: JSON.stringify(dto.characters || []),
      setting: dto.setting || '',
      estimated_words: dto.estimatedWords || 0,
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    return this.findOne(id);
  }

  /** 更新灵感 */
  update(id: string, dto: UpdateInspirationDto): InspirationResponse {
    const existing = this.inspirationRepo.findById(id);
    if (!existing) throw new NotFoundException(`灵感不存在: ${id}`);

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.platform !== undefined) updateData.platform = dto.platform;
    if (dto.hook !== undefined) updateData.hook = dto.hook;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.tags !== undefined) updateData.tags = JSON.stringify(dto.tags);
    if (dto.characters !== undefined) updateData.characters = JSON.stringify(dto.characters);
    if (dto.setting !== undefined) updateData.setting = dto.setting;
    if (dto.estimatedWords !== undefined) updateData.estimated_words = dto.estimatedWords;

    this.inspirationRepo.update(id, updateData);
    return this.findOne(id);
  }

  /** 删除灵感 */
  remove(id: string): void {
    const existing = this.inspirationRepo.findById(id);
    if (!existing) throw new NotFoundException(`灵感不存在: ${id}`);
    this.inspirationRepo.delete(id);
  }

  /** 将灵感转换为项目（含智能补全 chain） */
  async convertToProject(dto: ConvertToProjectDto): Promise<ConvertToProjectResult> {
    const inspiration = this.inspirationRepo.findById(dto.inspirationId);
    if (!inspiration) throw new NotFoundException(`灵感不存在: ${dto.inspirationId}`);
    if (inspiration.status === 'converted' && inspiration.project_id) {
      throw new NotFoundException(`该灵感已转换为项目: ${inspiration.project_id}`);
    }

    const now = new Date().toISOString();
    const projectId = uuid();

    // 解析灵感中可复用的种子字段
    const seedCharacters: string[] = JSON.parse(inspiration.characters || '[]');
    const seedTags: string[] = JSON.parse(inspiration.tags || '[]');
    const seedSetting: string = inspiration.setting || '';
    const seedHook: string = inspiration.hook || '';
    const seedDescription: string = inspiration.description || '';
    const estimatedWords: number = Number(inspiration.estimated_words);
    if (!Number.isInteger(estimatedWords) || estimatedWords <= 0) {
      throw new BadRequestException('灵感未配置有效目标字数，不能转换项目');
    }

    // 创建项目，使用灵感数据作为种子
    const projectType = dto.type || 'short_story';
    this.projectRepo.insert({
      id: projectId,
      type: projectType,
      title: inspiration.title,
      status: 'active',
      target_words: estimatedWords,
      current_words: 0,
      platform_style: inspiration.platform,
      description: `灵感来源：[${seedHook}]\n\n${seedDescription || ''}`,
      writing_style: null,
      settings: JSON.stringify({
        autoSave: true,
        autoSaveInterval: 30,
        defaultStyle: inspiration.platform,
        seedTags,
        seedCharacters,
      }),
      created_at: now,
      updated_at: now,
    });

    // 关联灵感与项目
    this.inspirationRepo.setProjectId(dto.inspirationId, projectId);

    // 同步创建种子实体 —— 顺序：世界观 → 角色 → 伏笔 → 大纲 → 组织 → 地图
    const seeds = this.createSeedEntities(projectId, {
      title: inspiration.title,
      hook: seedHook,
      description: seedDescription,
      setting: seedSetting,
      characters: seedCharacters,
      estimatedWords,
    });

    // 异步执行智能补全 chain —— 不阻塞 HTTP 响应，失败不阻断项目创建
    const enrichmentErrors: string[] = [];

    this.chainEngine.execute(INSPIRATION_SEED_ENRICH_CHAIN, {
      hook: seedHook,
      description: seedDescription,
      setting: seedSetting,
      characters: seedCharacters,
      isLong: projectType === 'long_novel',
    }).then((chainResult) => {
      this.applyEnrichmentResults(projectId, seeds, chainResult, enrichmentErrors);
      const status = chainResult.status === 'failed' ? 'failed' : 'completed';
      if (chainResult.status === 'partial') {
        enrichmentErrors.push(...chainResult.errors.map((e) => `${e.nodeId}: ${e.message}`));
      }
      this.logger.log(`[Inspiration] 异步补全完成 project=${projectId} status=${status}`);
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[Inspiration] 异步补全失败 project=${projectId}: ${msg}`);
    });

    const project = this.projectRepo.findById(projectId)!;
    return {
      inspiration: this.findOne(dto.inspirationId),
      project: {
        id: project.id,
        title: project.title,
        type: project.type,
        status: project.status,
      },
      seeds,
      enrichmentStatus: 'pending',
      enrichmentErrors: seeds.errors,
    };
  }

  /**
   * 手动触发智能补全：对已转换的项目重新执行 AI 种子丰富。
   * 前端通过 POST /inspirations/:id/enrich 调用。
   *
   * 适用场景：
   * - convertToProject 时 chain 失败（enrichmentStatus=failed），用户想重试
   * - 用户修改了灵感的 hook/description/setting/characters 后想重新补全
   */
  async enrichProject(inspirationId: string): Promise<{
    inspiration: InspirationResponse;
    enrichmentStatus: 'completed' | 'partial' | 'failed';
    enriched: { characters: number; worldSetting: boolean; organizations: number; locations: number };
    errors: string[];
  }> {
    const inspiration = this.inspirationRepo.findById(inspirationId);
    if (!inspiration) throw new NotFoundException(`灵感不存在: ${inspirationId}`);
    if (!inspiration.project_id) {
      throw new NotFoundException(`灵感尚未转换为项目，无法补全: ${inspirationId}`);
    }

    const projectId = inspiration.project_id;
    const seedCharacters: string[] = JSON.parse(inspiration.characters || '[]');
    const seedHook: string = inspiration.hook || '';
    const seedDescription: string = inspiration.description || '';
    const seedSetting: string = inspiration.setting || '';
    const project = this.projectRepo.findById(projectId);

    // 查找项目中已有的骨架实体（用于回填）
    const existingCharacters = this.characterService.findByProjectId(projectId);
    const existingWorldSettings = this.worldSettingService.findByProjectId(projectId);

    const seeds: ConvertSeeds = {
      characters: existingCharacters.map((c) => ({ id: c.id, name: c.name, isPov: c.isPovCharacter })),
      worldSetting: existingWorldSettings[0]
        ? { id: existingWorldSettings[0].id, name: existingWorldSettings[0].name }
        : undefined,
    };

    const errors: string[] = [];
    const enriched = { characters: 0, worldSetting: false, organizations: 0, locations: 0 };

    try {
      const chainResult = await this.chainEngine.execute(INSPIRATION_SEED_ENRICH_CHAIN, {
        hook: seedHook,
        description: seedDescription,
        setting: seedSetting,
        characters: seedCharacters,
        isLong: project?.type === 'long_novel',
      });

      this.applyEnrichmentResults(projectId, seeds, chainResult, errors);

      // 统计补全数量
      const charOutput = chainResult.outputs['node_1_character'] as any;
      if (charOutput?.characters) {
        enriched.characters = charOutput.characters.filter(
          (c: any) => seeds.characters.find((s) => s.name === c.name),
        ).length;
      }
      const wsOutput = chainResult.outputs['node_2_worldview'] as any;
      enriched.worldSetting = !!wsOutput?.era && !!seeds.worldSetting;
      const orgOutput = chainResult.outputs['node_3_organization'] as any;
      enriched.organizations = orgOutput?.organizations?.length || 0;
      const locOutput = chainResult.outputs['node_4_location'] as any;
      enriched.locations = locOutput?.locations?.length || 0;

      for (const ce of chainResult.errors) {
        errors.push(`${ce.nodeId}: ${ce.message}`);
      }

      const enrichmentStatus =
        errors.length === 0 && chainResult.status === 'completed'
          ? 'completed'
          : chainResult.status === 'failed'
            ? 'failed'
            : 'partial';

      return {
        inspiration: this.findOne(inspirationId),
        enrichmentStatus,
        enriched,
        errors,
      };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      return {
        inspiration: this.findOne(inspirationId),
        enrichmentStatus: 'failed',
        enriched,
        errors,
      };
    }
  }

  /**
   * 将智能补全 chain 的输出回填到已创建的种子实体。
   * 每类实体的更新独立 try/catch，互不影响。
   */
  private applyEnrichmentResults(
    projectId: string,
    seeds: ConvertSeeds,
    chainResult: ChainResult,
    errors: string[],
  ): void {
    // 1) 角色深度补全 —— 按名称匹配，回填 personality/background/appearance/dialogueStyle/dialoguePatterns
    try {
      const charOutput = chainResult.outputs['node_1_character'] as
        | { characters?: Array<{ name: string; personality?: any; background?: string; appearance?: string; dialogueStyle?: string; dialoguePatterns?: string[] }> }
        | undefined;

      if (charOutput?.characters) {
        for (const enriched of charOutput.characters) {
          const seedChar = seeds.characters.find((c) => c.name === enriched.name);
          if (!seedChar) continue;
          this.characterService.update(seedChar.id, {
            personality: enriched.personality,
            background: enriched.background,
            appearance: enriched.appearance,
            dialogueStyle: enriched.dialogueStyle,
            dialoguePatterns: enriched.dialoguePatterns,
          });
        }
        this.logger.log(`[Enrichment] 角色补全完成: ${charOutput.characters.length} 个角色`);
      }
    } catch (err) {
      const msg = `角色补全回填失败: ${err}`;
      this.logger.warn(msg);
      errors.push(msg);
    }

    // 2) 世界观补全 —— 回填 era，添加 constraints
    try {
      const wsOutput = chainResult.outputs['node_2_worldview'] as
        | { era?: string; constraints?: Array<{ category: string; rule: string; description: string; severity: string }> }
        | undefined;

      if (wsOutput && seeds.worldSetting) {
        if (wsOutput.era) {
          this.worldSettingService.update(seeds.worldSetting.id, { era: wsOutput.era });
        }
        if (wsOutput.constraints) {
          for (const c of wsOutput.constraints) {
            this.worldSettingService.addConstraint(seeds.worldSetting.id, {
              category: c.category,
              rule: c.rule,
              description: c.description,
              severity: c.severity,
            });
          }
        }
        this.logger.log(`[Enrichment] 世界观补全完成: era=${wsOutput.era || 'N/A'}, constraints=${wsOutput.constraints?.length || 0}`);
      }
    } catch (err) {
      const msg = `世界观补全回填失败: ${err}`;
      this.logger.warn(msg);
      errors.push(msg);
    }

    // 3) 组织生成 —— chain 输出是数组，逐个 create
    try {
      const orgOutput = chainResult.outputs['node_3_organization'] as
        | { organizations?: Array<{ name: string; type?: string; description?: string }> }
        | undefined;

      if (orgOutput?.organizations) {
        for (const org of orgOutput.organizations) {
          this.organizationService.create(projectId, {
            name: org.name,
            type: (org.type?.toLowerCase() as any) || 'organization',
            description: org.description || '',
          });
        }
        this.logger.log(`[Enrichment] 组织生成完成: ${orgOutput.organizations.length} 个组织`);
      }
    } catch (err) {
      const msg = `组织生成回填失败: ${err}`;
      this.logger.warn(msg);
      errors.push(msg);
    }

    // 4) 地点生成 —— chain 输出是数组，逐个 create，parentId 按名称映射为 ID
    try {
      const locOutput = chainResult.outputs['node_4_location'] as
        | { locations?: Array<{ name: string; level?: string; parentId?: string; description?: string }> }
        | undefined;

      if (locOutput?.locations) {
        // 先创建所有地点，记录 name→id 映射
        const nameToIdMap = new Map<string, string>();
        // 第一遍：创建无 parentId 的（根节点）
        for (const loc of locOutput.locations) {
          if (!loc.parentId) {
            const mp = this.mapPointService.create(projectId, {
              name: loc.name,
              type: loc.level || 'location',
              level: (loc.level?.toLowerCase() as any) || 'location',
              description: loc.description || '',
            });
            nameToIdMap.set(loc.name, mp.id);
          }
        }
        // 第二遍：创建有 parentId 的，将名称映射为 ID
        for (const loc of locOutput.locations) {
          if (loc.parentId) {
            const resolvedParentId = nameToIdMap.get(loc.parentId);
            const mp = this.mapPointService.create(projectId, {
              name: loc.name,
              type: loc.level || 'location',
              level: (loc.level?.toLowerCase() as any) || 'location',
              description: loc.description || '',
              parentId: resolvedParentId,
            });
            nameToIdMap.set(loc.name, mp.id);
          }
        }
        this.logger.log(`[Enrichment] 地点生成完成: ${locOutput.locations.length} 个地点`);
      }
    } catch (err) {
      const msg = `地点生成回填失败: ${err}`;
      this.logger.warn(msg);
      errors.push(msg);
    }
  }

  /**
   * 基于灵感字段创建项目的种子实体（世界观 / 角色 / 伏笔 / 大纲 / 组织 / 地图 / 时间线）
   * 任何子步骤失败都不阻断项目创建，仅记录日志——项目本身已可用，种子可后续手动补全。
   */
  private createSeedEntities(
    projectId: string,
    seed: {
      title: string;
      hook: string;
      description: string;
      setting: string;
      characters: string[];
      estimatedWords: number;
    },
  ): ConvertSeeds {
    const startTime = Date.now();
    const result: ConvertSeeds = { characters: [], errors: [] };
    const recordSeedError = (scope: string, err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const detail = `${scope}: ${message}`;
      result.errors?.push(detail);
      return detail;
    };
    const chapterCard = (data: {
      core: string;
      scenes: string;
      actions: string;
      conflict: string;
      payoff: string;
      setup: string;
      recovery: string;
      ending: string;
      texture?: string;
    }) => [
      `核心内容：${data.core}`,
      `主要场景：${data.scenes}`,
      `人物行动：${data.actions}`,
      `冲突设计：${data.conflict}`,
      `爽点设置：${data.payoff}`,
      `伏笔设置：${data.setup}`,
      `伏笔回收：${data.recovery}`,
      `结尾设置：${data.ending}`,
      data.texture ? `细节偏差：${data.texture}` : '',
    ].filter(Boolean).join('\n\n');
    const seedTitle = seed.title || '新长篇项目';
    const seedPremise = seed.description?.trim() || seed.hook?.trim() || `${seedTitle}的核心故事`;
    const historicalFrame = seed.setting?.trim() || '架空历史时空';
    const chapterSeeds = [
      {
        title: '醒来就是地狱——开局地狱模式',
        core: `历史系研究生林默熬夜写论文时心脏骤停，醒来发现穿越到五胡乱华最黑暗时期（约公元420年），成为大魏边境破落士族公子。身处废弃坞堡，身边仅18个流民，外有北狄骑兵劫掠。林默趁夜带领众人突围转移，途中收拢散落流民，抵达隐蔽山谷时约31人。`,
        scenes: '废弃坞堡内（药渣与血迹）、荒野夜路（北狄骑兵火光）、隐蔽山谷（暂时安全）',
        actions: '林默醒来→整理融合记忆→判断局势→决定趁夜突围→组织流民转移→途中收拢散落流民→抵达山谷初步安顿。',
        conflict: '穿越冲击与记忆融合 vs 迫在眉睫的北狄劫掠威胁——必须先活过第一夜。',
        payoff: '主角凭借历史系研究生的知识冷静判断局势，果断决策突围，展现领导力雏形。',
        setup: '林默自语"如果有金手指就好了"；老仆王猛提到"并州刺史在招募义军"；怀表停在穿越时刻。',
        recovery: '无，开篇埋下金手指期待、外部势力线索、时间锚点三条线。',
        ending: '抵达山谷，北狄追兵远去，林默松一口气但心里清楚——这只是开始，粮食撑不过三十天。',
        texture: '留白：林默没有解释自己为什么会怕冷，只反复摸胸口——那里隐隐作痛，像是有什么东西在跳动。',
      },
      {
        title: '金手指到账——系统终于来了',
        core: '绝境中，林默胸口剧痛，眼前浮现半透明面板——【文明复兴系统】激活。系统介绍功能：玩家召唤（每次最多10人，冷却7天）、贡献点、科技树、任务系统。发布主线任务：建立稳定根据地（人口100人/耕地50亩/房屋20间/防御优秀/粮食储备90天）。新手礼包150贡献点。',
        scenes: '破庙内（系统面板浮现）、系统空间（查看功能）、破庙外（流民等待）、山谷内（规划第一步）',
        actions: '林默胸口痛→系统激活→查看系统功能→了解召唤规则→接收主线任务→获得新手礼包→规划发展路线。',
        conflict: '系统功能强大 vs 资源极度匮乏——有金手指但启动资金只有150贡献点。',
        payoff: '金手指觉醒带来希望，主线任务明确发展方向，读者对"召唤玩家"功能充满期待。',
        setup: '系统提到"玩家死亡有代价"；胸口痛第一次出现，系统编号隐约可见"42"但林默没看清。',
        recovery: '回收"金手指期待"伏笔。',
        ending: '林默决定先稳住流民，规划发展，等人口达到50人解锁召唤功能。胸口痛消退，但他摸了摸——那里好像有什么东西在沉睡。',
        texture: '偏差：系统介绍时闪过一行模糊文字"编号：00…"，林默揉眼睛再看已经消失了。',
      },
      {
        title: '身后就是家园——退无可退',
        core: '林默组织31个流民加固防御、清理山谷。流民质疑"能否守住"，林默站到高处发表简短演讲——"身后就是家园，退一步算我输"。流民们抬起头，眼中有光。林默规划山谷布局：居住区、农田区、防御区。',
        scenes: '山谷中央（流民聚集）、山谷口（加固防御）、破庙前（演讲台）、规划图前（沙盘推演）',
        actions: '林默组织防御→流民质疑→林默发表演讲→士气提升→规划山谷布局→分配工作任务。',
        conflict: '资源匮乏vs防御需求——没有工具、没有武器、只有求生意志。',
        payoff: '演讲成功点燃流民求生意志，"身后就是家园"成为全书精神锚点之一。',
        setup: '流民提到"北狄经常来劫掠，每次最少十骑"；瞭望塔建设位置可"提前发现敌情"。',
        recovery: '无。',
        ending: '傍晚，简易木墙完工，流民们坐在火堆旁——这是他们穿越以来第一个安稳的夜晚。林默看着他们，手按在胸口。',
        texture: '偏差：林默演讲时声音不高，也不是慷慨激昂型——他只是把实话说出来，但每一句都像钉子。',
      },
      {
        title: '首战告捷——砍翻十个',
        core: '北狄10骑兵小队发现山谷，前来劫掠。林默带领31个流民利用地形和简易武器反击。林默亲手杀死第一个敌人，手在抖但眼神坚定。流民们看到林默冲在最前面，举起锄头、木棍、石块一拥而上。击杀全部10人，缴获粮食200斤和武器。',
        scenes: '山谷口（北狄叫嚣）、防御工事（埋伏圈）、战斗现场（短兵相接）、战后清点（缴获物资）',
        actions: '林默指挥埋伏→北狄入套→林默率先冲锋→流民跟随→击杀10人→战后安抚伤员→清点缴获。',
        conflict: '10北狄骑兵 vs 31流民——人数优势但装备碾压，第一次正面战斗。',
        payoff: '首战告捷，缴获粮食缓解危机，流民士气大振，林默从"穿越者"变成"首领"。',
        setup: '缴获地图显示"北狄营地位置"；林默战后手抖但迅速调整——他发现自己比想象中更快适应血腥。',
        recovery: '回收"北狄劫掠"威胁伏笔，第一次正面对抗。',
        ending: '林默看着地上的尸体，手还在抖，但声音已经稳了："这只是开始。下一次，他们不会只来十个人。"',
        texture: '留白：林默没有吐，也没有失眠——他怕的是自己居然不怕。',
      },
      {
        title: '三十天生死线——人口破五十',
        core: '清点物资发现粮食只够30天。林默规划开垦农田，周边流民闻讯来投，人口从31人增至53人。系统提示解锁召唤功能（人口≥50人）。粮食压力反而增大，林默决定一边建设一边尽快召唤玩家。',
        scenes: '库房（清点粮食）、山谷口（流民扶老携幼来投）、农田区（开垦规划）、系统空间（解锁提示）',
        actions: '林默清点粮食→发现危机→决定扩大人口→流民来投→登记安置→解锁召唤→规划开垦。',
        conflict: '粮食只够30天 vs 人口增加带来的消耗压力——每多一个人就多一张嘴。',
        payoff: '解锁召唤功能，读者终于等到"召唤玩家"环节；流民来投展现民心所向。',
        setup: '系统提示"召唤消耗100点/人，冷却7天，每次最多10人"；林默决定尽快召唤第一批玩家。',
        recovery: '回收"人口达到50人"伏笔，解锁核心功能。',
        ending: '林默确认四周无人，走进库房——他要召唤第一批玩家。系统面板亮起，胸口又开始隐隐作痛。',
        texture: '偏差：林默没有立刻召唤，而是先确认防御工事完备——他怕玩家降临后无力保护他们。',
      },
    ];
    const timelineSeeds = [
      { date: '0420-03-01', title: '穿越当日', desc: '林默穿越至五胡乱华时期，身处废弃坞堡，带领18人流民突围转移至山谷。' },
      { date: '0420-03-02', title: '系统激活', desc: '文明复兴系统激活，获新手礼包150贡献点，主线任务发布：建立稳定根据地。' },
      { date: '0420-03-03', title: '首战告捷', desc: '率31流民击杀10北狄骑兵，缴获粮食武器，首战树立威信。' },
      { date: '0420-03-05', title: '解锁召唤', desc: '人口突破50人，解锁召唤功能，准备召唤第一批玩家。' },
      { date: '0420-03-12', title: '玩家降临', desc: '召唤第一批3名玩家（张晴/王建国/李明），玩家降临震惊于真实世界。' },
      { date: '0420-03-20', title: '火药事故', desc: '赵伟冲动自研火药导致爆炸，流民小七死亡，火药成禁忌。' },
      { date: '0420-04-01', title: '死亡机制展现', desc: '玩家首次死亡后复活，展现死亡惩罚机制——5次后永久消失。' },
      { date: '0420-04-20', title: '北伐与真相', desc: '统一并州北伐成功；刘锋第5次死亡永久消失；系统编号"0042"浮现。' },
    ];
    const worldConstraints = [
      { category: '时代', rule: '五胡乱华架空平行世界', description: `故事发生在${historicalFrame}，为架空平行世界——历史走向相似但人物不同，可自由发挥不受史实限制。所有国家/民族均为架空设定，使用古代别称（中原、江南、塞北、北狄、东夷等）。`, severity: 'hard' },
      { category: '核心矛盾', rule: '生存与扩张并行', description: '前期（1-100章）以生存立足为核心矛盾；中期（101-300章）转向统一战争与内部管理；后期（301-450章）全球争霸与文明传播。系统秘密（文明拯救/时间循环）贯穿全文，逐层揭示。', severity: 'hard' },
      { category: '系统规则', rule: '系统保密与限制', description: '系统只有宿主林默和玩家能看到，NPC完全不知。使用系统须避开NPC，物资来源须伪装。系统显示频率控制在每章<1处，不显示计算过程。贡献点不可交易/转让/透支。', severity: 'hard' },
      { category: '玩家规则', rule: '死亡有真实代价', description: '玩家5次死亡后永久消失不可复活。痛觉随死亡次数递增（20%→100%）。复活后虚弱时间递增（1小时→7天）。玩家无法返回原世界，穿越即永久。所有NPC是活人，会永久死亡。', severity: 'hard' },
      { category: '章节结构', rule: '章节卡字段完整', description: '每章至少包含：核心内容、主要场景、人物行动、冲突设计、爽点设置、热血镜头/波折镜头、伏笔设置、伏笔回收、结尾设置、目标字数。长篇每章4000-5000字，高潮章可5000-6000字。', severity: 'hard' },
      { category: '文风约束', rule: '严肃厚重，降AI文风', description: '正文禁止排比并列结构、AI高频副词、模板化首尾、对仗四字短语堆砌。第一人称只感五感不进别人脑。禁叙述者跳出成作者评论者。散文质感+段落长短交错。', severity: 'hard' },
      { category: '命名规则', rule: '古代中性命名', description: '国内地区使用古代地名（中原、北境、江南、西域、塞北）；异族使用传统别称（北狄、东夷、西戎、南蛮、倭国）；部落通过名称区分（拓跋部、呼延部等）；避免现代地名。', severity: 'soft' },
      { category: '数据规则', rule: '关键数据全篇自洽', description: '人口、玩家数、贡献点、粮食、军队等关键数据必须严格遵循世界观中的全篇数据规划表。前期精确到个位，后期精确到对应数量级。数据不允许前后矛盾。', severity: 'hard' },
    ];
    const characterSeeds: Array<{
      name: string;
      isPovCharacter: boolean;
      role: string;
      identity: string;
      background?: string;
      personality?: Record<string, number>;
      dialogueStyle?: string;
      dialoguePatterns?: string[];
      faction?: string;
      goals?: string;
      weaknesses?: string;
      wound?: string;
      keywords?: string;
      notes?: string;
      growthStages?: Array<{ stage: string; chapterRange: string; description: string }>;
      coreConflictRole?: string;
    }> = [
      ...seed.characters.map((name, idx) => ({
        name,
        isPovCharacter: idx === 0,
        role: idx === 0 ? 'protagonist' : 'major',
        identity: idx === 0 ? '穿越者/文明守护者/第42位守护者' : '关键人物',
        background: idx === 0
          ? `历史系研究生，熬夜写论文时心脏骤停，醒来穿越到五胡乱华时期。表面沉稳有谋略，内心背负着巨大的秘密——他是文明复兴系统选中的第42位守护者，前41位全部失败。胸口偶尔作痛，那是前41位守护者留下的"灵魂伤痕"。初期把玩家当工具，第100章第一个玩家永久死亡后开始转变，最终学会信任和承担。`
          : `被系统从现代世界召唤而来的濒死者。知道真相——这不是游戏，死亡是真的，5次后永久消失。各有各的过去、恐惧和执念。`,
        personality: idx === 0
          ? { extraversion: 42, agreeableness: 55, conscientiousness: 88, neuroticism: 58, openness: 82 }
          : { extraversion: 55, agreeableness: 50, conscientiousness: 65, neuroticism: 55, openness: 60 },
        dialogueStyle: idx === 0 ? '短句、不说废话，紧张时先沉默再反问。越关键的决定越简短。' : '说话要带现代人痕迹但在古代语境里自然——保留职业习惯用语。',
        dialoguePatterns: idx === 0 ? ['先把门关上。', '这不是游戏。', '我们没退路了。', '身后就是家园，退一步算我输。'] : ['我还有几次机会？', '反正医生说我活不过三个月。'],
        faction: idx === 0 ? '主角阵营（山谷根据地→大魏政权）' : '玩家阵营',
        goals: idx === 0 ? '活下去→统一全球结束乱世→完成文明复兴使命' : '活下去→给家人留点什么→证明自己',
        weaknesses: idx === 0 ? '对玩家的愧疚、害怕牺牲、对真相的恐惧、道德困境' : '怕死、对原世界家人的牵挂、适应古代环境的困难',
        wound: idx === 0 ? '胸口痛（前41位守护者的灵魂伤痕），每次系统激活或玩家死亡时发作' : '在原世界濒死的经历，知道"第二次生命来之不易"',
        keywords: idx === 0 ? '身后就是家园，退一步算我输。我不是来当英雄的，我是来活下去的。' : '我还有几次机会？反正医生说活不过三个月。',
        notes: idx === 0
          ? '①系统只有林默和玩家能看到，NPC完全不知。使用系统时必须避开NPC。②系统购买的物资必须伪装成"库房里的"或"外面买的"。③胸口痛是前41位守护者的灵魂伤痕，越接近真相痛感越强。④450章后系统完成使命消失。'
          : '玩家来自现实世界濒死者，保留原世界知识和记忆。5次复活机会，每次死亡后虚弱时间递增（1h→6h→24h→7d→永久死亡）。贡献点可兑换现实资源给家人。',
        growthStages: idx === 0
          ? [
              { stage: '被迫期(1-60章)', chapterRange: '1-60', description: '初期把玩家当工具，只想活下去。对系统有恐惧和怀疑。' },
              { stage: '觉醒期(61-100章)', chapterRange: '61-100', description: '第100章锋哥永久死亡后开始转变，意识到每个玩家的命都很重要。' },
              { stage: '成长期(101-300章)', chapterRange: '101-300', description: '从保护者变成领袖，学会信任和承担。从山谷坞堡到统一全国。' },
              { stage: '成熟期(301-450章)', chapterRange: '301-450', description: '发现文明拯救真相，承载41位守护者的意志。最终统一全球，系统消失。' },
            ]
          : [
              { stage: '觉醒期', chapterRange: '85-100', description: '经历战友第4次死亡→流民跪拜→锋哥永久死亡，从逃避到觉醒。' },
            ],
        coreConflictRole: idx === 0 ? '矛盾核心：在"保护玩家"与"完成文明复兴使命"之间做选择' : '人性样本：展现濒死者在第二次生命里的不同选择',
      })),
      {
        name: '张晴',
        isPovCharacter: false,
        role: 'major',
        identity: '医学生（癌症晚期）→ 太医院首',
        background: '22岁医学生，癌症晚期，被系统召唤时被告知"给你第二次生命"。冷静专业但内心恐惧死亡，对林默有依赖感。建立医疗体系，培训流民医疗知识。第100章锋哥永久死亡后崩溃质问林默，是真相揭示的关键见证人。',
        personality: { extraversion: 45, agreeableness: 68, conscientiousness: 82, neuroticism: 62, openness: 72 },
        dialogueStyle: '专业冷静但偶尔露出脆弱，面对死亡时语气变急促。',
        dialoguePatterns: ['老大，我们……还能回家吗？', '条件太落后了，但我会想办法。', '他死了……真的死了。'],
      },
      {
        name: '王建国',
        isPovCharacter: false,
        role: 'major',
        identity: '建筑工（事故濒死）→ 工部尚书',
        background: '35岁建筑工，工地事故濒死时被召唤。粗犷但内心细腻，对"家"有执念——想在这个世界建一个真正的家。负责基地建设、防御工事。和流民关系最好，常被流民孩子围着叫"王叔"。',
        personality: { extraversion: 58, agreeableness: 72, conscientiousness: 78, neuroticism: 35, openness: 42 },
        dialogueStyle: '直来直去，喜欢用建筑比喻，说急了就挽袖子。',
        dialoguePatterns: ['这是我建的家，谁也别想毁掉。', '路还长，我接着修。', '别怕，有我在前面挡着。'],
      },
      {
        name: '李明',
        isPovCharacter: false,
        role: 'major',
        identity: '厨师（绝症）→ 后勤主管',
        background: '28岁厨师，胃癌晚期被召唤。乐观豁达是表象，其实用美食麻痹自己对现实的恐惧。第一个在深夜偷偷哭的玩家。负责后勤伙食，用有限食材改善流民生活。是团队里的"开心果"也是第一个心理崩溃的人。',
        personality: { extraversion: 65, agreeableness: 75, conscientiousness: 55, neuroticism: 58, openness: 48 },
        dialogueStyle: '话多爱笑但关键时沉默，做饭时最放松。',
        dialoguePatterns: ['老大，想吃啥我做啥。', '食材是真的……这是真的。', '我们……真的回不去了吗？'],
      },
      {
        name: '刘锋',
        isPovCharacter: false,
        role: 'major',
        identity: '退伍兵（重伤濒死）→ 军队统领',
        background: '32岁退伍兵，执行任务重伤濒死时被召唤。沉默寡言但重情义，对"保护兄弟"有执念。负责军事训练和指挥战斗。第100章为救林默挡刀，第5次死亡后永久消失——全书第一个震撼死亡，玩家首次意识到"死亡是真的"。',
        personality: { extraversion: 32, agreeableness: 55, conscientiousness: 90, neuroticism: 42, openness: 35 },
        dialogueStyle: '极少说话，一句顶十句。命令式短句，但偶尔只说半句。',
        dialoguePatterns: ['老大，我……快没机会了……', '记住，我们不是乌合之众。', '死的是兵，不是折子。'],
      },
      {
        name: '赵伟',
        isPovCharacter: false,
        role: 'major',
        identity: '工业设计师（癌症晚期）→ 研发核心',
        background: '28岁工业设计师，癌症晚期被召唤。有热情也有冲动——第21章冲动自研火药导致爆炸，流民小七死亡，从此留下心理阴影。第55-60章克服心理阴影重启火药研发，最终成功。代表"代价与成长"主题。',
        personality: { extraversion: 52, agreeableness: 48, conscientiousness: 72, neuroticism: 68, openness: 78 },
        dialogueStyle: '兴奋时说个不停，出事时沉默自责，恢复后语气谨慎但更坚定。',
        dialoguePatterns: ['我只是想帮忙……我只是想帮忙……', '这次我会小心的。', '成功了！我们真的做到了！'],
      },
      {
        name: '王猛',
        isPovCharacter: false,
        role: 'supporting',
        identity: '老仆/流民总管',
        background: '林默穿越后身边唯一的老人，忠诚可靠。儿子被北狄杀死，妻子饿死，只剩复仇的执念。林默给了他复仇的机会，成为最忠心的NPC。管理库房和流民日常，是林默在NPC中最信任的人。',
        personality: { extraversion: 38, agreeableness: 65, conscientiousness: 80, neuroticism: 45, openness: 30 },
        dialogueStyle: '老派、恭敬但偶尔露出杀意，提到北狄时语气变冷。',
        dialoguePatterns: ['公子，我去。只要能杀北狄，死也值了。', '公子，老奴命硬，死不了。', '地里的庄稼……该收了……'],
      },
      {
        name: '锋五',
        isPovCharacter: false,
        role: 'supporting',
        identity: '流民首领 → 贴身护卫',
        background: '原流民中的小头目，因林默给了复仇机会而效忠。第100章代替林默挡刀，重伤但不死——和锋哥形成对照：一个NPC用命保护主角活下来，一个玩家用命保护主角永远消失。',
        personality: { extraversion: 48, agreeableness: 55, conscientiousness: 72, neuroticism: 40, openness: 38 },
        dialogueStyle: '耿直、不懂弯弯绕，说话带乡下口音。',
        dialoguePatterns: ['公子，俺这条命是你给的。', '俺不怕死，就怕白死。'],
      },
    ];
    const foreshadowingSeeds = [
      { content: seed.hook?.trim() || `${seedTitle}开局危机——北狄骑兵劫掠，粮食只够30天，林默必须在绝境中找到破局之道。`, type: 'mystery', plannedRecoveryChapterIndex: 5, scope: 'global', emotionalImpact: '紧迫感：生存倒计时，读者必须跟着主角一起想办法', layeredReveal: '第5章揭晓具体数据→第10章解锁召唤缓解→第100章真相揭示' },
      { content: '文明复兴系统的真实来源——濒临灭亡的平行世界文明留下的最后希望。系统编号"0042"的含义将在第100章首次浮现，第450章完整揭示：林默是第42位守护者，前41位全部失败。', type: 'mystery', plannedRecoveryChapterIndex: 100, scope: 'global', emotionalImpact: '震憾→悲壮→温暖：Ch.100疑惑→Ch.300恐惧→Ch.450悲壮+感动', layeredReveal: 'Ch.30系统模糊文字→Ch.50碎片记忆→Ch.100编号浮现→Ch.200守护者记录→Ch.400前人痕迹→Ch.450完整真相' },
      { content: '玩家5次死亡后永久消失——第100章刘锋第5次死亡无法复活，成为第一个震撼死亡，触发玩家对"死亡真相"的认知崩溃与后续信任危机。', type: 'setup', plannedRecoveryChapterIndex: 100, scope: 'global', emotionalImpact: '震撼+崩溃：第一次有人真正"死掉"，玩家意识到这不是游戏', layeredReveal: 'Ch.25第1次死亡（展现复活）→Ch.50第2次死亡+碎片记忆→Ch.58第3次死亡→Ch.85第4次死亡→Ch.100第5次死亡永久消失' },
      { content: '火药研发的危险与代价——第21章爆炸导致NPC小七死亡，火药成禁忌；第55-60章被迫重启研发，最终自研成功。代表"科技进步必须付出代价"的核心主题。', type: 'setup', plannedRecoveryChapterIndex: 60, scope: 'volume', emotionalImpact: '愧疚+恐惧→重启的勇气：NPC死亡是真实代价，不是轻飘飘的"失败"', layeredReveal: 'Ch.21爆炸事故→Ch.22心理阴影→Ch.55被迫重启→Ch.60自研成功→Ch.90外泄危机' },
      { content: '摆烂者的转变弧线——第85章战友第4次死亡、第90章流民跪拜、第100章锋哥永久死亡，三个事件触发摆烂者从逃避到觉醒。', type: 'character', plannedRecoveryChapterIndex: 100, scope: 'volume', emotionalImpact: '内心震动→被需要的感动→彻底的觉醒：任何群体都有这种人，给他们时间', layeredReveal: 'Ch.1-30摆烂→Ch.85战友牺牲开始反思→Ch.90流民跪拜内心震动→Ch.100锋哥死亡彻底转变' },
      { content: '科技外泄机制——第90章火药配方泄露、第200章炼钢技术泄露、第320章火炮图纸泄露。每次外泄后主角立即推出升级版，保持1-2代技术代差。', type: 'setup', plannedRecoveryChapterIndex: 320, scope: 'global', emotionalImpact: '愤怒→应对策略：叛徒、商人、间谍，三种外泄方式→三种防范机制', layeredReveal: 'Ch.90火药外泄（叛徒）→Ch.200炼钢外泄（商人）→Ch.320火炮外泄（间谍），每次敌人获得旧版，主角已有新版' },
      { content: '全球统一七卷路线——从山谷坞堡到全球帝国，每卷有阶段性科技升级和领土扩张。最终系统消失，280名玩家永远留在古代。', type: 'setup', plannedRecoveryChapterIndex: 450, scope: 'global', emotionalImpact: '从绝望到希望：30人流民→1亿人口，整个过程是文明复兴的史诗', layeredReveal: '第一卷并州→第二卷北方→第三卷全国→第四卷亚洲→第五卷全球→第六卷盛世→第七卷系统消失' },
      { content: '胸口痛与碎片记忆——林默胸口疼痛源于前41位守护者死亡留下的"灵魂伤痕"。越接近真相痛感越强，同时出现碎片记忆（战场、死亡、遗憾）。', type: 'mystery', plannedRecoveryChapterIndex: 300, scope: 'global', emotionalImpact: '恐惧→怀疑→震撼：胸口痛从物理不适变成情感重量', layeredReveal: 'Ch.1初次胸口痛→Ch.30模糊文字→Ch.50碎片记忆出现→Ch.100看清编号→Ch.300怀疑循环→Ch.400前人痕迹→Ch.450完整记忆' },
    ];
    this.logger.log(`[createSeedEntities] 开始创建种子实体 project=${projectId}`);

    // 1) 世界观 —— 基于灵感的 setting 字段
    try {
      const stepStart = Date.now();
      const worldName = seed.setting?.trim() || `${seed.title}的世界观`;
      const ws = this.worldSettingService.create(projectId, {
        name: worldName,
        era: historicalFrame,
        constraints: worldConstraints,
        culturalSettings: JSON.stringify({
          values: ['活下去','证明自己','守护家园'],
          festivals: ['流民祭（纪念死去同伴）','丰收节'],
          customs: ['新人被召唤后第一个月由老兵带','贡献点可兑换现实资源给家人'],
          beliefs: ['文明复兴系统是最后的希望（后期揭示为平行世界文明遗产）'],
          language_conventions: ['古代中性命名：中原/北境/江南/西域','异族用传统别称：北狄/东夷/西戎/南蛮/倭国'],
        }),
        spoilerSettings: JSON.stringify({
          time_loop: '第42次文明拯救尝试，前41位守护者全部失败',
          guardian: '林默=第42位守护者，系统编号0042的含义，胸口痛=前41位的灵魂伤痕',
          player_truth: '玩家穿越即知是真，5次死亡后永久消失，无法返回原世界',
          system_origin: '濒临灭亡的平行世界文明留下的最后希望',
          reveal_plan: 'Ch.30模糊文字→Ch.50碎片记忆→Ch.100编号浮现→Ch.450完整揭示',
          endgame: '系统完成使命消失，280名玩家永远留在古代',
        }),
        censorshipRules: JSON.stringify([
          { original: '五胡', replacement: '北狄/北方游牧系/胡人政权' },
          { original: '日本/东瀛', replacement: '倭国/海岛系/东海部族' },
          { original: '屠杀', replacement: '平定/肃清/整治' },
          { original: '民族仇恨', replacement: '文化融合/强制同化' },
        ]),
      });
      result.worldSetting = { id: ws.id, name: ws.name };
      this.logger.log(`[createSeedEntities] 世界观创建完成: ${Date.now() - stepStart}ms`);
    } catch (err) {
      this.logger.warn(`种子世界观创建失败 (project=${projectId}): ${recordSeedError('worldSetting', err)}`);
    }

    // 2) 角色 —— 以用户提供角色为主，补齐长篇所需的元老、军方、地方、旧势力与外部势力节点
    const createdCharacterIds: string[] = [];
    const seenCharacterNames = new Set<string>();
    const normalizedCharacterSeeds = characterSeeds
      .map((item, idx) => ({
        ...item,
        name: item.name?.trim() || (idx === 0 ? seedTitle : ''),
      }))
      .filter((item) => item.name && !seenCharacterNames.has(item.name) && seenCharacterNames.add(item.name));

    for (const [idx, charSeed] of normalizedCharacterSeeds.entries()) {
      try {
        const stepStart = Date.now();
        const char = this.characterService.create(projectId, {
          name: charSeed.name,
          isPovCharacter: charSeed.isPovCharacter,
          role: charSeed.role as any,
          identity: charSeed.identity,
          background: charSeed.background,
          personality: charSeed.personality,
          dialogueStyle: charSeed.dialogueStyle,
          dialoguePatterns: charSeed.dialoguePatterns,
          faction: charSeed.faction,
          goals: charSeed.goals,
          weaknesses: charSeed.weaknesses,
          wound: charSeed.wound,
          keywords: charSeed.keywords,
          notes: charSeed.notes || '',
          growthStages: (charSeed as any).growthStages ? JSON.stringify((charSeed as any).growthStages) : '',
          coreConflictRole: charSeed.coreConflictRole || '',
        });
        createdCharacterIds.push(char.id);
        result.characters.push({ id: char.id, name: char.name, isPov: char.isPovCharacter });
        this.logger.log(`[createSeedEntities] 角色[${idx}]创建完成: ${Date.now() - stepStart}ms`);
      } catch (err) {
        this.logger.warn(`种子角色创建失败 (project=${projectId}, name=${charSeed.name}): ${recordSeedError(`character:${charSeed.name}`, err)}`);
      }
    }

    // 3) 伏笔根表 —— 对齐指南的“写前建表、写中检查、写后回收”流程
    const foreshadowingIds: string[] = [];
    for (const [idx, fsSeed] of foreshadowingSeeds.entries()) {
      try {
        const stepStart = Date.now();
        const fs = this.foreshadowingService.create(projectId, {
          content: fsSeed.content,
          type: fsSeed.type as any,
          importance: idx === 0 ? 3 : 2,
          buriedChapterIndex: 0,
          plannedRecoveryChapterIndex: fsSeed.plannedRecoveryChapterIndex,
          relatedCharacterIds: createdCharacterIds,
          scope: fsSeed.scope,
          emotionalImpact: (fsSeed as any).emotionalImpact,
          layeredReveal: (fsSeed as any).layeredReveal,
        });
        foreshadowingIds.push(fs.id);
        if (!result.foreshadowing) {
          result.foreshadowing = { id: fs.id, content: fs.content };
        }
        this.logger.log(`[createSeedEntities] 伏笔[${idx}]创建完成: ${Date.now() - stepStart}ms`);
      } catch (err) {
        this.logger.warn(`种子伏笔创建失败 (project=${projectId}, index=${idx}): ${recordSeedError(`foreshadowing:${idx}`, err)}`);
      }
    }

    // 4) 大纲树 —— book 根节点 + 第一卷 + 章节卡，保留手工项目里的字段结构
    try {
      const stepStart = Date.now();
      const book = this.outlineService.create(projectId, {
        title: seedTitle,
        level: 'book',
        order: 0,
        content: [
          `【核心钩子】${seed.hook || seedPremise}`,
          `【创作流程】先建世界观、角色网、组织地图、时间线与伏笔表，再按卷大纲推进；每章写作前检查伏笔表，写后更新回收状态。`,
          `【长篇规模】卷数、每卷章数与总章数由主线阶段、人物弧线、冲突升级和节奏动态决定；每章在3200-4000字内按本章任务单独规划。当前只建立可扩展根结构，不预设数量。`,
        ].join('\n\n'),
        targetWords: seed.estimatedWords,
        characterIds: createdCharacterIds,
        foreshadowingIds,
      });
      const volume = this.outlineService.create(projectId, {
        title: '第一卷：玩家降临（1-100章）',
        level: 'volume',
        parentId: book.id,
        order: 0,
        content: [
          '【卷目标】完成穿越开局、系统激活、首批玩家召唤、火药研发波折、基地建设扩张、统一并州北伐、第100章真相首次揭示。',
          '【卷冲突】北狄骑兵威胁 vs 基地生存建设；玩家死亡机制逐步展现；系统秘密（编号0042/胸口痛/碎片记忆）逐层铺垫。',
          '【玩家成长弧】被迫期（1-60章）→ 觉醒期（61-100章）：从"我不想死"到"我不想当废物"。',
          '【关键节点】第10章首批玩家降临 → 第21章火药爆炸小七死亡 → 第50章玩家第2次死亡+林默碎片记忆 → 第85-90章摆烂者转变 → 第100章锋哥永久死亡+系统编号浮现。',
          '【写作规则】每章使用：核心内容、主要场景、人物行动、冲突设计、爽点设置、热血镜头/波折镜头、伏笔设置、伏笔回收、结尾设置、目标字数（4000-5000字）。',
        ].join('\n\n'),
        characterIds: createdCharacterIds,
        foreshadowingIds,
      });
      const chapterTypes = ['标准章', '过渡章', '波折章', '高潮章', '标准章'];
      const povRatios = ['主角100%', '主角100%', '主角100%', '主角70%/群像30%', '主角100%'];
      const chapterHotScenes = [
        '林默趁夜带领众人突围转移，途中收拢散落流民',
        '文明复兴系统面板激活，林默查看召唤功能和主线任务',
        '林默发表"身后就是家园，退一步算我输"演讲，流民眼中燃起希望',
        '林默亲手杀死第一个敌人，流民一拥而上击杀全部10名北狄骑兵',
        '系统提示解锁召唤功能（人口≥50人），流民来投展现民心所向',
      ];
      const chapterSetbackScenes = [
        '身陷废弃坞堡，身边仅18个流民，外有北狄骑兵劫掠',
        '资源极度匮乏——有金手指但启动资金只有150贡献点',
        '流民质疑"能否守住"，没有工具、没有武器',
        '林默战后手在抖，他发现自己比想象中更快适应血腥',
        '粮食只够30天，每多一个人就多一张嘴——饥饿危机迫在眉睫',
      ];
      const chapterEndingSetups = [
        '粮食撑不过三十天——危机倒计时开始',
        '胸口里有什么东西在沉睡——系统编号之谜初现端倪',
        '第一个安稳的夜晚——但北狄劫掠威胁未解除',
        '这只是开始，下一次不会只来十个人——更大的危机在逼近',
        '胸口又开始隐隐作痛——第一次召唤前的不安预感',
      ];
      for (const [idx, chapter] of chapterSeeds.entries()) {
        const sceneCount = chapter.scenes.split('、').map((item) => item.trim()).filter(Boolean).length;
        const chapterTargetWords = Math.min(4000, 3200 + sceneCount * 160 + (chapter.recovery ? 120 : 0) + (chapter.payoff ? 120 : 0));
        const wordCountReason = `本章含${sceneCount}个主要场景，并根据冲突推进、伏笔${chapter.recovery ? '回收' : '埋设'}和情绪兑现强度确定篇幅。`;
        this.outlineService.create(projectId, {
          title: `第${idx + 1}章 ${chapter.title}`,
          level: 'chapter',
          parentId: volume.id,
          order: idx,
          content: `${chapterCard(chapter)}\n\n目标字数：${chapterTargetWords}\n篇幅理由：${wordCountReason}`,
          targetWords: chapterTargetWords,
          characterIds: createdCharacterIds,
          foreshadowingIds,
          chapterType: chapterTypes[idx],
          povRatio: povRatios[idx],
          hotScenes: chapterHotScenes[idx],
          setbackScenes: chapterSetbackScenes[idx],
          endingSetup: chapterEndingSetups[idx],
          scenes: {
            conflict: chapter.conflict,
            scenes: chapter.scenes.split('、').map((item) => item.trim()).filter(Boolean),
            hook: chapter.ending,
            foreshadowing: chapter.setup,
            foreshadowingRecover: chapter.recovery,
            highlight: chapter.payoff,
            mood: idx === 0 ? '惊疑、克制、冷意' : idx === 1 ? '互相试探、雨夜压低声' : idx === 2 ? '脏、急、道德不适' : idx === 3 ? '公开压迫、暗处松动' : '务实、疲惫、隐约振奋',
            characterActions: chapter.actions,
            texture: chapter.texture || '',
            wordCountReason,
          },
        });
      }
      result.outline = { id: book.id, title: book.title, level: book.level };
      this.logger.log(`[createSeedEntities] 大纲树创建完成: ${Date.now() - stepStart}ms`);
    } catch (err) {
      this.logger.warn(`种子大纲创建失败 (project=${projectId}): ${recordSeedError('outline', err)}`);
    }

    // 5) 组织树 —— 项目级根节点下展示主角阵营、元老、军方、地方、旧势力与外部势力
    try {
      const stepStart = Date.now();
      const root = this.organizationService.create(projectId, {
        name: `${seedTitle}势力网络`,
        type: 'organization',
        description: '项目级组织根节点，用于承载主角阵营、敌方势力、中立势力与后期全球扩展势力。',
      });
      const orgChildren = [
        { name: '主角阵营（山谷根据地→大魏政权）', type: 'camp', description: '林默领导的流民+玩家组成的势力，从山谷坞堡逐步发展为统一全球的大魏帝国。' },
        { name: '北狄诸部（拓跋部/呼延部/石部/苻部/姚部）', type: 'faction', description: '五胡乱华时期的北方游牧民族，前期主要敌对势力。部落各自为战，后期被逐一击败或收编。' },
        { name: '并州刺史/朝廷势力', type: 'regime', description: '名义上的中央政权，第31-52章尝试招安主角，封林默为"并州中郎将"。后期名存实亡。' },
        { name: '东晋/刘宋政权', type: 'regime', description: '南方偏安政权，第二卷（101-200章）被大魏灭亡。代表中原南方的旧秩序。' },
        { name: '东夷势力（高句丽/百济/新罗/夫余）', type: 'camp', description: '东北方向的外部势力，第二卷末入侵东北，被大魏击败后占领朝鲜半岛。' },
        { name: '西域诸国/丝绸之路势力', type: 'camp', description: '第二卷中期打通丝绸之路，西域各国臣服。后期成为全球扩张的中转站。' },
        { name: '柔然/草原势力', type: 'army', description: '第二卷中期柔然30万骑兵南下，被大魏击败后占领蒙古草原并设立都护府。' },
        { name: '海外势力（倭国/天竺/拂菻/大食/波斯）', type: 'camp', description: '后期全球扩张阶段的外部势力。倭国第二卷称臣，天竺/拂菻/大食/波斯在第四-五卷逐一面对。' },
        { name: '玩家内部（拼命型/努力型/谨慎型/摆烂型）', type: 'camp', description: '玩家群体内部的四种态度分层，贯穿全文。通过社会压力和关键事件推动态度转变。' },
      ];
      for (const child of orgChildren) {
        this.organizationService.create(projectId, {
          ...child,
          type: child.type as any,
          parentId: root.id,
        });
      }
      result.organization = { id: root.id, name: root.name, type: root.type };
      this.logger.log(`[createSeedEntities] 组织树创建完成: ${Date.now() - stepStart}ms`);
    } catch (err) {
      this.logger.warn(`种子组织创建失败 (project=${projectId}): ${recordSeedError('organization', err)}`);
    }

    // 6) 地图树 —— world 根节点下创建关键地区、城市与场景
    try {
      const stepStart = Date.now();
      const root = this.mapPointService.create(projectId, {
        name: `${seedTitle}世界地图`,
        type: 'world',
        level: 'world',
        description: seed.setting || seed.description || '架空平行世界的全球地图，历史走向似五胡乱华时期但可自由发挥。',
      });
      const zhongyuan = this.mapPointService.create(projectId, {
        name: '中原（核心区域）',
        type: 'region',
        level: 'region',
        parentId: root.id,
        description: '主要故事发生地，包含并州、太原郡等核心区域。五胡乱华时期北方胡人政权混战的中心地带。',
      });
      const mapChildren = [
        { name: '太原郡山谷根据地', type: 'location', level: 'location', parentId: zhongyuan.id, description: '林默穿越后的初始根据地——隐蔽山谷，第一批玩家降临地，后续发展为坞堡→县城→郡城的起点。' },
        { name: '并州城', type: 'city', level: 'city', parentId: zhongyuan.id, description: '第一卷中后期统一并州的战略目标，刺史驻地。第100章统一并州完成。' },
        { name: '长安城', type: 'city', level: 'city', parentId: zhongyuan.id, description: '最终都城，全书大结局拍摄地（太极殿万国来朝）。第三卷后期（约300章）称帝后定都于此。' },
        { name: '北境草原（塞北）', type: 'region', level: 'region', parentId: root.id, description: '北方游牧民族活动区域——北狄诸部（拓跋部/呼延部等）的根据地。第二卷征服后设立都护府。' },
        { name: '江南（东晋/刘宋区域）', type: 'region', level: 'region', parentId: root.id, description: '南方东晋/刘宋偏安之地，第二卷南下后统一。南北和谈后划黄河而治。' },
        { name: '西域丝绸之路', type: 'region', level: 'region', parentId: root.id, description: '第二卷中期打通丝绸之路，西域各国臣服。第三卷西征的出发点，连接中亚与更远的西方。' },
        { name: '朝鲜半岛', type: 'region', level: 'region', parentId: root.id, description: '第二卷末高句丽/百济联军入侵后被占领，设立安东都护府。' },
        { name: '倭国列岛', type: 'region', level: 'region', parentId: root.id, description: '第二卷倭国震惊后称臣纳贡，第三卷海军大战倭国海盗后彻底臣服。' },
        { name: '东南亚（交趾/南洋）', type: 'region', level: 'region', parentId: root.id, description: '第三卷中期出兵东南亚，占领交趾，设立南洋都护府。' },
        { name: '中亚/波斯', type: 'region', level: 'region', parentId: root.id, description: '第三-四卷西征目标，中亚都护府设立。波斯发现大油田，关键资源节点。' },
        { name: '欧洲（东罗马/西欧）', type: 'region', level: 'region', parentId: root.id, description: '第四卷全球扩张核心战场。消灭东罗马帝国，征服西欧，设立欧洲都护府。' },
        { name: '北非/美洲/大洋洲', type: 'region', level: 'region', parentId: root.id, description: '第四-五卷全球统一最后拼图。北非都护府设立，美洲殖民地建立，大洋洲纳入版图。' },
      ];
      for (const point of mapChildren) {
        this.mapPointService.create(projectId, point as any);
      }
      result.mapRoot = { id: root.id, name: root.name, level: root.level };
      this.logger.log(`[createSeedEntities] 地图树创建完成: ${Date.now() - stepStart}ms`);
    } catch (err) {
      this.logger.warn(`种子地图根节点创建失败 (project=${projectId}): ${recordSeedError('mapRoot', err)}`);
    }

    // 7) 时间线种子 —— 创建根时间线并写入关键节点事件
    try {
      const stepStart = Date.now();
      const timeline = this.timelineService.create(projectId, {
        name: `${seedTitle}时间线`,
        description: `《${seedTitle}》的故事时间线，参考手工项目先建立关键历史/剧情节点。`,
        startDate: timelineSeeds[0]?.date,
        endDate: timelineSeeds[timelineSeeds.length - 1]?.date,
      });
      for (const item of timelineSeeds) {
        this.timelineService.createEvent(timeline.id, {
          title: item.title,
          description: item.desc,
          eventDate: item.date,
          eventType: 'plot',
          importance: 3,
          relatedCharacterIds: createdCharacterIds,
        });
      }
      result.timeline = { id: timeline.id, name: timeline.name };
      this.logger.log(`[createSeedEntities] 时间线与事件创建完成: ${Date.now() - stepStart}ms`);
    } catch (err) {
      this.logger.warn(`种子时间线创建失败 (project=${projectId}): ${recordSeedError('timeline', err)}`);
    }

    this.logger.log(`[createSeedEntities] 所有种子实体创建完成 project=${projectId}, 总耗时: ${Date.now() - startTime}ms`);
    return result;
  }

  /**
   * 基于灵感的 setting 文本推断主势力/组织。
   * 使用关键词匹配：若 setting 含已知势力关键词（如"北洋""朝廷""门派"等），
   * 则返回对应的组织名与类型；推断不了返回 null。
   */
  private inferOrganization(
    setting: string,
  ): { name: string; type: 'regime' | 'faction' | 'army' | 'sect' | 'camp' | 'organization' | 'other'; description?: string } | null {
    if (!setting?.trim()) return null;
    const text = setting.trim();

    // 已知历史/架空势力关键词 → 组织
    const factionKeywords: Array<{ kw: string; name: string; type: 'regime' | 'faction' | 'army' | 'camp' | 'organization' }> = [
      { kw: '五胡', name: '北狄诸部', type: 'faction' },
      { kw: '北狄', name: '北狄诸部', type: 'faction' },
      { kw: '东夷', name: '东夷势力', type: 'faction' },
      { kw: '西戎', name: '西戎势力', type: 'faction' },
      { kw: '南蛮', name: '南蛮势力', type: 'faction' },
      { kw: '北魏', name: '北魏政权', type: 'regime' },
      { kw: '东晋', name: '东晋政权', type: 'regime' },
      { kw: '刘宋', name: '刘宋政权', type: 'regime' },
      { kw: '朝廷', name: '朝廷', type: 'regime' },
      { kw: '北洋', name: '北洋政府', type: 'regime' },
      { kw: '帝国', name: '帝国', type: 'regime' },
      { kw: '王国', name: '王国', type: 'faction' },
      { kw: '联邦', name: '联邦', type: 'faction' },
      { kw: '共和国', name: '共和国', type: 'regime' },
      { kw: '军方', name: '军方', type: 'army' },
      { kw: '军队', name: '军队', type: 'army' },
      { kw: '召唤玩家', name: '玩家阵营', type: 'camp' },
      { kw: '第四天灾', name: '玩家阵营', type: 'camp' },
      { kw: '文明复兴', name: '文明复兴系统', type: 'organization' },
    ];

    for (const f of factionKeywords) {
      if (text.includes(f.kw)) {
        return { name: f.name, type: f.type, description: `基于设定"${text}"推断的主势力` };
      }
    }

    // 修真/武侠门派关键词 → 门派 (sect)
    const sectPatterns = [/([\u4e00-\u9fa5]{1,4})门$/, /([\u4e00-\u9fa5]{1,4})派$/, /([\u4e00-\u9fa5]{1,4})宗$/, /([\u4e00-\u9fa5]{1,4})阁$/, /([\u4e00-\u9fa5]{1,4})堂$/, /([\u4e00-\u9fa5]{1,4})盟$/, /([\u4e00-\u9fa5]{1,4})教$/];
    for (const pattern of sectPatterns) {
      const match = text.match(pattern);
      if (match) {
        const name = match[0];
        return { name, type: 'sect', description: `基于设定"${text}"推断的门派` };
      }
    }

    // 未匹配到任何已知模式，跳过
    return null;
  }
}
