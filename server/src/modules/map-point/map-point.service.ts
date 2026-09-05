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

// 对齐外部文档《世界观模板》的「地点 / 氛围 / 势力」段落（聚焦 10 项）
const LOCATION_PROFILE_FIELDS = ['location_type','basic_description','atmosphere','geography_position','key_landmarks','controlling_force','resources_scarcity','secrets_foreshadow','connected_characters','connected_chapters'] as const;

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
  climate?: string;
  resources?: string;
  significance?: string;
  sensoryDetail?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class MapPointService {
  constructor(private readonly repo: MapPointRepository, private readonly databaseService: DatabaseService, @Optional() private readonly stateItemService?: StateItemService) {}

  /**
   * 地点“内部功能空间”后缀：出现这些词说明它是某主地点内部的子场景（大堂/门口/办公室…），
   * 应作为 scene 挂到主地点下，而不是平铺成又一个一级地点（用户反馈：同一地点生成一堆重复点）。
   * 注意“大厦/大楼/总部/集团”是主点名的一部分，不能当后缀剥离。
   */
  private static readonly FUNCTION_SUFFIX = /(一楼|二楼|三楼|[0-9]+楼|一层|二层|[0-9]+层|大堂|大厅|前台|门口|门外|靠窗|卡座|卡座区|办公室|会议室|卧室|客厅|书房|厨房|卫生间|登记区|登记处|外广场|单元门口|单元|走廊|电梯间|电梯|停车场|顶楼|天台|露台|包间|工位)$/;

  /**
   * 计算地点“核心名”，用于判断两个名字是否指向同一物理地点（零 LLM、可单测）：
   * 去括号补充说明（如“（前夫炫耀处）”）→ 取“的”之后的核心地点（“林薇与陆沉的婚房”→婚房）
   * → 反复剥离内部功能空间后缀（“辰风科技办公室”→辰风科技）。
   */
  static coreLocationName(raw: string): string {
    let s = String(raw || '').replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '').trim();
    const de = s.lastIndexOf('的');
    if (de >= 0 && de < s.length - 1) s = s.slice(de + 1);
    let prev = '';
    while (prev !== s) { prev = s; s = s.replace(MapPointService.FUNCTION_SUFFIX, ''); }
    return s.trim();
  }

  /**
   * 入库前对 LLM 返回的地点做确定性归并（零 LLM、可单测），根治“同一地点被不同修饰名重复建点、
   * 子场景被平铺成一级点”：
   *  - 核心名相同 = 同一物理地点：纯重复（人物修饰/括号注释不同）只保留一条并合并描述；
   *  - 带内部功能空间后缀（或原 level=scene）的，降为 scene 并把 parentName 指向核心主地点，同名子场景只留一条；
   *  - 主地点首次出现保留为一级点。返回归并后数组与被合并名清单（供日志/进度警告，作者可见）。
   */
  static dedupeRawMapPoints<T extends { name?: string; level?: string; parentName?: string; description?: string; type?: string }>(raw: T[]): { points: T[]; merged: string[] } {
    const out: T[] = [];
    const merged: string[] = [];
    const coreIndex = new Map<string, number>();
    const childKey = new Set<string>();
    for (const item of Array.isArray(raw) ? raw : []) {
      const name = String(item?.name || '').replace(/\s+/g, '').trim();
      if (!name) continue;
      const core = MapPointService.coreLocationName(name);
      if (!core) continue;
      const suffixMatch = name.match(MapPointService.FUNCTION_SUFFIX);
      const isFunctional = Boolean(suffixMatch) || item.level === 'scene';
      const existed = coreIndex.get(core);
      if (existed === undefined) {
        out.push({ ...item, name });
        coreIndex.set(core, out.length - 1);
        // 主点自身就带功能后缀（如“辰风科技办公室”）时，为该后缀占位，后来同后缀的重复名直接合并而非另立子点
        const selfSuffix = name.match(MapPointService.FUNCTION_SUFFIX);
        if (selfSuffix) childKey.add(`${core}::${selfSuffix[0]}`);
        continue;
      }
      const parent = out[existed];
      if (isFunctional) {
        const key = `${core}::${suffixMatch ? suffixMatch[0] : name}`;
        if (childKey.has(key)) { merged.push(name); continue; }
        childKey.add(key);
        out.push({ ...item, name, level: 'scene', parentName: String(parent.name) });
      } else {
        merged.push(name);
        const extra = String(item.description || '').trim();
        const base = String(parent.description || '').trim();
        if (extra && !base.includes(extra)) (parent as any).description = base ? `${base}；${extra}` : extra;
      }
    }
    return { points: out, merged };
  }

  getProfile(projectId: string, id: string) {
    const mapPoint = this.findOne(id); if (mapPoint.projectId !== projectId) throw new NotFoundException('Map point not found');
    const db = this.databaseService.getDb(); const row = db.prepare('SELECT * FROM location_knowledge_profiles WHERE project_id = ? AND map_point_id = ?').get(projectId, id) as any;
    const relations = this.getRelations(projectId, id);
    return { mapPoint, profile: this.profileRow(row, mapPoint), relations, relatedLocations: relations, warnings: [], connectedCharacters: this.listValue(row?.connected_characters), connectedChapters: this.listValue(row?.connected_chapters) };
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
    const labels: Array<[string, string]> = [['地点类型','location_type'],['基础描述','basic_description'],['氛围与环境','atmosphere'],['地理位置与方位','geography_position'],['关键地点/标志物','key_landmarks'],['掌控势力/角色','controlling_force'],['资源与稀缺','resources_scarcity'],['隐藏秘密/伏笔钩子','secrets_foreshadow'],['关联人物','connected_characters'],['关联章节','connected_chapters']];
    const relationLines = data.relations.length ? data.relations.flatMap((r: any, index: number) => [`- 关系 ${index + 1}`, `  关系类型：${r.relation_type || '待补全'}`, `  目标地点：${r.target_location_id || '待补全'}`, `  关系说明：${r.relation_description || '待补全'}`, `  距离成本：${r.distance_cost || '待补全'}`, `  移动时间：${r.travel_time || '待补全'}`, `  交通方式：${r.travel_method || '待补全'}`, `  风险等级：${r.risk_level || '待补全'}`, `  通行条件：${r.access_condition || '待补全'}`, `  是否隐藏：${r.is_hidden ? '是' : '否'}`, `  是否单向：${r.is_one_way ? '是' : '否'}`]) : ['- 暂无地点关系'];
    return { summary: ['【地点写作摘要】', ...labels.map(([label, key]) => `${label}：${value(key)}`), '地点关系：', ...relationLines].join('\n'), profile: p, relations: data.relations };
  }

  checkConsistency(projectId: string, content: string) {
    const issues: any[] = [];
    for (const point of this.findByProjectId(projectId)) {
      const data = this.getProfile(projectId, point.id); const p = data.profile;
      const add = (issueType: string, evidence: string, reason: string, suggestion: string, severity: 'low'|'medium'|'high') => issues.push({ locationId: point.id, locationName: point.name, issueType, evidence, reason, suggestion, severity });
      const describesLocation = [point.name].filter(Boolean).some(name => content.includes(name));
      if (p.secrets_foreshadow && content.includes(p.secrets_foreshadow)) add('secrets_foreshadow', p.secrets_foreshadow, '正文过早暴露地点隐藏秘密', '确认是否到达揭示时机', 'medium');
      if (p.controlling_force && describesLocation && /控制|占领|接管|统治|驻守|封锁|势力|领地/.test(content) && !content.includes(p.controlling_force)) add('controlling_force', p.controlling_force, '正文可能写错地点控制势力', `回扣地点控制势力：${p.controlling_force}`, 'medium');
      if (p.atmosphere && describesLocation && /祥和|平静|安全/.test(content) && p.atmosphere.includes('危险')) add('atmosphere', p.atmosphere, '正文氛围与地点设定冲突', '回扣地点氛围基调', 'medium');
    }
    return { passed: issues.length === 0, score: Math.max(0, 100 - issues.length * 10), issues };
  }
  private profileRow(row: any, point: MapPointResponse) { return Object.fromEntries(LOCATION_PROFILE_FIELDS.map(key => [key, row?.[key] || (key === 'location_type' ? point.type : '')])); }
  private listValue(value: unknown) { try { return Array.isArray(value) ? value : JSON.parse(String(value || '[]')); } catch { return []; } }
  private analyzeImpact(projectId: string, id: string, changedFields: readonly string[], before?: unknown, after?: unknown) { const groups: Record<string,string[]> = { identity:['location_type'], sensory:['basic_description','atmosphere'], geo:['geography_position','key_landmarks'], control:['controlling_force'], resource:['resources_scarcity'], secrets:['secrets_foreshadow'], connections:['connected_characters','connected_chapters'], relations:['relations'] }; const changedGroups = Object.entries(groups).filter(([, keys]) => keys.some(key => changedFields.includes(key))).map(([key]) => key); this.stateItemService?.analyzeImpactTracked(projectId, { targetType: 'map_point', targetId: id, summary: '地点知识图谱修改影响分析', payload: { before, after, changedFields, changedGroups, riskReason: '地点规则或关系变化，关联剧情需要复核。', affectedModules: ['chapter','outline','character','world_setting','foreshadowing','timeline','map','writing_context','writing_quality'], suggestedReviewAction: '复核关联路线、章节和伏笔。' }, createdBy: 'map-point-service' }); }

  create(projectId: string, dto: CreateMapPointDto): MapPointResponse {
    const now = new Date().toISOString();
    const id = uuid();
    const name = String(dto.name || '').trim();

    // 创建时自动扫描大纲与角色，建立关联（用户手动指定的优先）
    const autoLinks = name ? this.computeLinksForLocation(projectId, name) : { chapterIds: [], characterIds: [] };
    const linkedChapterIds = dto.linkedChapterIds && dto.linkedChapterIds.length > 0 ? dto.linkedChapterIds : autoLinks.chapterIds;
    const linkedCharacterIds = dto.linkedCharacterIds && dto.linkedCharacterIds.length > 0 ? dto.linkedCharacterIds : autoLinks.characterIds;

    this.repo.insert({
      id,
      project_id: projectId,
      name: dto.name,
      type: dto.type || '',
      description: dto.description || '',
      parent_id: dto.parentId || null,
      level: dto.level || 'location',
      coordinates: dto.coordinates || null,
      linked_chapter_ids: JSON.stringify(linkedChapterIds),
      linked_character_ids: JSON.stringify(linkedCharacterIds),
      climate: dto.climate || null,
      resources: dto.resources || null,
      significance: dto.significance || null,
      sensory_detail: dto.sensoryDetail || null,
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
    if (dto.climate !== undefined) updateData.climate = dto.climate;
    if (dto.resources !== undefined) updateData.resources = dto.resources;
    if (dto.significance !== undefined) updateData.significance = dto.significance;
    if (dto.sensoryDetail !== undefined) updateData.sensory_detail = dto.sensoryDetail;

    // 地点名称变更时，自动重新扫描关联（除非用户手动指定了新的关联）
    if (dto.name !== undefined && String(dto.name).trim() !== String(existing.name || '').trim()) {
      const newName = String(dto.name).trim();
      if (newName && dto.linkedChapterIds === undefined) {
        updateData.linked_chapter_ids = JSON.stringify(this.computeLinksForLocation(existing.project_id, newName).chapterIds);
      }
      if (newName && dto.linkedCharacterIds === undefined) {
        updateData.linked_character_ids = JSON.stringify(this.computeLinksForLocation(existing.project_id, newName).characterIds);
      }
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

  /**
   * 计算单个地点名在当前项目中的关联章节与角色。
   * 扫描大纲标题/内容/场景匹配章节，扫描角色身份/外貌/背景匹配角色。
   */
  private computeLinksForLocation(projectId: string, locationName: string): { chapterIds: string[]; characterIds: string[] } {
    const db = this.databaseService.getDb();
    const name = locationName.trim();
    if (!name) return { chapterIds: [], characterIds: [] };
    const outlines = db.prepare(
      `SELECT id FROM outlines WHERE project_id=? AND level='chapter' AND (title LIKE ? OR content LIKE ? OR scenes LIKE ?)`
    ).all(projectId, `%${name}%`, `%${name}%`, `%${name}%`) as Array<{ id: string }>;
    const characters = db.prepare(
      `SELECT id FROM characters WHERE project_id=? AND (identity LIKE ? OR appearance LIKE ? OR background LIKE ?)`
    ).all(projectId, `%${name}%`, `%${name}%`, `%${name}%`) as Array<{ id: string }>;
    return { chapterIds: outlines.map(o => o.id), characterIds: characters.map(c => c.id) };
  }

  /**
   * 大纲修改后增量更新地点关联：根据大纲文本决定该大纲是否关联到每个地点。
   * 由 OutlineService.update 在 title/content/scenes 变化时调用。
   */
  updateLinksForOutline(projectId: string, outlineId: string, outlineText: string): void {
    const db = this.databaseService.getDb();
    const now = new Date().toISOString();
    const locations = db.prepare('SELECT id, name, linked_chapter_ids FROM map_points WHERE project_id=?').all(projectId) as Array<{ id: string; name: string; linked_chapter_ids: string }>;
    for (const loc of locations) {
      const name = String(loc.name || '').trim();
      if (!name) continue;
      const linked = JSON.parse(loc.linked_chapter_ids || '[]') as string[];
      const hasLink = linked.includes(outlineId);
      const shouldLink = outlineText.includes(name);
      if (hasLink && !shouldLink) {
        db.prepare('UPDATE map_points SET linked_chapter_ids=?, updated_at=? WHERE id=?').run(JSON.stringify(linked.filter(id => id !== outlineId)), now, loc.id);
      } else if (!hasLink && shouldLink) {
        linked.push(outlineId);
        db.prepare('UPDATE map_points SET linked_chapter_ids=?, updated_at=? WHERE id=?').run(JSON.stringify(linked), now, loc.id);
      }
    }
  }

  /**
   * 角色修改后增量更新地点关联：根据角色文本决定该角色是否关联到每个地点。
   * 由 CharacterService.update 在 identity/appearance/background 变化时调用。
   */
  updateLinksForCharacter(projectId: string, characterId: string, characterText: string): void {
    const db = this.databaseService.getDb();
    const now = new Date().toISOString();
    const locations = db.prepare('SELECT id, name, linked_character_ids FROM map_points WHERE project_id=?').all(projectId) as Array<{ id: string; name: string; linked_character_ids: string }>;
    for (const loc of locations) {
      const name = String(loc.name || '').trim();
      if (!name) continue;
      const linked = JSON.parse(loc.linked_character_ids || '[]') as string[];
      const hasLink = linked.includes(characterId);
      const shouldLink = characterText.includes(name);
      if (hasLink && !shouldLink) {
        db.prepare('UPDATE map_points SET linked_character_ids=?, updated_at=? WHERE id=?').run(JSON.stringify(linked.filter(id => id !== characterId)), now, loc.id);
      } else if (!hasLink && shouldLink) {
        linked.push(characterId);
        db.prepare('UPDATE map_points SET linked_character_ids=?, updated_at=? WHERE id=?').run(JSON.stringify(linked), now, loc.id);
      }
    }
  }

  /**
   * 全量重算地点关联（存量项目兼容入口）。
   * 扫描大纲标题/内容/场景匹配章节，扫描角色身份/外貌/背景匹配角色，
   * 更新每个地点的 linked_chapter_ids / linked_character_ids。
   */
  resyncLinks(projectId: string): { updated: number; totalLocations: number; totalChapters: number; totalCharacters: number } {
    const db = this.databaseService.getDb();
    const now = new Date().toISOString();
    const outlines = db.prepare(`SELECT id, title, content, scenes FROM outlines WHERE project_id=? AND level='chapter'`).all(projectId) as any[];
    const characters = db.prepare(`SELECT id, name, identity, appearance, background FROM characters WHERE project_id=?`).all(projectId) as any[];
    const locations = this.repo.findByProjectId(projectId);
    let updated = 0;
    for (const loc of locations) {
      const name = String(loc.name || '').trim();
      if (!name) continue;
      const linkedChapterIds: string[] = [];
      for (const ol of outlines) {
        const searchText = `${ol.title || ''} ${ol.content || ''} ${ol.scenes || ''}`;
        if (searchText.includes(name)) linkedChapterIds.push(ol.id);
      }
      const linkedCharacterIds: string[] = [];
      for (const ch of characters) {
        const searchText = `${ch.name || ''} ${ch.identity || ''} ${ch.appearance || ''} ${ch.background || ''}`;
        if (searchText.includes(name)) linkedCharacterIds.push(ch.id);
      }
      const existing = this.repo.findById(loc.id);
      const existingChapters = existing ? JSON.parse(existing.linked_chapter_ids || '[]') : [];
      const existingCharacters = existing ? JSON.parse(existing.linked_character_ids || '[]') : [];
      const chaptersChanged = JSON.stringify(existingChapters.sort()) !== JSON.stringify(linkedChapterIds.sort());
      const charactersChanged = JSON.stringify(existingCharacters.sort()) !== JSON.stringify(linkedCharacterIds.sort());
      if (chaptersChanged || charactersChanged) {
        this.repo.update(loc.id, {
          linked_chapter_ids: JSON.stringify(linkedChapterIds),
          linked_character_ids: JSON.stringify(linkedCharacterIds),
          updated_at: now,
        });
        updated++;
      }
    }
    return { updated, totalLocations: locations.length, totalChapters: outlines.length, totalCharacters: characters.length };
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
      climate: row.climate || undefined,
      resources: row.resources || undefined,
      significance: row.significance || undefined,
      sensoryDetail: row.sensory_detail || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
