/**
 * 角色 Service
 */
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { CharacterRepository } from '../../database/repositories/character.repository';
import { CharacterStateRepository } from '../../database/repositories/character-state.repository';
import type { CharacterRow } from '../../database/repositories/character.repository';
import type { CreateCharacterDto, AddRelationshipDto } from './dto/character.dto';
import { StateItemService } from '../../state/state-item.service';
import { DatabaseService } from '../../database/database.service';

const PROFILE_FIELDS = ['appearance_memory_points','signature_item','action_habits','clothing_style','short_term_goal','long_term_goal','core_desire','core_fear','current_problem','failure_cost','key_backstory','trauma','obsession','hidden_identity','secret','main_truth_relation','ability_source','ability_level','special_skills','ability_limit','ability_cost','growth_route','cannot_use_reason','body_weakness','personality_weakness','emotion_weakness','relationship_weakness','moral_boundary','exploitable_point','surface_personality','deep_personality','contradiction_point','value_system','speech_style','catchphrase','common_words','forbidden_words','tone_to_different_people','emotion_outburst_style','danger_reaction','temptation_reaction','betrayal_reaction','weak_person_reaction','strong_person_reaction','principle_break_condition','plot_function','conflict_function','reversal_function','foreshadowing_function','reader_empathy_point','reader_expectation','initial_arc_state','current_arc_state','volume_arc','midpoint_arc','ending_arc','must_obey_rules','can_change_rules','forbidden_writing','easy_to_break_points','current_chapter_usage'] as const;

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
    if (dto.abilities !== undefined) updateData.abilities = typeof dto.abilities === 'string' ? dto.abilities : JSON.stringify(dto.abilities);
    if (dto.arc !== undefined) updateData.arc = typeof dto.arc === 'string' ? dto.arc : JSON.stringify(dto.arc);

    this.repo.update(id, updateData);
    const response = this.toResponse(this.repo.findById(id)!);
    this.analyzeStateImpact(existing.project_id, id, '人物资料修改影响分析', {
      before: {
        name: existing.name,
        identity: existing.identity,
        appearance: existing.appearance,
        background: existing.background,
        personality: existing.personality,
        relationships: existing.relationships,
      },
      after: dto,
      priority: 'character',
    });
    return response;
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Character ${id} not found`);
    this.repo.delete(id);
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
      before: { relationships: existing.relationships },
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
      before: { relationships: existing.relationships },
      after: { relationships: row.relationships },
      relationChange: `remove_relationship: ${targetId}`,
      priority: 'character',
    });
    return response;
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
    return { character, profile: this.profileRow(profile), currentState: this.getLatestState(id), warnings: stateContext?.pendingSummary || [], relationships: character.relationships };
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

  getWritingSummary(projectId: string, id: string): { summary: string; profile: any } {
    const data = this.getProfile(projectId, id);
    const p = data.profile;
    const lines = [
      '【角色写作摘要】', `姓名：${data.character.name}`, `当前身份：${data.character.identity || '待补全'}`,
      `当前目标：${p.short_term_goal || '待补全'}`, `长期目标：${p.long_term_goal || '待补全'}`, `核心欲望：${p.core_desire || '待补全'}`, `底层恐惧：${p.core_fear || '待补全'}`, `当前难题：${p.current_problem || '待补全'}`, `失败代价：${p.failure_cost || '待补全'}`,
      `背景秘密：${[p.key_backstory, p.trauma, p.obsession, p.hidden_identity, p.secret, p.main_truth_relation].filter(Boolean).join('；') || '待补全'}`,
      `能力来源：${p.ability_source || '待补全'}`, `能力等级：${p.ability_level || '待补全'}`, `特殊技能：${p.special_skills || '待补全'}`, `能力限制：${p.ability_limit || '待补全'}`, `能力代价：${p.ability_cost || '待补全'}`,
      `身体弱点：${p.body_weakness || '待补全'}`, `性格弱点：${p.personality_weakness || '待补全'}`, `情感弱点：${p.emotion_weakness || '待补全'}`, `道德边界：${p.moral_boundary || '待补全'}`,
      `表层性格：${p.surface_personality || '待补全'}`, `深层性格：${p.deep_personality || '待补全'}`, `性格矛盾：${p.contradiction_point || '待补全'}`, `价值系统：${p.value_system || '待补全'}`,
      `说话风格：${p.speech_style || data.character.dialogueStyle || '待补全'}`, `口头禅：${p.catchphrase || '待补全'}`, `常用词：${p.common_words || '待补全'}`, `禁用词：${p.forbidden_words || '待补全'}`, `危险反应：${p.danger_reaction || '待补全'}`, `背叛反应：${p.betrayal_reaction || '待补全'}`,
      `剧情功能：${p.plot_function || '待补全'}`, `冲突功能：${p.conflict_function || '待补全'}`, `反转功能：${p.reversal_function || '待补全'}`, `伏笔功能：${p.foreshadowing_function || '待补全'}`,
      `初始弧光：${p.initial_arc_state || '待补全'}`, `当前弧光：${p.current_arc_state || '待补全'}`, `卷级弧光：${p.volume_arc || '待补全'}`, `结局弧光：${p.ending_arc || '待补全'}`,
      `必须遵守：${p.must_obey_rules || '待补全'}`, `可以变化：${p.can_change_rules || '待补全'}`, `禁止写法：${p.forbidden_writing || '待补全'}`, `容易写崩的点：${p.easy_to_break_points || '待补全'}`, `本章可用：${p.current_chapter_usage || '待补全'}`,
    ];
    return { summary: lines.join('\n'), profile: p };
  }

  checkConsistency(projectId: string, content: string) {
    const issues: any[] = [];
    for (const character of this.findByProjectId(projectId)) {
      const profile = this.getProfile(projectId, character.id).profile;
      const evidence = content.includes(character.name) ? character.name : '';
      if (!evidence) continue;
      const add = (issueType: string, evidence: string, reason: string, suggestion: string, severity: 'low' | 'medium' | 'high') => issues.push({ characterId: character.id, characterName: character.name, issueType, evidence, reason, suggestion, severity });
      if (profile.forbidden_writing && content.includes(profile.forbidden_writing)) {
        issues.push({ characterId: character.id, characterName: character.name, issueType: 'forbidden_writing', evidence: profile.forbidden_writing, reason: '正文命中了角色禁止写法', suggestion: '重写该段行为或对白以遵守角色约束', severity: 'high' });
      }
      if (profile.forbidden_words && content.includes(profile.forbidden_words)) add('forbidden_words', profile.forbidden_words, '对白命中禁用词', '替换为符合角色语气的表达', 'medium');
      if (profile.easy_to_break_points && content.includes(profile.easy_to_break_points)) add('easy_to_break_points', profile.easy_to_break_points, '正文命中角色易写崩点', '补充动机、过渡或改写行为', 'medium');
      if ((profile.core_desire || profile.short_term_goal) && evidence && /毫无理由|无缘无故|突然背叛/.test(content)) add('motivation', evidence, '正文出现缺少动机的行动信号', `回扣目标或欲望：${profile.short_term_goal || profile.core_desire}`, 'medium');
      if (profile.moral_boundary && /杀害无辜|背叛同伴/.test(content) && !content.includes(profile.moral_boundary)) add('moral_boundary', evidence, '正文可能无铺垫突破道德边界', `补充边界被突破的条件：${profile.moral_boundary}`, 'high');
      if (profile.ending_arc && content.includes(profile.ending_arc)) add('arc_premature', profile.ending_arc, '正文可能提前完成结局弧光', `保留当前弧光：${profile.current_arc_state || '待补全'}`, 'low');
      if (profile.ability_limit && profile.ability_limit.length > 0 && !content.includes(profile.ability_limit) && /轻易|瞬间|毫无代价/.test(content)) {
        issues.push({ characterId: character.id, characterName: character.name, issueType: 'ability_limit', evidence, reason: '正文出现无代价能力表达，但未体现能力限制', suggestion: `补充限制或代价：${profile.ability_limit}`, severity: 'medium' });
      }
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
      personality: JSON.parse(row.personality),
      abilities: JSON.parse(row.abilities),
      relationships: JSON.parse(row.relationships),
      arc: JSON.parse(row.arc),
      dialogueStyle: row.dialogue_style || undefined,
      dialoguePatterns: row.dialogue_patterns ? JSON.parse(row.dialogue_patterns) : [],
      isPovCharacter: row.is_pov_character === 1,
      role: row.role || 'supporting',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private analyzeStateImpact(projectId: string, id: string, summary: string, payload: Record<string, unknown>) {
    if (!this.stateItemService) return;
    try {
      this.stateItemService.analyzeImpact(projectId, {
        targetType: 'character',
        targetId: id,
        summary,
        payload: { ...payload, priority: 'character', affects: ['outline', 'volume', 'chapter_plan', 'chapter'] },
      });
    } catch {
      // 影响分析失败不能阻断人物保存
    }
  }
}
