/**
 * 世界观 Setting Service
 */
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { WorldSettingRepository } from '../../database/repositories/world-setting.repository';
import type { WorldSettingRow } from '../../database/repositories/world-setting.repository';
import type { CreateWorldSettingDto, UpdateWorldSettingDto, AddConstraintDto } from './dto/world-setting.dto';
import { StateItemService } from '../../state/state-item.service';
import { DatabaseService } from '../../database/database.service';

const WORLD_PROFILE_FIELDS = ['story_premise','core_theme','reader_promise','genre_type','tone_style','era_background','time_span','calendar_system','historical_stage','current_world_status','geography_structure','major_regions','dangerous_zones','resource_distribution','traffic_routes','distance_logic','social_structure','class_system','family_structure','occupation_system','education_system','social_mobility','political_structure','ruling_system','law_system','bureaucracy','military_system','tax_system','economic_system','currency_system','trade_rules','resource_rules','black_market','scarcity_logic','power_system','power_source','power_levels','power_cost','power_limit','power_growth','power_taboo','power_failure_case','technology_system','technology_level','special_technology','technology_limit','technology_cost','culture_daily_life','food_clothing_housing','festival_customs','religion_belief','language_naming_rules','etiquette_rules','law_and_taboo','forbidden_behaviors','punishment_rules','public_order','hidden_rules','unspoken_rules','history_events','major_disasters','founding_events','wars','dynasty_changes','lost_truths','major_forces','force_relations','force_conflicts','force_resources','force_secrets','world_hooks','main_conflict_source','hidden_truth','final_truth_direction','world_mystery','forbidden_world_rules','must_obey_rules','can_change_rules','easy_to_break_points','current_chapter_usage'] as const;

export interface WorldSettingResponse {
  id: string;
  projectId: string;
  name: string;
  era?: string;
  eraPeriod?: any;
  geography: any[];
  factions: any[];
  powerSystem: any[];
  economy: any;
  society: any;
  constraints: any[];
  version: number;
  createdAt: string;
  updatedAt: string;
  // 短篇世界观字段
  storyPremise?: string;
  locations?: string[];
  socialRules?: string;
  specialSettings?: string;
  settingType?: string;
}

@Injectable()
export class WorldSettingService {
  constructor(
    private readonly repo: WorldSettingRepository,
    private readonly databaseService: DatabaseService,
    @Optional() private readonly stateItemService?: StateItemService,
  ) {}

  create(projectId: string, dto: CreateWorldSettingDto): WorldSettingResponse {
    const now = new Date().toISOString();
    const id = uuid();

    const constraints = (dto.constraints || []).map((c) => ({
      id: uuid(),
      category: c.category,
      rule: c.rule,
      description: c.description,
      severity: c.severity,
      appliesTo: [],
    }));

    this.repo.insert({
      id,
      project_id: projectId,
      name: dto.name,
      era: dto.era || null,
      era_period: null,
      geography: '[]',
      factions: '[]',
      power_system: '[]',
      economy: '{}',
      society: '{}',
      constraints: JSON.stringify(constraints),
      version: 1,
      created_at: now,
      updated_at: now,
    });

    return this.toResponse(this.repo.findById(id)!);
  }

  findByProjectId(projectId: string): WorldSettingResponse[] {
    return this.repo.findByProjectId(projectId).map((r) => this.toResponse(r));
  }

  findOne(id: string): WorldSettingResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`WorldSetting ${id} not found`);
    return this.toResponse(row);
  }

  getProfile(projectId: string, id: string) {
    const worldSetting = this.findOne(id);
    if (worldSetting.projectId !== projectId) throw new NotFoundException('World setting not found');
    const row = this.databaseService.getDb().prepare('SELECT * FROM world_system_profiles WHERE project_id = ? AND world_setting_id = ?').get(projectId, id) as any;
    return { worldSetting, profile: this.profileRow(row), warnings: [] };
  }

  updateProfile(projectId: string, id: string, input: Record<string, unknown>) {
    const worldSetting = this.findOne(id);
    if (worldSetting.projectId !== projectId) throw new NotFoundException('World setting not found');
    const db = this.databaseService.getDb(); const now = new Date().toISOString();
    const before = db.prepare('SELECT * FROM world_system_profiles WHERE world_setting_id = ?').get(id) as any;
    const values = WORLD_PROFILE_FIELDS.map(field => String(input[field] ?? before?.[field] ?? ''));
    db.prepare(`INSERT INTO world_system_profiles (id, project_id, world_setting_id, ${WORLD_PROFILE_FIELDS.join(', ')}, created_at, updated_at) VALUES (?, ?, ?, ${WORLD_PROFILE_FIELDS.map(() => '?').join(', ')}, ?, ?) ON CONFLICT(world_setting_id) DO UPDATE SET ${WORLD_PROFILE_FIELDS.map(field => `${field}=excluded.${field}`).join(', ')}, updated_at=excluded.updated_at`).run(before?.id || uuid(), projectId, id, ...values, before?.created_at || now, now);
    const changedFields = WORLD_PROFILE_FIELDS.filter(field => String(before?.[field] || '') !== String(input[field] ?? before?.[field] ?? ''));
    if (changedFields.length) this.analyzeStateImpact(projectId, id, '世界观 profile 修改影响分析', { changedFields, changedGroups: this.worldGroups(changedFields), riskReason: '世界规则已变化，后续正文上下文需要复核。', affectedModules: ['chapter','outline','character','foreshadowing','timeline','map','writing_context','writing_quality'], suggestedReviewAction: '复核关联章节、地图和伏笔。' });
    return this.getProfile(projectId, id);
  }

  getWritingSummary(projectId: string, id: string) {
    const data = this.getProfile(projectId, id); const p = data.profile; const value = (key: string) => p[key] || '待补全';
    const labels: Array<[string,string]> = [['故事前提','story_premise'],['核心主题','core_theme'],['读者期待','reader_promise'],['时代背景','era_background'],['当前世界状态','current_world_status'],['地理结构','geography_structure'],['主要地区','major_regions'],['危险区域','dangerous_zones'],['社会结构','social_structure'],['政治法律','political_structure'],['经济资源','economic_system'],['力量体系','power_system'],['力量限制','power_limit'],['力量代价','power_cost'],['技术体系','technology_system'],['文化日常','culture_daily_life'],['法律禁忌','law_and_taboo'],['历史真相','lost_truths'],['势力冲突','force_conflicts'],['世界钩子','world_hooks'],['主冲突来源','main_conflict_source'],['AI 写作约束','must_obey_rules'],['禁止世界规则','forbidden_world_rules'],['容易写崩点','easy_to_break_points']];
    return { summary: ['【世界观写作摘要】', ...labels.map(([label,key]) => `${label}：${value(key)}`)].join('\n'), profile: p };
  }

  checkConsistency(projectId: string, content: string) {
    const issues: any[] = []; for (const setting of this.findByProjectId(projectId)) { const p = this.getProfile(projectId, setting.id).profile; const add = (issueType: string, evidence: string, reason: string, suggestion: string, severity: 'low'|'medium'|'high') => issues.push({ worldSettingId: setting.id, worldSettingName: setting.name, issueType, evidence, reason, suggestion, severity });
      if (p.forbidden_world_rules && content.includes(p.forbidden_world_rules)) add('forbidden_world_rules', p.forbidden_world_rules, '正文命中禁止世界规则', '改写以遵守世界禁令', 'high');
      if (p.power_limit && /瞬间|轻易|无代价/.test(content) && !content.includes(p.power_limit)) add('power_limit', p.power_limit, '力量表现未体现限制', '补充力量限制或代价', 'medium');
      if (p.power_cost && /施展|力量|法术/.test(content) && !content.includes(p.power_cost)) add('power_cost', p.power_cost, '力量使用未体现代价', '补充代价', 'medium');
      if (p.technology_limit && /人工智能|激光枪|互联网/.test(content)) add('technology_limit', p.technology_limit, '正文可能出现超体系技术', '回到当前技术边界', 'medium');
      if (p.law_and_taboo && /公然违禁|违法/.test(content) && !content.includes(p.punishment_rules)) add('law_and_taboo', p.law_and_taboo, '禁忌行为未体现后果', '补充惩罚或隐蔽代价', 'medium');
      if (p.distance_logic && /瞬间到达|瞬移/.test(content)) add('distance_logic', p.distance_logic, '地点移动可能违反距离逻辑', '补充路线与时间成本', 'medium');
      if (p.easy_to_break_points && content.includes(p.easy_to_break_points)) add('easy_to_break_points', p.easy_to_break_points, '正文命中世界观易写崩点', '重写相关设定', 'medium'); }
    return { passed: issues.length === 0, score: Math.max(0, 100 - issues.length * 15), issues };
  }

  private profileRow(row: any) { return Object.fromEntries(WORLD_PROFILE_FIELDS.map(field => [field, row?.[field] || ''])); }
  private worldGroups(fields: readonly string[]) { const groups: Record<string,string[]> = { premise:['story_premise','core_theme','reader_promise','genre_type','tone_style'],time:['era_background','time_span','calendar_system','historical_stage','current_world_status'],geography:['geography_structure','major_regions','dangerous_zones','resource_distribution','traffic_routes','distance_logic'],society:['social_structure','class_system','family_structure','occupation_system','education_system','social_mobility'],politics:['political_structure','ruling_system','law_system','bureaucracy','military_system','tax_system'],economy:['economic_system','currency_system','trade_rules','resource_rules','black_market','scarcity_logic'],power:['power_system','power_source','power_levels','power_cost','power_limit','power_growth','power_taboo','power_failure_case'],technology:['technology_system','technology_level','special_technology','technology_limit','technology_cost'],culture:['culture_daily_life','food_clothing_housing','festival_customs','religion_belief','language_naming_rules','etiquette_rules'],law:['law_and_taboo','forbidden_behaviors','punishment_rules','public_order','hidden_rules','unspoken_rules'],history:['history_events','major_disasters','founding_events','wars','dynasty_changes','lost_truths'],forces:['major_forces','force_relations','force_conflicts','force_resources','force_secrets'],hooks:['world_hooks','main_conflict_source','hidden_truth','final_truth_direction','world_mystery'],constraints:['forbidden_world_rules','must_obey_rules','can_change_rules','easy_to_break_points','current_chapter_usage'] }; return Object.entries(groups).filter(([, keys]) => keys.some(key => fields.includes(key))).map(([group]) => group); }

  update(id: string, dto: UpdateWorldSettingDto): WorldSettingResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`WorldSetting ${id} not found`);

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updated_at: now, version: existing.version + 1 };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.era !== undefined) updateData.era = dto.era;

    this.repo.update(id, updateData);
    const response = this.toResponse(this.repo.findById(id)!);
    this.analyzeStateImpact(existing.project_id, id, '世界观资料修改影响分析', {
      before: { name: existing.name, era: existing.era },
      after: dto,
      priority: 'world_setting',
    });
    return response;
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`WorldSetting ${id} not found`);
    this.repo.delete(id);
    return { success: true };
  }

  addConstraint(id: string, dto: AddConstraintDto): WorldSettingResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`WorldSetting ${id} not found`);
    const constraint = { id: uuid(), ...dto, appliesTo: [] };
    const row = this.repo.addConstraint(id, constraint);
    if (!row) throw new NotFoundException(`WorldSetting ${id} not found`);
    const response = this.toResponse(row);
    this.analyzeStateImpact(existing.project_id, id, '世界观约束添加影响分析', {
      before: { constraints: existing.constraints },
      after: { constraints: row.constraints },
      constraintChange: `add_constraint: ${dto.category || 'unknown'}: ${(dto as any).rule || ''}`,
      priority: 'world_setting',
    });
    return response;
  }

  removeConstraint(id: string, constraintId: string): WorldSettingResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`WorldSetting ${id} not found`);
    const row = this.repo.removeConstraint(id, constraintId);
    if (!row) throw new NotFoundException(`WorldSetting ${id} not found`);
    const response = this.toResponse(row);
    this.analyzeStateImpact(existing.project_id, id, '世界观约束删除影响分析', {
      before: { constraints: existing.constraints },
      after: { constraints: row.constraints },
      constraintChange: `remove_constraint: ${constraintId}`,
      priority: 'world_setting',
    });
    return response;
  }

  /**
   * 获取短篇世界观设定
   * 如果不存在则返回默认值
   */
  getSimpleSettings(projectId: string): Record<string, any> {
    console.log('[WorldSettingService] getSimpleSettings called with projectId:', projectId);
    const settings = this.repo.findByProjectId(projectId);
    console.log('[WorldSettingService] Found settings:', settings.length);
    if (settings.length === 0) {
      // 返回空默认值
      return {
        storyPremise: '',
        era: '',
        locations: [],
        socialRules: '',
        specialSettings: '',
      };
    }

    const row = settings[0];
    return {
      storyPremise: row.story_premise || '',
      era: row.era || '',
      locations: row.locations ? JSON.parse(row.locations) : [],
      socialRules: row.social_rules || '',
      specialSettings: row.special_settings || '',
    };
  }

  /**
   * 保存短篇世界观设定（upsert）
   */
  upsertSimpleSettings(projectId: string, dto: Record<string, any>): Record<string, any> {
    const settings = this.repo.findByProjectId(projectId);
    const now = new Date().toISOString();

    if (settings.length === 0) {
      // 创建新的世界观设定
      const id = uuid();
      this.repo.insert({
        id,
        project_id: projectId,
        name: '默认世界观',
        era: dto.era || null,
        era_period: null,
        geography: '[]',
        factions: '[]',
        power_system: '[]',
        economy: '{}',
        society: '{}',
        constraints: '[]',
        version: 1,
        created_at: now,
        updated_at: now,
        story_premise: dto.storyPremise || '',
        locations: JSON.stringify(dto.locations || []),
        social_rules: dto.socialRules || '',
        special_settings: dto.specialSettings || '',
        setting_type: 'short',
      });
    } else {
      // 更新现有设定
      const row = settings[0];
      const updateData: Record<string, any> = {
        updated_at: now,
        version: row.version + 1,
      };

      if (dto.storyPremise !== undefined) updateData.story_premise = dto.storyPremise;
      if (dto.era !== undefined) updateData.era = dto.era;
      if (dto.locations !== undefined) updateData.locations = JSON.stringify(dto.locations);
      if (dto.socialRules !== undefined) updateData.social_rules = dto.socialRules;
      if (dto.specialSettings !== undefined) updateData.special_settings = dto.specialSettings;
      updateData.setting_type = 'short';

      this.repo.update(row.id, updateData);
      this.analyzeStateImpact(projectId, row.id, '短篇世界观设定修改影响分析', {
        before: {
          storyPremise: row.story_premise,
          era: row.era,
          locations: row.locations,
          socialRules: row.social_rules,
          specialSettings: row.special_settings,
        },
        after: dto,
        priority: 'world_setting',
      });
    }

    // 返回保存后的数据
    return this.getSimpleSettings(projectId);
  }

  private toResponse(row: WorldSettingRow): WorldSettingResponse {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      era: row.era || undefined,
      eraPeriod: row.era_period ? JSON.parse(row.era_period) : undefined,
      geography: JSON.parse(row.geography),
      factions: JSON.parse(row.factions),
      powerSystem: JSON.parse(row.power_system),
      economy: JSON.parse(row.economy),
      society: JSON.parse(row.society),
      constraints: JSON.parse(row.constraints),
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // 短篇世界观字段
      storyPremise: row.story_premise || '',
      locations: row.locations ? JSON.parse(row.locations) : [],
      socialRules: row.social_rules || '',
      specialSettings: row.special_settings || '',
      settingType: row.setting_type || 'full',
    };
  }

  private analyzeStateImpact(projectId: string, id: string, summary: string, payload: Record<string, unknown>) {
    if (!this.stateItemService) return;
    try {
      this.stateItemService.analyzeImpact(projectId, {
        targetType: 'world_setting',
        targetId: id,
        summary,
        payload: { ...payload, priority: 'world_setting', affects: ['character', 'outline', 'volume', 'chapter_plan', 'chapter'] },
      });
    } catch {
      // 影响分析失败不能阻断资料保存
    }
  }
}
