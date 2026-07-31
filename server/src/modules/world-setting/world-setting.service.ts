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

// 对齐外部文档《世界观模板》8 类：时代 / 地点 / 氛围基调 / 规则 / 社会结构 / 科技超自然体系 / 文化风俗 / 补充说明
export const WORLD_PROFILE_FIELDS = ['synopsis','basic_info','era','locations','atmosphere_tone','rules','social_structure','tech_supernatural','system_mechanics','culture_customs','naming_rules','scale_plan','ending','hierarchy_rules','supplementary'] as const;

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
  namingRules?: string;
  workIntro?: string;
  systemSettings?: string;
  dataPlanning?: string;
  // 新增字段 (migration 042)
  culturalSettings?: string;
  spoilerSettings?: string;
  censorshipRules?: string;
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
      naming_rules: dto.namingRules || null,
      work_intro: dto.workIntro || null,
      system_settings: dto.systemSettings || null,
      data_planning: dto.dataPlanning || null,
      cultural_settings: dto.culturalSettings || null,
      spoiler_settings: dto.spoilerSettings || null,
      censorship_rules: dto.censorshipRules || null,
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
    const profileData = this.getProfile(projectId, id);
    return { summary: this.buildWritingSummary(profileData.profile), profile: profileData.profile };
  }

  private buildWritingSummary(profile: Record<string, string>) {
    const value = (key: string) => profile[key] || '待补全';
    const fields: Array<[string, string]> = [
      ['作品简介/核心卖点','synopsis'],
      ['基本信息（书名/类型/时代/结局/字数目标/标签）','basic_info'],
      ['时代（时间线/历史背景）','era'],
      ['地点（主要区域/关键地点）','locations'],
      ['氛围基调','atmosphere_tone'],
      ['规则','rules'],
      ['社会结构（政治势力/经济资源/宗教信仰）','social_structure'],
      ['科技/超自然/力量体系（体系名称/能力来源/约束代价）','tech_supernatural'],
      ['系统机制（核心机制/金手指/特殊设定）','system_mechanics'],
      ['文化风俗（语言习俗/禁忌）','culture_customs'],
      ['命名规则','naming_rules'],
      ['全文规模/数据规划（人口/势力/资源等量化）','scale_plan'],
      ['结局设定','ending'],
      ['核心层级规则（最高优先级·核心设定>大纲>正文）','hierarchy_rules'],
      ['补充说明','supplementary'],
    ];
    return ['【核心设定写作摘要】（地基型·对齐《核心设定.txt》）', ...fields.map(([label, key]) => `${label}：${value(key)}`)].join('\n');
  }

  /* Legacy summary implementation is retained below for source compatibility. */
  private legacyWritingSummary(projectId: string, id: string) {
    const data = this.getProfile(projectId, id); const p = data.profile; const value = (key: string) => p[key] || '待补全';
    const labels: Array<[string,string]> = [['时代','era'],['地点','locations'],['氛围基调','atmosphere_tone'],['规则','rules'],['社会结构','social_structure'],['科技/超自然体系','tech_supernatural'],['文化风俗','culture_customs'],['补充说明','supplementary']];
    return { summary: ['【世界观写作摘要】', ...labels.map(([label,key]) => `${label}：${value(key)}`)].join('\n'), profile: p };
  }

  checkConsistency(projectId: string, content: string) {
    const issues: any[] = []; for (const setting of this.findByProjectId(projectId)) { const p = this.getProfile(projectId, setting.id).profile; const add = (issueType: string, evidence: string, reason: string, suggestion: string, severity: 'low'|'medium'|'high') => issues.push({ worldSettingId: setting.id, worldSettingName: setting.name, issueType, evidence, reason, suggestion, severity });
      if (p.rules && /(?:\u65e0\u89c6\u89c4\u5219|\u6253\u7834\u89c4\u5219|\u4e0d\u53d7\u9650\u5236|\u4e0d\u53d7\u6cd5\u5219\u7ea6\u675f|\u89c4\u5219\u5931\u6548)/.test(content) && !content.includes(p.rules)) add('rules', p.rules, '正文可能违反世界观规则', `补充或改写以遵守规则：${p.rules}`, 'high');
      if (p.tech_supernatural && /瞬间|轻易|无代价|不费力气/.test(content) && /力量|能力|体系|施展|法术|科技/.test(content) && !content.includes(p.tech_supernatural)) add('tech_supernatural', p.tech_supernatural, '力量/科技表现未体现约束与代价', '补充体系约束或代价', 'medium');
      if (p.system_mechanics && /(?:\u7cfb\u7edf\u7834\u89c1|\u91d1\u624b\u6307\u5931\u6548|\u673a\u5236\u7834\u89e3|\u89c4\u5219\u88ab\u7a7f\u8d8a)/.test(content) && !content.includes(p.system_mechanics)) add('system_mechanics', p.system_mechanics, '正文可能破坏已设定的核心机制', `回扣系统机制：${p.system_mechanics}`, 'medium');
      if (p.culture_customs && /公然违禁|肆无忌惮违法|毫无顾忌/.test(content) && p.culture_customs.includes('禁忌') && !content.includes(p.culture_customs)) add('culture_customs', p.culture_customs, '禁忌行为未体现文化约束', '补充惩罚或隐蔽代价', 'medium');
      if (p.atmosphere_tone && /祥和|太平|安全无忧/.test(content) && /黑暗|压抑|危险|残酷/.test(p.atmosphere_tone) && !content.includes(p.atmosphere_tone)) add('atmosphere_tone', p.atmosphere_tone, '正文氛围与世界观基调冲突', '回扣整体氛围基调', 'medium'); }
    return { passed: issues.length === 0, score: Math.max(0, 100 - issues.length * 15), issues };
  }

  private profileRow(row: any) { return Object.fromEntries(WORLD_PROFILE_FIELDS.map(field => [field, row?.[field] || ''])); }
  private worldGroups(fields: readonly string[]) { const groups: Record<string,string[]> = { synopsis:['synopsis'],basic_info:['basic_info'],era:['era'],locations:['locations'],atmosphere_tone:['atmosphere_tone'],rules:['rules'],social_structure:['social_structure'],tech_supernatural:['tech_supernatural'],system_mechanics:['system_mechanics'],culture_customs:['culture_customs'],naming_rules:['naming_rules'],scale_plan:['scale_plan'],ending:['ending'],hierarchy_rules:['hierarchy_rules'],supplementary:['supplementary'] }; return Object.entries(groups).filter(([, keys]) => keys.some(key => fields.includes(key))).map(([group]) => group); }

  update(id: string, dto: UpdateWorldSettingDto): WorldSettingResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`WorldSetting ${id} not found`);

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updated_at: now, version: existing.version + 1 };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.era !== undefined) updateData.era = dto.era;
    if (dto.namingRules !== undefined) updateData.naming_rules = dto.namingRules;
    if (dto.workIntro !== undefined) updateData.work_intro = dto.workIntro;
    if (dto.systemSettings !== undefined) updateData.system_settings = dto.systemSettings;
    if (dto.dataPlanning !== undefined) updateData.data_planning = dto.dataPlanning;
    if (dto.culturalSettings !== undefined) updateData.cultural_settings = dto.culturalSettings;
    if (dto.spoilerSettings !== undefined) updateData.spoiler_settings = dto.spoilerSettings;
    if (dto.censorshipRules !== undefined) updateData.censorship_rules = dto.censorshipRules;

    this.repo.update(id, updateData);
    const response = this.toResponse(this.repo.findById(id)!);
    this.analyzeStateImpact(existing.project_id, id, '世界观资料修改影响分析', {
      before: this.toResponse(existing),
      after: dto,
      priority: 'world_setting',
    });
    return response;
  }

  /**
   * 生成世界观修改方案（真实）：基于数据库当前设定计算差异，并扫描章节正文与伏笔，
   * 找出对旧值的具体引用，给出真实的影响分析。不依赖任何内存桩或假数据。
   */
  generateChangePlan(projectId: string, settingId: string, proposedChanges: Record<string, unknown>): {
    changes: Array<{ field: string; oldValue: string; newValue: string }>;
    impactAnalysis: Array<{ affectedContent: string[]; severity: 'low' | 'medium' | 'high' }>;
    suggestions: string[];
    requiresConfirmation: boolean;
  } {
    const current = this.repo.findById(settingId);
    if (!current) throw new NotFoundException(`WorldSetting ${settingId} not found`);
    if (current.project_id !== projectId) throw new NotFoundException('World setting not found');

    const changes: Array<{ field: string; oldValue: string; newValue: string }> = [];
    for (const [field, newValue] of Object.entries(proposedChanges || {})) {
      const oldValue = String((current as any)[field] ?? '');
      if (oldValue !== String(newValue)) {
        changes.push({ field, oldValue, newValue: String(newValue) });
      }
    }

    // 真实影响分析：扫描章节正文与伏笔描述，查找对旧值的具体引用
    const db = this.databaseService.getDb();
    const affectedContent: string[] = [];
    for (const change of changes) {
      const oldVal = change.oldValue.trim();
      if (!oldVal) continue;
      const chapters = db.prepare('SELECT chapter_index, title, content FROM chapters WHERE project_id = ? AND content LIKE ?').all(projectId, `%${oldVal}%`) as any[];
      for (const ch of chapters) {
        affectedContent.push(`第${ch.chapter_index}章${ch.title ? `《${ch.title}》` : ''}：正文引用了“${oldVal}”`);
      }
      const fores = db.prepare('SELECT chapter_index, description FROM foreshadowings WHERE project_id = ? AND description LIKE ?').all(projectId, `%${oldVal}%`) as any[];
      for (const f of fores) {
        affectedContent.push(`第${f.chapter_index ?? '?'}章伏笔：引用了“${oldVal}”`);
      }
    }
    const uniqueAffected = [...new Set(affectedContent)];

    let severity: 'low' | 'medium' | 'high' = 'low';
    let requiresConfirmation = false;
    if (changes.length > 3) { severity = 'high'; requiresConfirmation = true; }
    else if (changes.length > 1) severity = 'medium';
    if (uniqueAffected.length > 3) severity = 'high';
    if (uniqueAffected.length > 0 && severity === 'low') severity = 'medium';
    if (uniqueAffected.length > 0) requiresConfirmation = true;

    const suggestions: string[] = [];
    if (changes.length > 0) suggestions.push(`“${current.name}”的修改可能影响依赖该设定的章节与伏笔，建议重新审查相关正文`);
    if (uniqueAffected.length > 0) suggestions.push(`检测到 ${uniqueAffected.length} 处内容可能需同步修改：${uniqueAffected.slice(0, 3).join('；')}${uniqueAffected.length > 3 ? '…' : ''}`);
    if (severity === 'high') suggestions.push('此修改影响范围较大，建议分步实施并逐一确认');
    if (requiresConfirmation) suggestions.push('需要作者确认后才能执行此修改');
    if (suggestions.length === 0) suggestions.push('此修改未检测到冲突影响，可以安全执行');

    return {
      changes,
      impactAnalysis: [{ affectedContent: uniqueAffected.length ? uniqueAffected : ['暂无已检测到的受影响内容'], severity }],
      suggestions,
      requiresConfirmation,
    };
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`WorldSetting ${id} not found`);
    const before = this.toResponse(existing);
    this.repo.delete(id);
    this.analyzeStateImpact(existing.project_id, id, '世界观删除影响分析', {
      operation: 'remove', before, priority: 'world_setting', needsReview: true,
    });
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
      before: this.toResponse(existing),
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
      before: this.toResponse(existing),
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
    // 解析 world_settings.constraints JSON（7维度数据）
    let geo = '', social = '', power = '', economy = '', culture = '', history = '', ending = '', factions: any[] = [];
    try {
      const c = row.constraints ? JSON.parse(String(row.constraints)) : {};
      social = c.socialStructure || '';
      power = c.powerSystem || '';
      economy = c.economy || '';
      culture = c.culture || '';
      history = c.history || '';
      ending = c.endingDirection || '';
      factions = c.factions || (Array.isArray(row.factions) ? JSON.parse(String(row.factions)) : []);
    } catch {}
    return {
      storyPremise: row.story_premise || '',
      era: row.era || history || '',
      locations: row.locations ? JSON.parse(row.locations) : [],
      socialRules: row.social_rules || '',
      specialSettings: row.special_settings || '',
      // 7维度（per 文档）
      geography: row.geography ? (() => { try { return JSON.parse(row.geography); } catch { return []; } })() : [],
      socialStructure: social,
      powerSystem: power,
      economy: economy,
      culture: culture,
      history: history,
      factions: factions,
      endingDirection: ending,
      // from world_system_profiles（per 世界观模板.txt）
      ...(() => {
        try {
          const db = (this as any).databaseService?.getDb?.() || (this as any).db?.getDb?.();
          if (!db) return {};
          const wf = db.prepare(`SELECT atmosphere_tone, rules, supplementary FROM world_system_profiles WHERE project_id=? LIMIT 1`).get(projectId) as any;
          return {
            atmosphereTone: wf?.atmosphere_tone || '',
            rules: wf?.rules || '',
            supplementary: wf?.supplementary || '',
          };
        } catch { return {}; }
      })(),
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
        naming_rules: null,
        work_intro: null,
        system_settings: null,
        data_planning: null,
        cultural_settings: null,
        spoiler_settings: null,
        censorship_rules: null,
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
      if (dto.culturalSettings !== undefined) updateData.cultural_settings = dto.culturalSettings;
      if (dto.spoilerSettings !== undefined) updateData.spoiler_settings = dto.spoilerSettings;
      if (dto.censorshipRules !== undefined) updateData.censorship_rules = dto.censorshipRules;
      updateData.setting_type = 'short';

      this.repo.update(row.id, updateData);
      this.analyzeStateImpact(projectId, row.id, '短篇世界观设定修改影响分析', {
        before: this.toResponse(row),
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
      namingRules: row.naming_rules || undefined,
      workIntro: row.work_intro || undefined,
      systemSettings: row.system_settings || undefined,
      dataPlanning: row.data_planning || undefined,
      // 新增字段 (migration 042)
      culturalSettings: row.cultural_settings || undefined,
      spoilerSettings: row.spoiler_settings || undefined,
      censorshipRules: row.censorship_rules || undefined,
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
    this.stateItemService.analyzeImpactTracked(projectId, {
        targetType: 'world_setting',
        targetId: id,
        summary,
        payload: { ...payload, priority: 'world_setting', affects: ['character', 'outline', 'volume', 'chapter_plan', 'chapter'] },
    });
  }
}
