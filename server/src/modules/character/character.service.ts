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
    const relationship = { ...dto, history: [] };
    const row = this.repo.addRelationship(id, relationship);
    if (!row) throw new NotFoundException(`Character ${id} not found`);
    return this.toResponse(row);
  }

  removeRelationship(id: string, targetId: string): CharacterResponse {
    const row = this.repo.removeRelationship(id, targetId);
    if (!row) throw new NotFoundException(`Character ${id} not found`);
    return this.toResponse(row);
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
