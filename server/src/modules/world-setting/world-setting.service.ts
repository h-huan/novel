/**
 * 世界观 Setting Service
 */
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { WorldSettingRepository } from '../../database/repositories/world-setting.repository';
import type { WorldSettingRow } from '../../database/repositories/world-setting.repository';
import type { CreateWorldSettingDto, UpdateWorldSettingDto, AddConstraintDto } from './dto/world-setting.dto';
import { StateItemService } from '../../state/state-item.service';

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
