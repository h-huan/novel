/**
 * 世界观 Setting Service
 */
import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { WorldSettingRepository } from '../../database/repositories/world-setting.repository';
import type { WorldSettingRow } from '../../database/repositories/world-setting.repository';
import type { CreateWorldSettingDto, UpdateWorldSettingDto, AddConstraintDto } from './dto/world-setting.dto';
import { StateItemService } from '../../state/state-item.service';
import { DatabaseService } from '../../database/database.service';
import { maskForeshadowAnswers } from '../../chain/foreshadow-mask';
import { buildCanonPolicyDirective } from '../canon/canon-policy';

// 世界观档案字段（世界运行规则 + 作品地基字段）；custom_settings 为按小说自定义设定（JSON 键值对）
export const WORLD_PROFILE_FIELDS = ['synopsis','basic_info','era','locations','atmosphere_tone','rules','social_structure','tech_supernatural','system_mechanics','economy_system','culture_customs','naming_rules','factions','scale_plan','ending','hierarchy_rules','supplementary','custom_settings'] as const;

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
  culturalSettings?: string;
  spoilerSettings?: string;
  censorshipRules?: string;
  createdAt: string;
  updatedAt: string;
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

  /**
   * 世界观只允许在项目创建阶段首次建立/补齐。项目一旦离开 creating，世界观即冻结。
   * 这是硬边界，不提供“影响分析后仍可自动修改”的旁路：冲突必须去改更小影响面的资料。
   */
  private assertWorldMutable(projectId: string, operation: string): void {
    const project = this.databaseService.getDb().prepare('SELECT id,status FROM projects WHERE id=? LIMIT 1').get(projectId) as any;
    if (!project) throw new NotFoundException('Project not found');
    if (String(project.status || '') !== 'creating') {
      throw new ConflictException(`世界观已冻结，不能执行“${operation}”。世界观是小说地基；请在章纲、未来计划、状态、伏笔或未接受正文中选择最小代价修复点，禁止通过修改世界观来消除冲突。`);
    }
  }

  create(projectId: string, dto: CreateWorldSettingDto): WorldSettingResponse {
    this.assertWorldMutable(projectId, '创建/替换世界观');
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
    this.assertWorldMutable(projectId, '修改世界观档案');
    const db = this.databaseService.getDb(); const now = new Date().toISOString();
    const before = db.prepare('SELECT * FROM world_system_profiles WHERE world_setting_id = ?').get(id) as any;
    const values = WORLD_PROFILE_FIELDS.map(field => String(input[field] ?? before?.[field] ?? ''));
    db.prepare(`INSERT INTO world_system_profiles (id, project_id, world_setting_id, ${WORLD_PROFILE_FIELDS.join(', ')}, created_at, updated_at) VALUES (?, ?, ?, ${WORLD_PROFILE_FIELDS.map(() => '?').join(', ')}, ?, ?) ON CONFLICT(world_setting_id) DO UPDATE SET ${WORLD_PROFILE_FIELDS.map(field => `${field}=excluded.${field}`).join(', ')}, updated_at=excluded.updated_at`).run(before?.id || uuid(), projectId, id, ...values, before?.created_at || now, now);
    const changedFields = WORLD_PROFILE_FIELDS.filter(field => String(before?.[field] || '') !== String(input[field] ?? before?.[field] ?? ''));
    if (changedFields.length) this.analyzeStateImpact(projectId, id, '创建阶段世界观 profile 补齐影响分析', { changedFields, changedGroups: this.worldGroups(changedFields), riskReason: '创建阶段世界规则仍在首次建立，后续资料必须以最终冻结版本为准。', affectedModules: ['chapter','outline','character','foreshadowing','timeline','map','writing_context','writing_quality'], suggestedReviewAction: '世界观冻结前完成一致性复核。' });
    return this.getProfile(projectId, id);
  }

  getWritingSummary(projectId: string, id: string, maskForeshadow = false) {
    const profileData = this.getProfile(projectId, id);
    if (!this.databaseService.getDb().prepare(
      'SELECT 1 FROM world_system_profiles WHERE project_id=? AND world_setting_id=?'
    ).get(projectId, id)) {
      throw new Error(`世界观 ${id} 缺少关联档案，不能构造正文约束`);
    }
    return { summary: this.buildWritingSummary(profileData.profile, maskForeshadow), profile: profileData.profile };
  }

  private buildWritingSummary(profile: Record<string, string>, maskForeshadow = false) {
    const value = (key: string) => profile[key] || '待补全';
    const fields: Array<[string, string]> = [
      ['作品简介/核心卖点','synopsis'],
      ['基本信息（书名/类型/时代/结局/字数目标/标签）','basic_info'],
      ['时代（时间线/历史背景）','era'],
      ['地点（主要区域/关键地点）','locations'],
      ['氛围基调','atmosphere_tone'],
      ['规则','rules'],
      ['社会结构（政治势力/经济资源/宗教信仰）','social_structure'],
      ['经济体系（货币/贸易/产业）','economy_system'],
      ['科技/超自然/力量体系（体系名称/能力来源/约束代价）','tech_supernatural'],
      ['系统机制（核心机制/金手指/特殊设定）','system_mechanics'],
      ['文化风俗（语言习俗/禁忌）','culture_customs'],
      ['命名规则','naming_rules'],
      ['势力分布（主要势力/组织）','factions'],
      ['全文规模/数据规划（人口/势力/资源等量化）','scale_plan'],
      ['结局设定','ending'],
      ['补充说明','supplementary'],
    ];
    const custom = (profile['custom_settings'] || '').trim();
    const customLines = maskForeshadow
      ? (custom
        ? [`自定义设定（收尾反转信息已脱敏，正文不得提前点名归属/结果）：${this.sanitizeCustomSettings(custom, profile['ending'])}`]
        : [])
      : (custom ? [`自定义设定：${custom}`] : []);
    return ['【世界观写作摘要】', buildCanonPolicyDirective(), ...fields.map(([label, key]) => `${label}：${value(key)}`), ...customLines].join('\n');
  }

  private sanitizeCustomSettings(custom: string, ending?: string): string {
    if (!custom) return '';
    const foreshadowKeywords = new Set<string>();
    if (ending) {
      const m = ending.match(/必须回收的伏笔[：:]([^\n]+)/);
      if (m) {
        for (const item of m[1].split(/[①②③④⑤⑥⑦⑧⑨⑩]/).filter(Boolean)) {
          const clean = item.replace(/[，。；、\s"“”'（）()]/g, '').trim();
          if (clean.length >= 2) foreshadowKeywords.add(clean.slice(0, 12));
        }
      }
    }
    const triggerPattern = /(收尾|变脸|反转|才揭示|才回收|揭破|在收尾)/;
    const foreshadowTriggers = [...foreshadowKeywords].flatMap(k => {
      const trigs: string[] = [];
      for (let i = 0; i + 3 <= k.length; i++) trigs.push(k.slice(i, i + 3));
      return trigs;
    });
    const segments = custom.split(/\n+|(?=[0-9]+[）)])/);
    const out: string[] = [];
    for (const seg of segments) {
      const t = seg.trim();
      if (!t) continue;
      const hitForeshadow = foreshadowTriggers.some(f => f.length >= 3 && t.includes(f));
      if (triggerPattern.test(t) || hitForeshadow) {
        const masked = maskForeshadowAnswers(t)
          .replace(/(担保|证明|档案|台账|名单|签名)[^，。；\n（(]{0,20}?[“「]?[沈贺郭周宁简石殷覃祝陶龙韦莫][^”」，。；\n（)]{0,8}/g, '$1（署名锁定在收尾揭示）');
        out.push(`【收尾锁定，正文只留线索】${masked.slice(0, 160)}`);
      } else {
        out.push(t);
      }
    }
    return out.join('\n');
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
  private worldGroups(fields: readonly string[]) { const groups: Record<string,string[]> = { synopsis:['synopsis'],basic_info:['basic_info'],era:['era'],locations:['locations'],atmosphere_tone:['atmosphere_tone'],rules:['rules'],social_structure:['social_structure'],economy_system:['economy_system'],tech_supernatural:['tech_supernatural'],system_mechanics:['system_mechanics'],culture_customs:['culture_customs'],naming_rules:['naming_rules'],factions:['factions'],scale_plan:['scale_plan'],ending:['ending'],hierarchy_rules:['hierarchy_rules'],supplementary:['supplementary'],custom_settings:['custom_settings'] }; return Object.entries(groups).filter(([, keys]) => keys.some(key => fields.includes(key))).map(([group]) => group); }

  update(id: string, dto: UpdateWorldSettingDto): WorldSettingResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`WorldSetting ${id} not found`);
    this.assertWorldMutable(existing.project_id, '修改世界观资料');

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
    this.analyzeStateImpact(existing.project_id, id, '创建阶段世界观资料补齐影响分析', {
      before: this.toResponse(existing),
      after: dto,
      priority: 'world_setting',
    });
    return response;
  }

  /**
   * 保留差异扫描给作者诊断，但项目离开 creating 后只允许“看影响”，不再提供可执行修改路径。
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
      if (oldValue !== String(newValue)) changes.push({ field, oldValue, newValue: String(newValue) });
    }

    const db = this.databaseService.getDb();
    const affectedContent: string[] = [];
    for (const change of changes) {
      const oldVal = change.oldValue.trim();
      if (!oldVal) continue;
      const chapters = db.prepare('SELECT chapter_index, title, content FROM chapters WHERE project_id = ? AND content LIKE ?').all(projectId, `%${oldVal}%`) as any[];
      for (const ch of chapters) affectedContent.push(`第${ch.chapter_index}章${ch.title ? `《${ch.title}》` : ''}：正文引用了“${oldVal}”`);
      const fores = db.prepare('SELECT chapter_index, description FROM foreshadowings WHERE project_id = ? AND description LIKE ?').all(projectId, `%${oldVal}%`) as any[];
      for (const f of fores) affectedContent.push(`第${f.chapter_index ?? '?'}章伏笔：引用了“${oldVal}”`);
    }
    const uniqueAffected = [...new Set(affectedContent)];

    const status = String((db.prepare('SELECT status FROM projects WHERE id=?').get(projectId) as any)?.status || '');
    let severity: 'low' | 'medium' | 'high' = uniqueAffected.length > 3 || changes.length > 3 ? 'high' : changes.length > 1 || uniqueAffected.length ? 'medium' : 'low';
    const frozen = status !== 'creating';
    if (frozen && changes.length) severity = 'high';

    const suggestions: string[] = [];
    if (frozen && changes.length) {
      suggestions.push('世界观已经冻结，此方案仅用于识别冲突来源，不允许执行世界观修改。');
      suggestions.push('请改动影响范围最小的未来章纲、伏笔、时间线、状态或未接受正文，把剧情圆回现有世界观。');
    } else if (changes.length > 0) {
      suggestions.push('项目仍在创建阶段，应在激活前完成世界观定稿；激活后该世界观将永久冻结。');
    }
    if (uniqueAffected.length > 0) suggestions.push(`检测到 ${uniqueAffected.length} 处依赖：${uniqueAffected.slice(0, 3).join('；')}${uniqueAffected.length > 3 ? '…' : ''}`);
    if (suggestions.length === 0) suggestions.push('没有实际差异。');

    return {
      changes,
      impactAnalysis: [{ affectedContent: uniqueAffected.length ? uniqueAffected : ['暂无已检测到的受影响内容'], severity }],
      suggestions,
      requiresConfirmation: frozen || uniqueAffected.length > 0,
    };
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`WorldSetting ${id} not found`);
    this.assertWorldMutable(existing.project_id, '删除世界观');
    const before = this.toResponse(existing);
    const db = this.databaseService.getDb();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM world_system_profiles WHERE project_id=? AND world_setting_id=?')
        .run(existing.project_id, id);
      this.repo.delete(id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    this.analyzeStateImpact(existing.project_id, id, '创建阶段世界观删除影响分析', {
      operation: 'remove', before, priority: 'world_setting', needsReview: true,
    });
    return { success: true };
  }

  addConstraint(id: string, dto: AddConstraintDto): WorldSettingResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`WorldSetting ${id} not found`);
    this.assertWorldMutable(existing.project_id, '添加世界观约束');
    const constraint = { id: uuid(), ...dto, appliesTo: [] };
    const row = this.repo.addConstraint(id, constraint);
    if (!row) throw new NotFoundException(`WorldSetting ${id} not found`);
    const response = this.toResponse(row);
    this.analyzeStateImpact(existing.project_id, id, '创建阶段世界观约束添加影响分析', {
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
    this.assertWorldMutable(existing.project_id, '删除世界观约束');
    const row = this.repo.removeConstraint(id, constraintId);
    if (!row) throw new NotFoundException(`WorldSetting ${id} not found`);
    const response = this.toResponse(row);
    this.analyzeStateImpact(existing.project_id, id, '创建阶段世界观约束删除影响分析', {
      before: this.toResponse(existing),
      after: { constraints: row.constraints },
      constraintChange: `remove_constraint: ${constraintId}`,
      priority: 'world_setting',
    });
    return response;
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
      culturalSettings: row.cultural_settings || undefined,
      spoilerSettings: row.spoiler_settings || undefined,
      censorshipRules: row.censorship_rules || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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
