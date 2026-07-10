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
    if (changedFields.length) this.analyzeImpact(projectId, id, changedFields);
    return this.getProfile(projectId, id);
  }

  getRelations(projectId: string, id: string) { return this.databaseService.getDb().prepare('SELECT * FROM location_knowledge_relations WHERE project_id = ? AND source_location_id = ? ORDER BY created_at').all(projectId, id) as any[]; }
  updateRelations(projectId: string, id: string, relations: any[]) {
    const db = this.databaseService.getDb(); const now = new Date().toISOString(); db.prepare('DELETE FROM location_knowledge_relations WHERE project_id = ? AND source_location_id = ?').run(projectId, id);
    for (const relation of Array.isArray(relations) ? relations : []) db.prepare('INSERT INTO location_knowledge_relations (id,project_id,source_location_id,target_location_id,relation_type,relation_description,distance_cost,travel_time,travel_method,risk_level,access_condition,is_hidden,is_one_way,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(relation.id || uuid(), projectId, id, relation.target_location_id || '', relation.relation_type || 'route_to', relation.relation_description || '', relation.distance_cost || '', relation.travel_time || '', relation.travel_method || '', relation.risk_level || '', relation.access_condition || '', relation.is_hidden ? 1 : 0, relation.is_one_way ? 1 : 0, now, now);
    this.analyzeImpact(projectId, id, ['relations']); return this.getRelations(projectId, id);
  }

  getWritingSummary(projectId: string, id: string) { const data = this.getProfile(projectId, id); const p = data.profile; const v = (key: string) => p[key] || '待补全'; return { summary: ['【地点写作摘要】', ...LOCATION_PROFILE_FIELDS.map(key => `${key}：${v(key)}`), '地点关系：', ...data.relations.map(r => `${r.relation_type} -> ${r.target_location_id}；${r.distance_cost || '待补全'}；${r.access_condition || '待补全'}`)].join('\n'), profile: p, relations: data.relations }; }
  checkConsistency(projectId: string, content: string) { const issues: any[] = []; for (const point of this.findByProjectId(projectId)) { const p = this.getProfile(projectId, point.id).profile; const add = (issueType: string, evidence: string, reason: string, suggestion: string, severity: 'low'|'medium'|'high') => issues.push({ locationId: point.id, locationName: point.name, issueType, evidence, reason, suggestion, severity }); if (p.forbidden_writing && content.includes(p.forbidden_writing)) add('forbidden_writing', p.forbidden_writing, '正文命中地点禁止写法', '改写地点描写', 'high'); if (p.must_obey_rules && /无视规则|不受限制|规则失效/.test(content) && !content.includes(p.must_obey_rules)) add('must_obey_rules', p.must_obey_rules, '正文可能违反地点硬规则', '遵守地点规则', 'high'); if (p.current_status && /完全开放|已修复|无人占领/.test(content) && !content.includes(p.current_status)) add('current_status', p.current_status, '正文可能与地点状态冲突', '回扣地点状态', 'medium'); if (p.distance_logic && /瞬移|瞬间到达/.test(content)) add('distance_logic', p.distance_logic, '地点移动可能违反距离逻辑', '补充路线成本', 'medium'); if (p.entry_conditions && /直接进入|随意进入/.test(content) && !content.includes(p.entry_conditions)) add('entry_conditions', p.entry_conditions, '正文可能绕过进入条件', '补充进入条件', 'medium'); if (p.security_level && /轻易潜入|无人看守/.test(content)) add('security_level', p.security_level, '正文可能绕过安保', '补充安保代价', 'medium'); if (p.hidden_paths && content.includes(p.hidden_paths)) add('hidden_paths', p.hidden_paths, '正文暴露隐藏路径', '确认是否允许揭露', 'medium'); if (p.danger_level && /毫无风险|轻松通过/.test(content)) add('danger_level', p.danger_level, '正文弱化高风险地点', '补充风险成本', 'medium'); if (p.easy_to_break_points && content.includes(p.easy_to_break_points)) add('easy_to_break_points', p.easy_to_break_points, '正文命中易写崩点', '重写相关内容', 'medium'); } return { passed: issues.length === 0, score: Math.max(0, 100 - issues.length * 10), issues }; }

  private profileRow(row: any, point: MapPointResponse) { return Object.fromEntries(LOCATION_PROFILE_FIELDS.map(key => [key, row?.[key] || (key === 'location_name' ? point.name : key === 'location_type' ? point.type : key === 'parent_location_id' ? point.parentId || '' : '')])); }
  private listValue(value: unknown) { try { return Array.isArray(value) ? value : JSON.parse(String(value || '[]')); } catch { return []; } }
  private analyzeImpact(projectId: string, id: string, changedFields: readonly string[]) { const groups: Record<string,string[]> = { identity:['location_name','location_type','parent_location_id','hierarchy_path'], sensory:['basic_description','visual_features','sound_smell_texture','atmosphere'], route:['distance_logic','traffic_routes','entry_conditions','hidden_paths'], control:['owner_force','controlling_character','security_level'], plot:['location_function','plot_function','foreshadowing_function'], status:['current_status','danger_level'], resource:['available_resources','scarce_resources'], history:['historical_events','lost_truth','secret_buried_here'], connections:['connected_characters','connected_forces','connected_foreshadowing'], scene:['scene_hooks','sensory_anchor','climax_usage'], constraints:['must_obey_rules','forbidden_writing','easy_to_break_points'], relations:['relations'] }; const changedGroups = Object.entries(groups).filter(([, keys]) => keys.some(key => changedFields.includes(key))).map(([key]) => key); this.stateItemService?.analyzeImpact(projectId, { targetType: 'map_point', targetId: id, summary: '地点知识图谱修改影响分析', payload: { changedFields, changedGroups, riskReason: '地点规则或关系变化，关联剧情需要复核。', affectedModules: ['chapter','outline','character','world_setting','foreshadowing','timeline','map','writing_context','writing_quality'], suggestedReviewAction: '复核关联路线、章节和伏笔。' }, createdBy: 'map-point-service' }); }

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
    return this.toResponse(this.repo.findById(id)!);
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`MapPoint ${id} not found`);
    this.repo.delete(id);
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
