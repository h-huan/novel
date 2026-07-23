/**
 * 地图地点 Service
 */
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { MapPointRepository } from '../../database/repositories/map-point.repository';
import type { MapPointRow } from '../../database/repositories/map-point.repository';
import type { CreateMapPointDto, UpdateMapPointDto } from './dto/map-point.dto';
import type { MapLevel, MapPointType, MapPointTreeNode } from '@novel/shared';
import { DatabaseService } from '../../database/database.service';
import { StateItemService } from '../../state/state-item.service';

const LOCATION_PROFILE_FIELDS = ['location_name','location_alias','location_type','parent_location_id','hierarchy_path','basic_description','visual_features','sound_smell_texture','atmosphere','symbolic_meaning','geography_position','distance_logic','traffic_routes','entry_conditions','exit_conditions','hidden_paths','owner_force','controlling_character','public_identity','secret_identity','security_level','surveillance_level','location_function','plot_function','conflict_function','foreshadowing_function','resource_function','encounter_function','current_status','status_reason','danger_level','forbidden_behaviors','rules_inside','punishment_inside','available_resources','scarce_resources','special_items','trade_value','strategic_value','historical_events','past_disaster','war_memory','lost_truth','secret_buried_here','connected_characters','connected_forces','connected_foreshadowing','connected_chapters','connected_world_rules','scene_hooks','sensory_anchor','first_arrival_impression','revisit_changes','climax_usage','must_obey_rules','can_change_rules','forbidden_writing','easy_to_break_points','current_chapter_usage'] as const;

export interface MapPointResponse {
  id: string;
  projectId: string;
  name: string;
  type: MapPointType;
  description: string;
  parentId: string | null;
  level: MapLevel;
  coordinates?: string;
  linkedChapterIds: string[];
  linkedCharacterIds: string[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class MapPointService {
  constructor(private readonly repo: MapPointRepository, private readonly databaseService: DatabaseService, @Optional() private readonly stateItemService?: StateItemService) {}

  getProfile(projectId: string, id: string) {
    const mapPoint = this.findOne(id); if (mapPoint.projectId !== projectId) throw new NotFoundException('Map point not found');
    const db = this.databaseService.getDb(); const row = db.prepare('SELECT * FROM location_knowledge_profiles WHERE project_id = ? AND map_point_id = ?').get(projectId, id) as any;
    const relations = this.getRelations(projectId, id);
    return { mapPoint, profile: this.profileRow(row, mapPoint), relations, relatedLocations: relations, warnings: [], connectedCharacters: this.listValue(row?.connected_characters), connectedForces: this.listValue(row?.connected_forces), connectedForeshadowing: this.listValue(row?.connected_foreshadowing), connectedChapters: this.listValue(row?.connected_chapters) };
  }

  updateProfile(projectId: string, id: string, input: Record<string, unknown>) {
    const before = this.getProfile(projectId, id).profile; const db = this.databaseService.getDb(); const now = new Date().toISOString();
    const values = LOCATION_PROFILE_FIELDS.map(key => String(input[key] ?? before[key] ?? ''));
    db.prepare(`INSERT INTO location_knowledge_profiles (id,project_id,map_point_id,${LOCATION_PROFILE_FIELDS.join(',')},created_at,updated_at) VALUES (?,?,?,${LOCATION_PROFILE_FIELDS.map(() => '?').join(',')},?,?) ON CONFLICT(map_point_id) DO UPDATE SET ${LOCATION_PROFILE_FIELDS.map(key => `${key}=excluded.${key}`).join(',')},updated_at=excluded.updated_at`).run((db.prepare('SELECT id FROM location_knowledge_profiles WHERE map_point_id = ?').get(id) as any)?.id || uuid(), projectId, id, ...values, now, now);
    const changedFields = LOCATION_PROFILE_FIELDS.filter(key => String(before[key] || '') !== String(input[key] ?? before[key] ?? ''));
    if (changedFields.length) this.analyzeImpact(projectId, id, changedFields, before, this.getProfile(projectId, id).profile);
    return this.getProfile(projectId, id);
  }

  getRelations(projectId: string, id: string) { return this.databaseService.getDb().prepare('SELECT * FROM location_knowledge_relations WHERE project_id = ? AND source_location_id = ? ORDER BY created_at').all(projectId, id) as any[]; }
  updateRelations(projectId: string, id: string, relations: any[]) {
    const before = this.getRelations(projectId, id);
    const db = this.databaseService.getDb(); const now = new Date().toISOString(); db.prepare('DELETE FROM location_knowledge_relations WHERE project_id = ? AND source_location_id = ?').run(projectId, id);
    for (const relation of Array.isArray(relations) ? relations : []) db.prepare('INSERT INTO location_knowledge_relations (id,project_id,source_location_id,target_location_id,relation_type,relation_description,distance_cost,travel_time,travel_method,risk_level,access_condition,is_hidden,is_one_way,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(relation.id || uuid(), projectId, id, relation.target_location_id || '', relation.relation_type || 'route_to', relation.relation_description || '', relation.distance_cost || '', relation.travel_time || '', relation.travel_method || '', relation.risk_level || '', relation.access_condition || '', relation.is_hidden ? 1 : 0, relation.is_one_way ? 1 : 0, now, now);
    const after = this.getRelations(projectId, id);
    this.analyzeImpact(projectId, id, ['relations'], { relations: before }, { relations: after }); return after;
  }

  getWritingSummary(projectId: string, id: string) {
    const data = this.getProfile(projectId, id); const p = data.profile;
    const value = (key: string) => p[key] || '待补全';
    const labels: Array<[string, string]> = [['地点名称','location_name'],['地点别名','location_alias'],['地点类型','location_type'],['上级地点','parent_location_id'],['层级路径','hierarchy_path'],['基础描述','basic_description'],['视觉特征','visual_features'],['声音气味触感','sound_smell_texture'],['地点氛围','atmosphere'],['象征意义','symbolic_meaning'],['地理位置','geography_position'],['距离逻辑','distance_logic'],['交通路线','traffic_routes'],['进入条件','entry_conditions'],['离开条件','exit_conditions'],['隐藏路径','hidden_paths'],['控制势力','owner_force'],['控制角色','controlling_character'],['公开身份','public_identity'],['秘密身份','secret_identity'],['安保等级','security_level'],['监视等级','surveillance_level'],['地点功能','location_function'],['剧情功能','plot_function'],['冲突功能','conflict_function'],['伏笔功能','foreshadowing_function'],['资源功能','resource_function'],['遭遇功能','encounter_function'],['当前状态','current_status'],['状态原因','status_reason'],['危险等级','danger_level'],['禁止行为','forbidden_behaviors'],['内部规则','rules_inside'],['违规惩罚','punishment_inside'],['可用资源','available_resources'],['稀缺资源','scarce_resources'],['特殊物品','special_items'],['交易价值','trade_value'],['战略价值','strategic_value'],['历史事件','historical_events'],['过去灾难','past_disaster'],['战争记忆','war_memory'],['失落真相','lost_truth'],['埋藏秘密','secret_buried_here'],['关联角色','connected_characters'],['关联势力','connected_forces'],['关联伏笔','connected_foreshadowing'],['关联章节','connected_chapters'],['关联世界规则','connected_world_rules'],['场景钩子','scene_hooks'],['感官锚点','sensory_anchor'],['首次到达印象','first_arrival_impression'],['重访变化','revisit_changes'],['高潮用途','climax_usage'],['必须遵守','must_obey_rules'],['允许变化','can_change_rules'],['禁止写法','forbidden_writing'],['容易写崩点','easy_to_break_points'],['本章可用','current_chapter_usage']];
    const relationLines = data.relations.length ? data.relations.flatMap((r: any, index: number) => [`- 关系 ${index + 1}`, `  关系类型：${r.relation_type || '待补全'}`, `  目标地点：${r.target_location_id || '待补全'}`, `  关系说明：${r.relation_description || '待补全'}`, `  距离成本：${r.distance_cost || '待补全'}`, `  移动时间：${r.travel_time || '待补全'}`, `  交通方式：${r.travel_method || '待补全'}`, `  风险等级：${r.risk_level || '待补全'}`, `  通行条件：${r.access_condition || '待补全'}`, `  是否隐藏：${r.is_hidden ? '是' : '否'}`, `  是否单向：${r.is_one_way ? '是' : '否'}`]) : ['- 暂无地点关系'];
    return { summary: ['【地点写作摘要】', ...labels.map(([label, key]) => `${label}：${value(key)}`), '地点关系：', ...relationLines].join('\n'), profile: p, relations: data.relations };
  }

  checkConsistency(projectId: string, content: string) {
    const issues: any[] = [];
    for (const point of this.findByProjectId(projectId)) {
      const data = this.getProfile(projectId, point.id); const p = data.profile;
      const add = (issueType: string, evidence: string, reason: string, suggestion: string, severity: 'low'|'medium'|'high') => issues.push({ locationId: point.id, locationName: point.name, issueType, evidence, reason, suggestion, severity });
      const describesLocation = [point.name, p.location_name, p.location_alias].filter(Boolean).some(name => content.includes(name));
      if (p.forbidden_writing && content.includes(p.forbidden_writing)) add('forbidden_writing', p.forbidden_writing, '正文命中地点禁止写法', '改写地点描写', 'high');
      if (p.must_obey_rules && /无视规则|不受限制|规则失效/.test(content) && !content.includes(p.must_obey_rules)) add('must_obey_rules', p.must_obey_rules, '正文可能违反地点硬规则', '遵守地点规则', 'high');
      if (p.current_status && /完全开放|已修复|无人占领/.test(content) && !content.includes(p.current_status)) add('current_status', p.current_status, '正文可能与地点状态冲突', '回扣地点状态', 'medium');
      if (p.distance_logic && /瞬移|瞬间到达/.test(content)) add('distance_logic', p.distance_logic, '地点移动可能违反距离逻辑', '补充路线成本', 'medium');
      if (p.entry_conditions && /直接进入|随意进入/.test(content) && !content.includes(p.entry_conditions)) add('entry_conditions', p.entry_conditions, '正文可能绕过进入条件', '补充进入条件', 'medium');
      if (p.security_level && /轻易潜入|无人看守/.test(content)) add('security_level', p.security_level, '正文可能绕过安保', '补充安保代价', 'medium');
      if (p.hidden_paths && content.includes(p.hidden_paths)) add('hidden_paths', p.hidden_paths, '正文暴露隐藏路径', '确认是否允许揭露', 'medium');
      if (p.danger_level && /毫无风险|轻松通过/.test(content)) add('danger_level', p.danger_level, '正文弱化高风险地点', '补充风险成本', 'medium');
      if (p.easy_to_break_points && content.includes(p.easy_to_break_points)) add('easy_to_break_points', p.easy_to_break_points, '正文命中易写崩点', '重写相关内容', 'medium');
      if (describesLocation && p.owner_force && /控制|占领|接管|统治|驻守|封锁|势力|领地/.test(content) && !content.includes(p.owner_force)) add('owner_force', p.owner_force, '正文可能写错地点控制势力', `回扣地点控制势力：${p.owner_force}`, 'medium');
    }
    return { passed: issues.length === 0, score: Math.max(0, 100 - issues.length * 10), issues };
  }
  private profileRow(row: any, point: MapPointResponse) { return Object.fromEntries(LOCATION_PROFILE_FIELDS.map(key => [key, row?.[key] || (key === 'location_name' ? point.name : key === 'location_type' ? point.type : key === 'parent_location_id' ? point.parentId || '' : '')])); }
  private listValue(value: unknown) { try { return Array.isArray(value) ? value : JSON.parse(String(value || '[]')); } catch { return []; } }
  private analyzeImpact(projectId: string, id: string, changedFields: readonly string[], before?: unknown, after?: unknown) { const groups: Record<string,string[]> = { identity:['location_name','location_type','parent_location_id','hierarchy_path'], sensory:['basic_description','visual_features','sound_smell_texture','atmosphere'], route:['distance_logic','traffic_routes','entry_conditions','hidden_paths'], control:['owner_force','controlling_character','security_level'], plot:['location_function','plot_function','foreshadowing_function'], status:['current_status','danger_level'], resource:['available_resources','scarce_resources'], history:['historical_events','lost_truth','secret_buried_here'], connections:['connected_characters','connected_forces','connected_foreshadowing'], scene:['scene_hooks','sensory_anchor','climax_usage'], constraints:['must_obey_rules','forbidden_writing','easy_to_break_points'], relations:['relations'] }; const changedGroups = Object.entries(groups).filter(([, keys]) => keys.some(key => changedFields.includes(key))).map(([key]) => key); this.stateItemService?.analyzeImpactTracked(projectId, { targetType: 'map_point', targetId: id, summary: '地点知识图谱修改影响分析', payload: { before, after, changedFields, changedGroups, riskReason: '地点规则或关系变化，关联剧情需要复核。', affectedModules: ['chapter','outline','character','world_setting','foreshadowing','timeline','map','writing_context','writing_quality'], suggestedReviewAction: '复核关联路线、章节和伏笔。' }, createdBy: 'map-point-service' }); }

  create(projectId: string, dto: CreateMapPointDto): MapPointResponse {
    const now = new Date().toISOString();
    const id = uuid();

    this.repo.insert({
      id,
      project_id: projectId,
      name: dto.name,
      type: dto.type || '',
      description: dto.description || '',
      parent_id: dto.parentId || null,
      level: dto.level || 'location',
      coordinates: dto.coordinates || null,
      linked_chapter_ids: JSON.stringify(dto.linkedChapterIds || []),
      linked_character_ids: JSON.stringify(dto.linkedCharacterIds || []),
      created_at: now,
      updated_at: now,
    });

    return this.toResponse(this.repo.findById(id)!);
  }

  findByProjectId(projectId: string): MapPointResponse[] {
    return this.repo.findByProjectId(projectId).map((r) => this.toResponse(r));
  }

  findOne(id: string): MapPointResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`MapPoint ${id} not found`);
    return this.toResponse(row);
  }

  update(id: string, dto: UpdateMapPointDto): MapPointResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`MapPoint ${id} not found`);

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updated_at: now };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.parentId !== undefined) updateData.parent_id = dto.parentId || null;
    if (dto.level !== undefined) updateData.level = dto.level;
    if (dto.coordinates !== undefined) updateData.coordinates = dto.coordinates || null;
    if (dto.linkedChapterIds !== undefined) {
      updateData.linked_chapter_ids = JSON.stringify(dto.linkedChapterIds);
    }
    if (dto.linkedCharacterIds !== undefined) {
      updateData.linked_character_ids = JSON.stringify(dto.linkedCharacterIds);
    }

    this.repo.update(id, updateData);
    const response = this.toResponse(this.repo.findById(id)!);
    this.analyzeImpact(existing.project_id, id, Object.keys(updateData).filter(key => key !== 'updated_at'), this.toResponse(existing), response);
    return response;
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`MapPoint ${id} not found`);
    const before = this.toResponse(existing);
    this.repo.delete(id);
    this.analyzeImpact(existing.project_id, id, ['remove'], before, null);
    return { success: true };
  }

  /** 按层级查询 */
  findByLevel(projectId: string, level: string): MapPointResponse[] {
    return this.repo.findByLevel(projectId, level).map((r) => this.toResponse(r));
  }

  /** 获取子地点 */
  findByParentId(projectId: string, parentId: string): MapPointResponse[] {
    return this.repo.findByParentId(projectId, parentId).map((r) => this.toResponse(r));
  }

  /** 返回树状结构（递归组装 children） */
  getTree(projectId: string): MapPointTreeNode[] {
    const all = this.repo.findByProjectId(projectId);
    const nodeMap = new Map<string, MapPointTreeNode>();
    const roots: MapPointTreeNode[] = [];

    // 第一遍：创建所有节点
    for (const row of all) {
      nodeMap.set(row.id, { ...this.toResponse(row), children: [] });
    }

    // 第二遍：组装父子关系
    for (const row of all) {
      const node = nodeMap.get(row.id)!;
      if (row.parent_id && nodeMap.has(row.parent_id)) {
        nodeMap.get(row.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  search(projectId: string, query: string): MapPointResponse[] {
    return this.repo.search(projectId, query).map((r) => this.toResponse(r));
  }

  /** 按关联角色查询 */
  findByCharacter(projectId: string, characterId: string): MapPointResponse[] {
    return this.repo.findByCharacterId(projectId, characterId).map((r) => this.toResponse(r));
  }

  /** 按关联章节查询 */
  findByChapter(projectId: string, chapterId: string): MapPointResponse[] {
    return this.repo.findByChapterId(projectId, chapterId).map((r) => this.toResponse(r));
  }

  private toResponse(row: MapPointRow): MapPointResponse {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      type: row.type || '',
      description: row.description || '',
      parentId: row.parent_id || null,
      level: (row.level || 'location') as MapLevel,
      coordinates: row.coordinates || undefined,
      linkedChapterIds: JSON.parse(row.linked_chapter_ids || '[]'),
      linkedCharacterIds: JSON.parse(row.linked_character_ids || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
