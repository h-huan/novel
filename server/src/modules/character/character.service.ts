/**
 * 角色 Service
 */

/** 安全 JSON 解析：解析失败时返回 fallback，不抛异常 */
function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { CharacterRepository } from '../../database/repositories/character.repository';
import { CharacterStateRepository } from '../../database/repositories/character-state.repository';
import type { CharacterRow } from '../../database/repositories/character.repository';
import type { CreateCharacterDto, AddRelationshipDto } from './dto/character.dto';
import { StateItemService } from '../../state/state-item.service';
import { DatabaseService } from '../../database/database.service';

// 对齐外部文档《人物模板》14 项（姓名已在 characters 主表，此处为其余 13 项）
export const PROFILE_FIELDS = ['alias_title','identity_occupation','faction_stance','role_type','appearance','personality_traits','abilities_skills','backstory','relationships','catchphrase_speech_style','goals_motivation','weaknesses_fears','supplementary'] as const;

export const PROFILE_FIELD_LABELS: Record<string, string> = {
  alias_title: '别名/称号', identity_occupation: '身份/职业', faction_stance: '阵营/立场', role_type: '角色类型',
  appearance: '外貌特征', personality_traits: '性格特点', abilities_skills: '能力/技能', backstory: '背景故事',
  relationships: '人物关系', catchphrase_speech_style: '口头禅/说话风格', goals_motivation: '目标/动机',
  weaknesses_fears: '弱点/恐惧', supplementary: '补充说明',
};

export interface CharacterResponse {
  id: string;
  projectId: string;
  name: string;
  aliases?: string[];
  age?: number;
  gender?: string;
  identity?: string;
  appearance?: string;
  background?: string;
  personality: any;
  abilities: any;
  relationships: any[];
  arc: any[];
  dialogueStyle?: string;
  dialoguePatterns?: string[];
  isPovCharacter: boolean;
  role: string;
  faction?: string;
  goals?: string;
  weaknesses?: string;
  wound?: string;
  keywords?: string;
  // 新增字段 (migration 042)
  notes?: string;
  growthStages?: string;
  coreConflictRole?: string;
  /** 统一详细档案: motivation/personality_detail/weaknesses_detail/abilities_detail/background_detail/dialogue_detail/arc_detail/writing_rules */
  profile?: Record<string, unknown>;
  latestState?: any;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class CharacterService {
  constructor(
    private readonly repo: CharacterRepository,
    private readonly stateRepo: CharacterStateRepository,
    private readonly databaseService: DatabaseService,
    @Optional() private readonly stateItemService?: StateItemService,
  ) {}

  create(projectId: string, dto: CreateCharacterDto): CharacterResponse {
    const now = new Date().toISOString();
    const id = uuid();

    const personality = dto.personality || {
      extraversion: 50, agreeableness: 50, conscientiousness: 50,
      neuroticism: 50, openness: 50,
    };

    this.repo.insert({
      id,
      project_id: projectId,
      name: dto.name,
      aliases: JSON.stringify(dto.aliases || []),
      age: dto.age || null,
      gender: dto.gender || null,
      identity: dto.identity || null,
      appearance: dto.appearance || null,
      background: dto.background || null,
      personality: JSON.stringify(personality),
      abilities: '{}',
      relationships: '[]',
      arc: '[]',
      dialogue_style: dto.dialogueStyle || null,
      dialogue_patterns: JSON.stringify(dto.dialoguePatterns || []),
      is_pov_character: dto.isPovCharacter ? 1 : 0,
      role: dto.role || 'supporting',
      faction: dto.faction || '',
      goals: dto.goals || '',
      weaknesses: dto.weaknesses || '',
      wound: dto.wound || '',
      keywords: dto.keywords || '',
      notes: dto.notes || null,
      growth_stages_json: dto.growthStages || null,
      core_conflict_role: dto.coreConflictRole || null,
      profile_json: dto.profile ? (typeof dto.profile === 'string' ? dto.profile : JSON.stringify(dto.profile)) : '{}',
      created_at: now,
      updated_at: now,
    });

    return this.toResponse(this.repo.findById(id)!);
  }

  findByProjectId(projectId: string): CharacterResponse[] {
    return this.repo.findByProjectId(projectId).map((r) => this.toResponse(r));
  }

  findOne(id: string): CharacterResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`Character ${id} not found`);
    return this.toResponse(row);
  }

  update(id: string, dto: Partial<CreateCharacterDto> & { abilities?: any; arc?: any }): CharacterResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Character ${id} not found`);

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updated_at: now };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.aliases !== undefined) updateData.aliases = JSON.stringify(dto.aliases);
    if (dto.age !== undefined) updateData.age = dto.age;
    if (dto.gender !== undefined) updateData.gender = dto.gender;
    if (dto.identity !== undefined) updateData.identity = dto.identity;
    if (dto.appearance !== undefined) updateData.appearance = dto.appearance;
    if (dto.background !== undefined) updateData.background = dto.background;
    if (dto.personality) updateData.personality = JSON.stringify(dto.personality);
    if (dto.dialogueStyle !== undefined) updateData.dialogue_style = dto.dialogueStyle;
    if (dto.dialoguePatterns) updateData.dialogue_patterns = JSON.stringify(dto.dialoguePatterns);
    if (dto.isPovCharacter !== undefined) updateData.is_pov_character = dto.isPovCharacter ? 1 : 0;
    if (dto.role !== undefined) updateData.role = dto.role;
    if (dto.faction !== undefined) updateData.faction = dto.faction;
    if (dto.goals !== undefined) updateData.goals = dto.goals;
    if (dto.weaknesses !== undefined) updateData.weaknesses = dto.weaknesses;
    if (dto.wound !== undefined) updateData.wound = dto.wound;
    if (dto.keywords !== undefined) updateData.keywords = dto.keywords;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.growthStages !== undefined) updateData.growth_stages_json = dto.growthStages;
    if (dto.coreConflictRole !== undefined) updateData.core_conflict_role = dto.coreConflictRole;
    if (dto.profile !== undefined) updateData.profile_json = typeof dto.profile === 'string' ? dto.profile : JSON.stringify(dto.profile);
    if (dto.abilities !== undefined) updateData.abilities = typeof dto.abilities === 'string' ? dto.abilities : JSON.stringify(dto.abilities);
    if (dto.arc !== undefined) updateData.arc = typeof dto.arc === 'string' ? dto.arc : JSON.stringify(dto.arc);

    this.repo.update(id, updateData);
    const response = this.toResponse(this.repo.findById(id)!);
    this.analyzeStateImpact(existing.project_id, id, '人物资料修改影响分析', {
      before: this.toResponse(existing),
      after: dto,
      priority: 'character',
    });
    return response;
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Character ${id} not found`);
    const before = this.toResponse(existing);
    this.repo.delete(id);
    this.analyzeStateImpact(existing.project_id, id, '人物删除影响分析', {
      operation: 'remove', before, priority: 'character', needsReview: true,
    });
    return { success: true };
  }

  addRelationship(id: string, dto: AddRelationshipDto): CharacterResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Character ${id} not found`);
    const relationship = { ...dto, history: [] };
    const row = this.repo.addRelationship(id, relationship);
    if (!row) throw new NotFoundException(`Character ${id} not found`);
    const response = this.toResponse(row);
    this.analyzeStateImpact(existing.project_id, id, '人物关系添加影响分析', {
      before: this.toResponse(existing),
      after: { relationships: row.relationships },
      relationChange: `add_relationship: ${dto.targetCharacterId || (dto as any).type || 'unknown'}`,
      priority: 'character',
    });
    return response;
  }

  removeRelationship(id: string, targetId: string): CharacterResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Character ${id} not found`);
    const row = this.repo.removeRelationship(id, targetId);
    if (!row) throw new NotFoundException(`Character ${id} not found`);
    const response = this.toResponse(row);
    this.analyzeStateImpact(existing.project_id, id, '人物关系删除影响分析', {
      before: this.toResponse(existing),
      after: { relationships: row.relationships },
      relationChange: `remove_relationship: ${targetId}`,
      priority: 'character',
    });
    return response;
  }

  /** 获取项目完整人物关系网络（来自 character_relationships 表） */
  getProjectRelationships(projectId: string): { network: any[] } {
    const db = (this as any).databaseService?.getDb() || (this as any).db?.getDb?.();
    if (!db) return { network: [] };
    try {
      const rows = db.prepare(`
        SELECT cr.*, sc.name AS source_name, tc.name AS target_name
        FROM character_relationships cr
        JOIN characters sc ON sc.id = cr.source_character_id
        JOIN characters tc ON tc.id = cr.target_character_id
        WHERE cr.project_id = ?
      `).all(projectId) as any[];
      return { network: rows || [] };
    } catch { return { network: [] }; }
  }

  getLatestState(id: string): any {
    const state = this.stateRepo.getLatestState(id);
    if (!state) return null;
    return {
      id: state.id,
      characterId: state.character_id,
      chapterId: state.chapter_id,
      timestamp: state.timestamp,
      order: state.snapshot_order,
      states: JSON.parse(state.states_json),
      changedDimensions: state.changed_dimensions ? JSON.parse(state.changed_dimensions) : [],
      confidence: state.confidence,
      needsReview: state.needs_review === 1,
    };
  }

  getStateHistory(id: string): any[] {
    return this.stateRepo.getStateHistory(id).map((s) => ({
      id: s.id,
      timestamp: s.timestamp,
      order: s.snapshot_order,
      states: JSON.parse(s.states_json),
      changedDimensions: s.changed_dimensions ? JSON.parse(s.changed_dimensions) : [],
    }));
  }

  search(projectId: string, query: string): CharacterResponse[] {
    return this.repo.search(projectId, query).map((r) => this.toResponse(r));
  }

  getProfile(projectId: string, id: string) {
    const character = this.findOne(id);
    if (character.projectId !== projectId) throw new NotFoundException(`Character ${id} not found`);
    const db = this.databaseService.getDb();
    const profile = db.prepare('SELECT * FROM character_extended_profiles WHERE project_id = ? AND character_id = ?').get(projectId, id) as any;
    const stateContext = this.stateItemService?.buildWritingStateContext(projectId);

    // 合并 extended profile 到 characters.profile_json，保持单表查询可用
    const profileData = this.profileRow(profile);
    const unifiedProfile = {
      motivation: {
        shortTermGoal: profileData.short_term_goal,
        longTermGoal: profileData.long_term_goal,
        coreDesire: profileData.core_desire,
        coreFear: profileData.core_fear,
        currentProblem: profileData.current_problem,
        failureCost: profileData.failure_cost,
      },
      backgroundDetail: {
        keyBackstory: profileData.key_backstory,
        trauma: profileData.trauma,
        obsession: profileData.obsession,
        hiddenIdentity: profileData.hidden_identity,
        secret: profileData.secret,
        mainTruthRelation: profileData.main_truth_relation,
      },
      abilitiesDetail: {
        source: profileData.ability_source,
        level: profileData.ability_level,
        specialSkills: profileData.special_skills,
        limit: profileData.ability_limit,
        cost: profileData.ability_cost,
        cannotUseReason: profileData.cannot_use_reason,
      },
      weaknessesDetail: {
        body: profileData.body_weakness,
        personality: profileData.personality_weakness,
        emotion: profileData.emotion_weakness,
        moralBoundary: profileData.moral_boundary,
      },
      personalityDetail: {
        surface: profileData.surface_personality,
        deep: profileData.deep_personality,
        contradiction: profileData.contradiction_point,
        values: profileData.value_system,
      },
      dialogueDetail: {
        speechStyle: profileData.speech_style,
        catchphrase: profileData.catchphrase,
        commonWords: profileData.common_words,
        forbiddenWords: profileData.forbidden_words,
        dangerReaction: profileData.danger_reaction,
        betrayalReaction: profileData.betrayal_reaction,
      },
      arcDetail: {
        initial: profileData.initial_arc_state,
        current: profileData.current_arc_state,
        volume: profileData.volume_arc,
        ending: profileData.ending_arc,
      },
      plotFunction: {
        plot: profileData.plot_function,
      },
      writingRules: {
        forbidden: profileData.forbidden_writing,
        breakPoints: profileData.easy_to_break_points,
      },
    };

    // 同步回 characters 表
    try {
      db.prepare(`UPDATE characters SET profile_json = ? WHERE id = ?`)
        .run(JSON.stringify(unifiedProfile), id);
    } catch {}

    return {
      character: { ...character, profile: unifiedProfile },
      profile: profileData,
      currentState: this.getLatestState(id),
      warnings: stateContext?.pendingSummary || [],
      relationships: character.relationships,
    };
  }

  updateProfile(projectId: string, id: string, input: Record<string, unknown>) {
    const character = this.findOne(id);
    if (character.projectId !== projectId) throw new NotFoundException(`Character ${id} not found`);
    const db = this.databaseService.getDb();
    const now = new Date().toISOString();
    const before = db.prepare('SELECT * FROM character_extended_profiles WHERE character_id = ?').get(id) as any;
    const values = PROFILE_FIELDS.map(field => String(input[field] ?? before?.[field] ?? ''));
    db.prepare(`INSERT INTO character_extended_profiles (id, project_id, character_id, ${PROFILE_FIELDS.join(', ')}, created_at, updated_at)
      VALUES (?, ?, ?, ${PROFILE_FIELDS.map(() => '?').join(', ')}, ?, ?)
      ON CONFLICT(character_id) DO UPDATE SET ${PROFILE_FIELDS.map(field => `${field}=excluded.${field}`).join(', ')}, updated_at=excluded.updated_at`)
      .run(before?.id || uuid(), projectId, id, ...values, before?.created_at || now, now);
    const changed = PROFILE_FIELDS.filter(field => String(before?.[field] ?? '') !== String(input[field] ?? before?.[field] ?? ''));
    if (changed.length) this.recordAutoProfileChanges(projectId, id, before ?? {}, input);
    if (changed.length) {
      const groups = {
        motivation: ['short_term_goal', 'long_term_goal', 'core_desire'], ability: ['ability_limit', 'ability_cost', 'cannot_use_reason'],
        dialogue: ['speech_style', 'catchphrase', 'forbidden_words'], arc: ['current_arc_state', 'volume_arc', 'ending_arc'],
        constraints: ['forbidden_writing', 'must_obey_rules', 'easy_to_break_points'],
      };
      const changedGroups = Object.entries(groups).filter(([, fields]) => fields.some(field => changed.includes(field as any))).map(([group]) => group);
      const affectedModules = [...new Set(changedGroups.flatMap(group => group === 'motivation' ? ['chapter', 'outline', 'conflict'] : group === 'ability' ? ['chapter', 'conflict', 'writing_quality'] : group === 'dialogue' ? ['chapter', 'dialogue_quality'] : group === 'arc' ? ['chapter', 'character_state', 'outline'] : ['chapter', 'writing_context', 'writing_quality']))];
      this.analyzeStateImpact(projectId, id, '角色创作资料修改影响分析', { changedFields: changed, changedGroups, riskReason: '核心角色设定已变化，后续正文与质量检查上下文需要复核。', affectedModules, suggestedReviewAction: '在状态中心查看影响报告，并复核关联章节和对话。', before: this.profileRow(before), after: input, affects: affectedModules });
    }
    return this.getProfile(projectId, id);
  }

  getWritingSummary(projectId: string, id: string): { summary: string; sections: Record<string, Record<string, string>>; profile: any } {
    const data = this.getProfile(projectId, id);
    const p = data.profile;
    const c = data.character;

    // 按《人物模板》14 项分组（姓名在主表，此处 13 项），只保留非空字段，避免满屏"待补全"
    const sectionDefs = [
      { title: '基本信息', fields: ['alias_title','identity_occupation','faction_stance','role_type'], labels: { alias_title:'别名/称号', identity_occupation:'身份/职业', faction_stance:'阵营/立场', role_type:'角色类型' } },
      { title: '外貌与性格', fields: ['appearance','personality_traits'], labels: { appearance:'外貌特征', personality_traits:'性格特点' } },
      { title: '能力与背景', fields: ['abilities_skills','backstory'], labels: { abilities_skills:'能力/技能', backstory:'背景故事' } },
      { title: '关系与目标', fields: ['relationships','goals_motivation'], labels: { relationships:'人物关系', goals_motivation:'目标/动机' } },
      { title: '弱点与语言', fields: ['weaknesses_fears','catchphrase_speech_style'], labels: { weaknesses_fears:'弱点/恐惧', catchphrase_speech_style:'口头禅/说话风格' } },
      { title: '补充说明', fields: ['supplementary'], labels: { supplementary:'补充说明' } },
    ];
    const profile = p as Record<string, any>;
    const sections: Record<string, Record<string, string>> = {};
    for (const def of sectionDefs) {
      const entries: Record<string, string> = {};
      const labels = def.labels as unknown as Record<string, string>;
      for (const field of def.fields) {
        const v = profile[field];
        if (typeof v === 'string' && v.trim()) entries[labels[field]] = v.trim();
      }
      if (Object.keys(entries).length) sections[def.title] = entries;
    }

    // 顶部速览：只取最关键的非空字段，合并基础信息与 profile
    const narrativeParts = [
      c.name && `姓名：${c.name}`,
      p.identity_occupation && `身份职业：${p.identity_occupation}`,
      p.role_type && `角色类型：${p.role_type}`,
      p.faction_stance && `阵营立场：${p.faction_stance}`,
      p.goals_motivation && `目标动机：${p.goals_motivation}`,
      p.personality_traits && `性格：${p.personality_traits}`,
      p.appearance && `外貌：${p.appearance}`,
      p.backstory && `背景：${p.backstory}`,
      p.abilities_skills && `能力技能：${p.abilities_skills}`,
      p.catchphrase_speech_style && `说话风格：${p.catchphrase_speech_style}`,
      p.weaknesses_fears && `弱点恐惧：${p.weaknesses_fears}`,
    ].filter(Boolean);
    const summary = narrativeParts.length
      ? `【角色速览】${narrativeParts.join('；')}。`
      : '角色资料较简略，建议补充目标、矛盾与背景后再生成写作摘要。';

    return { summary, sections, profile: p };
  }

  /** 角色字段级变动历史 */
  listProfileChanges(projectId: string, characterId: string): any[] {
    const db = this.databaseService.getDb();
    return db.prepare(
      `SELECT * FROM character_profile_changes WHERE project_id = ? AND character_id = ? ORDER BY created_at DESC, rowid DESC`,
    ).all(projectId, characterId) as any[];
  }

  createProfileChange(projectId: string, characterId: string, input: {
    fieldKey: string; fieldLabel?: string; beforeValue?: string; afterValue?: string; chapterIndex?: number; reason?: string;
  }): any {
    const db = this.databaseService.getDb();
    const now = new Date().toISOString();
    const id = uuid();
    db.prepare(`INSERT INTO character_profile_changes (id, project_id, character_id, field_key, field_label, before_value, after_value, chapter_index, reason, source, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'manual',?,?)`)
      .run(id, projectId, characterId, input.fieldKey, input.fieldLabel || input.fieldKey, input.beforeValue || '', input.afterValue || '',
        input.chapterIndex ?? null, input.reason || '', now, now);
    return db.prepare(`SELECT * FROM character_profile_changes WHERE id = ?`).get(id);
  }

  updateProfileChange(projectId: string, characterId: string, id: string, patch: { chapterIndex?: number; reason?: string; afterValue?: string }): any {
    const db = this.databaseService.getDb();
    const row = db.prepare(`SELECT * FROM character_profile_changes WHERE id = ? AND project_id = ? AND character_id = ?`).get(id, projectId, characterId) as any;
    if (!row) throw new NotFoundException('变动记录不存在');
    db.prepare(`UPDATE character_profile_changes SET chapter_index = ?, reason = ?, after_value = ?, updated_at = ? WHERE id = ?`)
      .run(patch.chapterIndex ?? row.chapter_index ?? null, patch.reason ?? row.reason ?? '', patch.afterValue ?? row.after_value ?? '', new Date().toISOString(), id);
    return db.prepare(`SELECT * FROM character_profile_changes WHERE id = ?`).get(id);
  }

  deleteProfileChange(projectId: string, characterId: string, id: string): void {
    const db = this.databaseService.getDb();
    db.prepare(`DELETE FROM character_profile_changes WHERE id = ? AND project_id = ? AND character_id = ?`).run(id, projectId, characterId);
  }

  /** 自动记录：对比 before/after 的 PROFILE_FIELDS 差异，逐个写一条 auto 记录 */
  recordAutoProfileChanges(projectId: string, characterId: string, before: Record<string, unknown>, after: Record<string, unknown>): number {
    let count = 0;
    for (const field of PROFILE_FIELDS) {
      const b = String(before[field] ?? '');
      const a = String(after[field] ?? '');
      if (b !== a && (a || b)) {
        this.createProfileChange(projectId, characterId, {
          fieldKey: field,
          fieldLabel: PROFILE_FIELD_LABELS[field] || field,
          beforeValue: b, afterValue: a, reason: '',
        });
        count++;
      }
    }
    return count;
  }

  checkConsistency(projectId: string, content: string) {
    const issues: any[] = [];
    for (const character of this.findByProjectId(projectId)) {
      const profile = this.getProfile(projectId, character.id).profile;
      const evidence = content.includes(character.name) ? character.name : '';
      if (!evidence) continue;
      const add = (issueType: string, evidence: string, reason: string, suggestion: string, severity: 'low' | 'medium' | 'high') => issues.push({ characterId: character.id, characterName: character.name, issueType, evidence, reason, suggestion, severity });
      if (profile.weaknesses_fears && /无敌|毫无弱点|永远胜利|从不出错/.test(content) && !content.includes(profile.weaknesses_fears)) add('weaknesses_fears', profile.weaknesses_fears, '正文把角色写成无弱点，违背角色设定', `回扣弱点/恐惧：${profile.weaknesses_fears}`, 'medium');
      if (profile.goals_motivation && /毫无理由|无缘无故|突然背叛|莫名其妙/.test(content)) add('goals_motivation', profile.goals_motivation, '正文出现缺少动机的行动信号', `回扣目标/动机：${profile.goals_motivation}`, 'medium');
      if (profile.faction_stance && /倒戈|叛变|投敌|易主/.test(content) && !content.includes(profile.faction_stance)) add('faction_stance', profile.faction_stance, '正文可能无铺垫改变阵营立场', `补充立场转变的铺垫：${profile.faction_stance}`, 'high');
      if (profile.role_type === '主角' && /死亡|牺牲|下线/.test(content) && !content.includes('假死') && !content.includes('幸存')) add('role_type', profile.role_type, '主角可能在中段非正常退场', '确认是否符合整体规划', 'low');
    }
    return { passed: issues.length === 0, score: Math.max(0, 100 - issues.length * 25), issues };
  }

  private profileRow(row: any) { return Object.fromEntries(PROFILE_FIELDS.map(field => [field, row?.[field] || ''])); }

  private toResponse(row: CharacterRow): CharacterResponse {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      aliases: row.aliases ? JSON.parse(row.aliases) : [],
      age: row.age || undefined,
      gender: row.gender || undefined,
      identity: row.identity || undefined,
      appearance: row.appearance || undefined,
      background: row.background || undefined,
      personality: safeJsonParse(row.personality, { summary: '' }),
      abilities: safeJsonParse(row.abilities, {}),
      relationships: safeJsonParse(row.relationships, []),
      arc: safeJsonParse(row.arc, row.arc ? [String(row.arc)] : []),
      dialogueStyle: row.dialogue_style || undefined,
      dialoguePatterns: safeJsonParse(row.dialogue_patterns, []),
      isPovCharacter: row.is_pov_character === 1,
      role: row.role || 'supporting',
      faction: row.faction || undefined,
      goals: row.goals || undefined,
      weaknesses: row.weaknesses || undefined,
      wound: row.wound || undefined,
      keywords: row.keywords || undefined,
      // 新增字段 (migration 042)
      notes: row.notes || undefined,
      growthStages: row.growth_stages_json || undefined,
      coreConflictRole: row.core_conflict_role || undefined,
      profile: row.profile_json ? (() => { try { return JSON.parse(row.profile_json); } catch { return {}; } })() : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private analyzeStateImpact(projectId: string, id: string, summary: string, payload: Record<string, unknown>) {
    if (!this.stateItemService) return;
    this.stateItemService.analyzeImpactTracked(projectId, {
        targetType: 'character',
        targetId: id,
        summary,
        payload: { ...payload, priority: 'character', affects: ['outline', 'volume', 'chapter_plan', 'chapter'] },
    });
  }
}
