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
        title: '魂穿开局，确立核心危机',
        core: `${seedPremise}。主角醒来时先闻到药渣和煤烟味，床头的铜怀表停在九点十七分；他不是立刻“雄心万丈”，而是先发现自己连贴身随从的名字都叫不准。危机由一个小错开始扩大。`,
        scenes: '主角府邸、烧着半截的电报纸、权力中枢外的冷风廊道',
        actions: '主角把旧报、电报残页和随从口供拼在一起，故意在第一次见面时说错一个地名，试探谁会纠正他。',
        conflict: '他知道大势，却不懂眼前人的脾气；旧势力不急着反驳，反而等他露出“不是原来那个人”的破绽。',
        payoff: '主角没有开天眼式断言，而是用一张被茶水洇开的电报残页逼对方暂缓表态。',
        setup: '停住的怀表、被撕掉署名的电报、随从袖口的墨点，都指向府里已有内应。',
        recovery: '无，开篇只埋下怀表、电报、内应三条线。',
        ending: '主角以为自己稳住了局面，离开时却看见门房把那张电报残角塞进鞋底。',
        texture: '留白：主角没有解释自己为什么会怕冷，只反复把手按在怀表上。',
      },
      {
        title: '密访元老，建立隐性同盟',
        core: '主角去见元老，不是送宏图，而是送一份“不该出现”的名单。元老表面困倦，实际一直数主角喝了几口茶。',
        scenes: '雨夜车帘、徐府偏门、摆着旧棋谱的书房',
        actions: '主角避开正门，借还旧棋谱进府；谈话只说三成，把真正的判断夹在棋谱批注里。',
        conflict: '元老怕被当枪使，主角怕被当疯子；两人都想要同盟，却都不肯先承认需要对方。',
        payoff: '主角指出名单里一个死人仍在领饷，元老第一次抬眼，随手把茶盏转了半圈。',
        setup: '棋谱批注成为暗号；元老的沉默不是认可，而是准备另派人查主角。',
        recovery: '回收开篇“府中内应”的压力，确认监视已经外溢到元老府。',
        ending: '主角出门时听见书房里落下一枚棋子，元老没有送客，只说了一句“雨还没停”。',
        texture: '偏差：同盟不是握手达成，而是两个都不信人的人暂时互相利用。',
      },
      {
        title: '策反内应，摸清对手底牌',
        core: '主角没有直接抓内应，而是放出一条只有半真半假的消息，看谁会把错字原样传出去。',
        scenes: '偏院井台、账房暗格、议事厅外堆灰的火盆',
        actions: '主角让账房重抄名单，故意把一个地名写成旧称；随后在火盆灰里找未烧尽的纸筋。',
        conflict: '内应不是坏人模板，他有病母、有赌债，也知道主角未必守诺；主角也不是纯粹救人，他需要这个人继续脏下去。',
        payoff: '错字出现在对手的折子里，主角第一次掌握对方传递链。',
        setup: '内应要求的不是钱，而是一封能让母亲出城的路引；这封路引会成为后续道德代价。',
        recovery: '回收门房鞋底电报残角，确认府内消息从小人物手里流出。',
        ending: '内应跪下时没求饶，只问：“大人，我娘能不能不知道？”',
        texture: '留白：主角答应得太快，连自己都觉得不体面。',
      },
      {
        title: '中枢再辩，硬撼既得利益',
        core: '主角在公开议事里不求全胜，只求让对手在众人面前多说一句假话。那一句话会变成绳结。',
        scenes: '铺着旧地毯的议事厅、偏殿屏风后、返程马车里的玻璃窗',
        actions: '主角先示弱，让对方把论据说满；再把错字名单、领饷死人和外部条款压在最后一刻抛出。',
        conflict: '最高执政者要的是体面，旧派要的是利益，元老要的是余地；主角要的却是时间，四种目标互相错位。',
        payoff: '主角没有漂亮演讲，只问了一个具体问题：死人领的饷，最后进了谁的账？',
        setup: '外部势力代表没有出场，但其秘书的名片出现在偏殿茶几上。',
        recovery: '回收棋谱批注、错字名单和死人领饷三条线，形成第一次公开反击。',
        ending: '会议散后无人祝贺主角，只有冯系代表在马车窗上哈气，写下一个“等”字。',
        texture: '偏差：胜利不热闹，反而让主角意识到自己被更多人看见了。',
      },
      {
        title: '整合军政，铺开长期主线',
        core: '局势暂缓后，主角发现真正难的不是赢一场辩论，而是让互相厌恶的人坐在同一张饭桌上分账。',
        scenes: '军政小会、潮湿的铁路仓库、机器轰鸣的修械所、边防地图前',
        actions: '主角把军费、铁路、工厂和学校绑成一张账；谁想拿钱，就必须留下人、枪、煤或学生名额。',
        conflict: '军方嫌他算账太细，地方嫌他管得太远，旧派等他出错，外部势力则开始卡设备和教员。',
        payoff: '主角用一批“报废机器”换来第一条自修生产线，爽点落在具体资源置换上。',
        setup: '东北防线、军工学堂、铁路煤运、留学生名单进入长期主线；每条线都有人想截胡。',
        recovery: '回收“争取时间”的目标：时间不再是口号，而变成机器、账册和人名。',
        ending: '夜里停电，修械所只剩一盏煤油灯；主角看着第一枚粗糙螺丝，突然意识到这东西可能比一次胜利更重要。',
        texture: '留白：他没有说豪言，只把那枚不合格的螺丝收进怀表壳里。',
      },
    ];
    const timelineSeeds = [
      { date: '1915-09-16', title: '魂穿当日', desc: '主角进入旧局，发现核心危机已迫近。' },
      { date: '1915-09-17', title: '首次阻局', desc: '在中枢议事中争取短暂缓冲。' },
      { date: '1915-09-18', title: '公开再辩', desc: '硬撼既得利益集团，推动关键决策暂缓。' },
      { date: '1915-09', title: '外部条款危机', desc: '外部势力借内乱施压，主角转入外交与情报破局。' },
      { date: '1915-10', title: '形成同盟', desc: '元老、军方、地方势力逐步形成隐性同盟。' },
      { date: '1916-03', title: '阶段稳局', desc: '正式政治安排落定，主线转向整合华夏与实业强基。' },
    ];
    const worldConstraints = [
      { category: '时代', rule: '历史节点必须自洽', description: `故事发生在${historicalFrame}，重大事件按清晰时间线推进。`, severity: 'hard' },
      { category: '核心矛盾', rule: '内稳与外防并行', description: '每个阶段同时服务于稳定中枢、整合地方、抵御外部渗透。', severity: 'hard' },
      { category: '章节结构', rule: '章节卡字段完整', description: '章节至少包含核心内容、主要场景、人物行动、冲突、爽点、伏笔、回收、结尾与目标字数。', severity: 'hard' },
      { category: '审核语境', rule: '使用架空/替代表述', description: '正式场景优先使用中枢、华夏、外部势力等低敏替代词，保持时代感。', severity: 'soft' },
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
    }> = [
      ...seed.characters.map((name, idx) => ({
        name,
        isPovCharacter: idx === 0,
        role: idx === 0 ? 'protagonist' : 'major',
        identity: idx === 0 ? '破局主角' : '关键人物',
        background: idx === 0
          ? `${seed.description || seed.hook || '被时代推到台前的人'}。表面擅长推演，私下怕自己每一次判断都只是背答案；习惯摸停住的怀表，越紧张越说短句。`
          : `${seed.description || seed.hook || '关键人物'}。不要写成单一功能人，需要保留自己的误判、利益和不愿明说的旧伤。`,
        personality: idx === 0
          ? { extraversion: 38, agreeableness: 42, conscientiousness: 82, neuroticism: 66, openness: 78 }
          : { extraversion: 50, agreeableness: 45, conscientiousness: 62, neuroticism: 48, openness: 56 },
        dialogueStyle: idx === 0 ? '短句、留半句，紧张时先问细节不下结论。' : '说话要受身份和私心影响，避免替剧情解释。',
        dialoguePatterns: idx === 0 ? ['先把门关上。', '这句话是谁教你的？', '等等，这个字不对。'] : ['这话听着稳，未必能落地。'],
      })),
      {
        name: '徐世昌',
        isPovCharacter: false,
        role: 'major',
        identity: '元老派代表',
        background: '老于世故，不轻易站队。表面爱谈棋谱和旧雨，实际记得每个人年轻时欠过谁的人情；怕晚节碎在一场过早的豪赌里。',
        personality: { extraversion: 34, agreeableness: 58, conscientiousness: 76, neuroticism: 44, openness: 62 },
        dialogueStyle: '慢，常用旧事压人，不直接答应，只给可以被理解成暗示的话。',
        dialoguePatterns: ['雨还没停。', '这棋不能这么走。', '年轻人，话说满了就不好收。'],
      },
      {
        name: '段祺瑞',
        isPovCharacter: false,
        role: 'major',
        identity: '军方强势人物',
        background: '重实际、厌空谈。看似只认枪杆和军饷，内里有一套粗粝的秩序感；不怕背骂名，怕部下白死。',
        personality: { extraversion: 52, agreeableness: 31, conscientiousness: 84, neuroticism: 38, openness: 42 },
        dialogueStyle: '短硬、少修饰，先问粮饷、兵员、谁负责。',
        dialoguePatterns: ['钱从哪来？', '话可以漂亮，枪不会漂亮。', '死的是兵，不是折子。'],
      },
      {
        name: '冯国璋',
        isPovCharacter: false,
        role: 'major',
        identity: '东南军政代表',
        background: '精于观望，擅长给自己留退路。不是墙头草，而是永远先算东南能不能保住；喜欢在车窗雾气上写字，写完就擦掉。',
        personality: { extraversion: 47, agreeableness: 49, conscientiousness: 70, neuroticism: 55, openness: 58 },
        dialogueStyle: '圆滑但不空，常用地方账、路程和天气绕开立场。',
        dialoguePatterns: ['东南离这里远，消息到时常变味。', '这事可以等一等。', '路不好走，人心也是。'],
      },
      {
        name: '杨度',
        isPovCharacter: false,
        role: 'supporting',
        identity: '旧势力谋划者',
        background: '相信秩序必须有华丽外壳，也相信自己能替时代命名。不是单纯反派，他怕的是一生学问最后被证明只是错押。',
        personality: { extraversion: 61, agreeableness: 28, conscientiousness: 68, neuroticism: 62, openness: 73 },
        dialogueStyle: '文气、锋利，喜欢把私利说成大义，但偶尔露出焦躁。',
        dialoguePatterns: ['名分不立，人心何归？', '你只看见火，没看见灰下面还有种子。', '后世未必懂今日。'],
      },
      {
        name: '东瀛公使',
        isPovCharacter: false,
        role: 'supporting',
        identity: '外部势力代表',
        background: '礼貌、精确、耐心，擅长把威胁包进茶会邀请里。喜欢收集地方铁路时刻表，真正关心的从来不是会谈桌上的笑容。',
        personality: { extraversion: 44, agreeableness: 36, conscientiousness: 88, neuroticism: 29, openness: 64 },
        dialogueStyle: '温和克制，不直接威胁，用时间表、条款和礼节制造压力。',
        dialoguePatterns: ['贵方当然有时间考虑。', '只是铁路不会等人。', '小小误会，常常需要大代价来澄清。'],
      },
    ];
    const foreshadowingSeeds = [
      { content: seed.hook?.trim() || `${seedTitle}开局危机背后还有更深层的内外合谋。`, type: 'mystery', plannedRecoveryChapterIndex: 5, scope: 'global' },
      { content: '元老派与军方并非天然同盟，必须通过利益、威望与安全承诺逐步绑定。', type: 'relationship', plannedRecoveryChapterIndex: 12, scope: 'volume' },
      { content: '外部势力会利用中枢动荡提出追加条件，并寻找内部代理人。', type: 'setup', plannedRecoveryChapterIndex: 18, scope: 'global' },
      { content: '军政整合、实业强基、教育科研和国防建设是长篇后续四条主线。', type: 'setup', plannedRecoveryChapterIndex: 30, scope: 'global' },
      { content: '东北与边疆防线的初期布置，将在后续卷成为决定国运的关键回收点。', type: 'hint', plannedRecoveryChapterIndex: 60, scope: 'global' },
    ];
    this.logger.log(`[createSeedEntities] 开始创建种子实体 project=${projectId}`);

    // 1) 世界观 —— 基于灵感的 setting 字段
    try {
      const stepStart = Date.now();
      const worldName = seed.setting?.trim() || `${seed.title}的世界`;
      const ws = this.worldSettingService.create(projectId, {
        name: worldName,
        era: historicalFrame,
        constraints: worldConstraints,
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
        title: '第一卷：开局稳局与中枢破局',
        level: 'volume',
        parentId: book.id,
        order: 0,
        content: [
          '【卷目标】完成魂穿开局、阻断错误路线、建立元老/军方同盟，并把主线从单点危机推向军政与实业整合。',
          '【卷冲突】中枢旧派、地方观望、外部势力施压三线并行。',
          '【写作规则】每章使用：核心内容、主要场景、人物行动、冲突设计、爽点设置、伏笔设置、伏笔回收、结尾设置、目标字数。',
        ].join('\n\n'),
        characterIds: createdCharacterIds,
        foreshadowingIds,
      });
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
        description: '项目级组织根节点，用于承载全部阵营、机构、军政派系与外部势力。',
      });
      const orgChildren = [
        { name: '中枢与主角阵营', type: 'camp', description: '主角推进稳局、破局、整合的核心行动阵营。' },
        { name: '元老派', type: 'faction', description: '以威望、旧交和政治平衡能力维系局势。' },
        { name: '军方段系', type: 'army', description: '掌握军事执行力，是中枢安全与地方威慑的关键。' },
        { name: '东南冯系', type: 'army', description: '连接东南地方与中枢，是南北和谈的关键支点。' },
        { name: '旧路线推动者', type: 'faction', description: '围绕既得利益和错误路线结成的反对力量。' },
        { name: '外部势力', type: 'camp', description: '趁中枢动荡施压、追加条件并进行情报渗透。' },
        { name: '南方与西南势力', type: 'camp', description: '影响南北和谈、地方稳定和后续统一进程。' },
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
        description: seed.setting || seed.description || '项目级地图根节点。',
      });
      const beiping = this.mapPointService.create(projectId, {
        name: '北平/中枢核心区',
        type: 'city',
        level: 'city',
        parentId: root.id,
        description: '中枢议事、府邸密谈、权力交锋集中发生的核心舞台。',
      });
      const mapChildren = [
        { name: '中南海/居仁堂', type: 'location', level: 'location', parentId: beiping.id, description: '公开辩论与最高决策场景。' },
        { name: '袁府', type: 'location', level: 'location', parentId: beiping.id, description: '私下会谈、病榻托孤与权力继承相关场景。' },
        { name: '徐府', type: 'location', level: 'location', parentId: beiping.id, description: '元老派密谈与隐性同盟形成场景。' },
        { name: '天津', type: 'city', level: 'city', parentId: root.id, description: '军政调度、铁路与港口资源的关键节点。' },
        { name: '南京/东南', type: 'region', level: 'region', parentId: root.id, description: '东南军政势力与南北缓和线。' },
        { name: '东北防线', type: 'region', level: 'region', parentId: root.id, description: '后续国防、外患与工业布局的重点回收区域。' },
        { name: '西南局势区', type: 'region', level: 'region', parentId: root.id, description: '地方反应、叛乱压力与南方谈判线。' },
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

    // 已知历史/现实势力关键词 → 组织
    const factionKeywords: Array<{ kw: string; name: string; type: 'regime' | 'faction' | 'army' | 'camp' | 'organization' }> = [
      { kw: '北洋', name: '北洋政府', type: 'regime' },
      { kw: '朝廷', name: '朝廷', type: 'regime' },
      { kw: '政府', name: '政府', type: 'regime' },
      { kw: '军方', name: '军方', type: 'army' },
      { kw: '军队', name: '军队', type: 'army' },
      { kw: '帝国', name: '帝国', type: 'faction' },
      { kw: '王国', name: '王国', type: 'faction' },
      { kw: '联邦', name: '联邦', type: 'faction' },
      { kw: '共和国', name: '共和国', type: 'regime' },
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
