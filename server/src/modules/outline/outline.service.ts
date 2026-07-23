/**
 * 大纲 Service
 */
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { OutlineRepository } from '../../database/repositories/outline.repository';
import { DatabaseService } from '../../database/database.service';
import type { OutlineRow } from '../../database/repositories/outline.repository';
import type {
  ContinueOutlineDto,
  CreateOutlineDto,
  InsertOutlineDto,
  MoveOutlineDto,
  RecommendOutlinePlanDto,
  SplitOutlineDto,
  UpdateOutlineDto,
} from './dto/outline.dto';
import { StateItemService } from '../../state/state-item.service';

export interface OutlineResponse {
  id: string;
  projectId: string;
  level: string;
  parentId?: string;
  order: number;
  title: string;
  content: string;
  chapterFunction: string;
  goalArc: string;
  targetWords: number;
  actualWords?: number;
  foreshadowingIds: string[];
  plotPoints: any[];
  scenes?: Record<string, unknown> | unknown[] | null;
  volumes?: Record<string, unknown> | null;
  bookSkeleton?: Record<string, unknown> | null;
  status: string;
  characterIds: string[];
  detail?: Record<string, unknown>;
  attention?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  children?: OutlineResponse[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class OutlineService {
  constructor(
    private readonly repo: OutlineRepository,
    private readonly db: DatabaseService,
    @Optional() private readonly stateItemService?: StateItemService,
  ) {}

  create(projectId: string, dto: CreateOutlineDto): OutlineResponse {
    const now = new Date().toISOString();
    const id = uuid();
    const level = dto.level || 'chapter';
    const order = dto.order ?? 0;
    const targetWords = level === 'chapter' ? this.resolveChapterTargetWords(projectId, dto.targetWords) : (dto.targetWords || 0);
    if (level === 'chapter') this.shiftSiblings(projectId, dto.parentId || null, order, 1);

    this.repo.insert({
      id,
      project_id: projectId,
      level,
      parent_id: dto.parentId || null,
      order,
      title: dto.title,
      content: dto.content || '',
      chapter_function: dto.chapterFunction || 'breathing',
      goal_arc: dto.goalArc || 'crisis_resolve',
      target_words: targetWords,
      actual_words: 0,
      foreshadowing_ids: JSON.stringify(dto.foreshadowingIds || []),
      plot_points: JSON.stringify(dto.plotPoints || []),
      status: 'planned',
      character_ids: JSON.stringify(dto.characterIds || []),
      scenes: dto.scenes ? JSON.stringify(dto.scenes) : null,
      volumes: dto.volumes ? JSON.stringify(dto.volumes) : null,
      book_skeleton: dto.bookSkeleton ? JSON.stringify(dto.bookSkeleton) : null,
      created_at: now,
      updated_at: now,
    });
    const created = this.repo.findById(id)!;
    if (created.level === 'chapter') {
      this.insertBlankChapterForOutline(created, id, created.order + 1, created.title, now);
      this.syncBlankChapterOrder(projectId);
      const inserted = this.db.getDb().prepare('SELECT chapter_index FROM chapters WHERE project_id = ? AND outline_id = ?')
        .get(projectId, id) as { chapter_index: number } | undefined;
      this.syncAfterChapterChange(projectId, inserted?.chapter_index || 1, 1);
    }
    return this.toResponse(created);
  }

  findByProjectId(projectId: string): OutlineResponse[] {
    return this.repo.findByProjectId(projectId).map((r) => this.toResponse(r));
  }

  getTree(projectId: string): OutlineResponse[] {
    return this.repo.getTree(projectId).map((r) => this.toResponse(r));
  }

  /**
   * Repair projects created by older pipelines that inserted detailed outlines
   * directly but did not create their corresponding writable chapter rows.
   * This is intentionally additive: existing chapters (especially authored or
   * locked ones) are never replaced or reordered here.
   */
  ensureWritableChapters(projectId: string): { created: number; chapterIds: string[] } {
    const d = this.db.getDb();
    const outlines = d.prepare(`
      SELECT outline.id, outline.title, outline.parent_id, outline."order", parent."order" AS volume_order
      FROM outlines outline
      LEFT JOIN outlines parent ON parent.id = outline.parent_id
      WHERE outline.project_id = ? AND outline.level = 'chapter'
      ORDER BY COALESCE(parent."order", 0), outline."order", outline.id
    `).all(projectId) as Array<{ id: string; title: string; parent_id: string | null; order: number; volume_order: number | null }>;
    const linked = new Set((d.prepare('SELECT outline_id FROM chapters WHERE project_id = ? AND outline_id IS NOT NULL').all(projectId) as Array<{ outline_id: string }>).map(row => row.outline_id));
    const missing = outlines.filter(outline => !linked.has(outline.id));
    if (missing.length === 0) return { created: 0, chapterIds: [] };

    const now = new Date().toISOString();
    const chapterIds: string[] = [];
    this.db.transaction(() => {
      for (let index = 0; index < missing.length; index += 1) {
        const outline = missing[index];
        const id = uuid();
        chapterIds.push(id);
        d.prepare(`INSERT INTO chapters (id, project_id, outline_id, volume_index, chapter_index, title, content, word_count, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, '', 0, 'draft', ?, ?)`)
          .run(id, projectId, outline.id, Number(outline.volume_order || 0) + 1, -(index + 1), outline.title, now, now);
      }
    });
    this.syncBlankChapterOrder(projectId);
    return { created: chapterIds.length, chapterIds };
  }

  findOne(id: string): OutlineResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`Outline ${id} not found`);
    return this.toResponse(row);
  }

  update(id: string, dto: UpdateOutlineDto): OutlineResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updated_at: now };

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.content !== undefined) updateData.content = dto.content;
    if (dto.chapterFunction !== undefined) updateData.chapter_function = dto.chapterFunction;
    if (dto.goalArc !== undefined) updateData.goal_arc = dto.goalArc;
    if (dto.targetWords !== undefined) updateData.target_words = existing.level === 'chapter'
      ? this.resolveChapterTargetWords(existing.project_id, dto.targetWords)
      : dto.targetWords;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.characterIds !== undefined) updateData.character_ids = JSON.stringify(dto.characterIds || []);
    if (dto.foreshadowingIds !== undefined) updateData.foreshadowing_ids = JSON.stringify(dto.foreshadowingIds || []);
    if (dto.plotPoints !== undefined) updateData.plot_points = JSON.stringify(dto.plotPoints || []);
    if (dto.scenes !== undefined) updateData.scenes = dto.scenes ? JSON.stringify(dto.scenes) : null;
    if (dto.volumes !== undefined) updateData.volumes = dto.volumes ? JSON.stringify(dto.volumes) : null;
    if (dto.bookSkeleton !== undefined) updateData.book_skeleton = dto.bookSkeleton ? JSON.stringify(dto.bookSkeleton) : null;

    this.repo.update(id, updateData);
    const response = this.toResponse(this.repo.findById(id)!);
    this.analyzeStateImpact(existing, dto);
    return response;
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);
    if (existing.status === 'locked') throw new Error('已锁定章节不可删除');
    const order = existing.order;
    const chapterIndex = order + 1;
    if (existing.level === 'chapter') this.assertChapterStructureEditable(existing.project_id, chapterIndex);
    const linkedChapter = existing.level === 'chapter'
      ? this.db.getDb().prepare('SELECT id FROM chapters WHERE project_id = ? AND outline_id = ?').get(existing.project_id, existing.id) as any
      : null;
    this.repo.delete(id);
    // 后续章节号前移
    const siblings = this.repo.findChildren(existing.parent_id || '') || [];
    for (const sib of siblings.filter(s => s.order > order)) {
      this.repo.update(sib.id, { order: sib.order - 1, updated_at: new Date().toISOString() });
    }
    // 状态同步
    if (linkedChapter) this.db.getDb().prepare('DELETE FROM chapters WHERE id = ?').run(linkedChapter.id);
    if (existing.level === 'chapter') this.shiftDraftChapters(existing.project_id, chapterIndex + 1, -1);
    this.syncAfterChapterChange(existing.project_id, chapterIndex + 1, -1);
    this.analyzeOperationImpact(existing, 'remove');
    return { success: true };
  }

  move(id: string, dto: MoveOutlineDto): OutlineResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);
    const row = this.moveWithSiblingOrder(existing, dto.newParentId || null, dto.newOrder);
    // Outline position is the only source of truth for body numbering. Moving a
    // volume also affects all of its child chapters, so always resynchronize.
    this.syncBlankChapterOrder(existing.project_id);
    this.analyzeOperationImpact(existing, 'move', { newParentId: dto.newParentId, newOrder: dto.newOrder });
    return this.toResponse(row!);
  }

  reorderChildren(id: string, dto: { orderedIds: string[] }): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);
    this.repo.reorderChildren(id, dto.orderedIds);
    this.syncBlankChapterOrder(existing.project_id);
    this.analyzeOperationImpact(existing, 'reorder', { orderedIds: dto.orderedIds });
    return { success: true };
  }

  /**
   * 拆分章节：在当前位置创建一个新章节，原章节保留前半部分
   * 后续章节顺序自动后移
   */
  split(id: string, dto: SplitOutlineDto): { original: OutlineResponse; new: OutlineResponse } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);

    const now = new Date().toISOString();
    const newId = uuid();
    const newOrder = existing.order + 1;
    const newChapterIndex = newOrder + 1;
    const splitPoint = dto.splitPoint ?? Math.floor((existing.content?.length || 100) / 2);
    const originalTargetWords = this.resolveChapterTargetWords(existing.project_id, dto.originalTargetWords);
    const newTargetWords = this.resolveChapterTargetWords(existing.project_id, dto.newTargetWords);

    // 创建新章节（后半部分）
    this.repo.insert({
      id: newId,
      project_id: existing.project_id,
      level: existing.level,
      parent_id: existing.parent_id,
      order: newOrder,
      title: dto.newTitle,
      content: dto.newContent || (existing.content?.slice(splitPoint) || ''),
      chapter_function: existing.chapter_function,
      goal_arc: existing.goal_arc,
      target_words: newTargetWords,
      actual_words: 0,
      foreshadowing_ids: '[]',
      plot_points: '[]',
      status: 'planned',
      character_ids: existing.character_ids,
      scenes: existing.scenes,
      volumes: null,
      book_skeleton: null,
      created_at: now,
      updated_at: now,
    });

    // 更新原章节（保留前半部分）
    const originalContent = (existing.content || '').slice(0, splitPoint);
    this.repo.update(id, {
      content: originalContent,
      target_words: originalTargetWords,
      updated_at: now,
    });

    // 后续章节顺序后移
    const siblings = this.repo.findChildren(existing.parent_id || '');
    const toShift = siblings.filter(s => s.order > existing.order && s.id !== newId);
    for (const sib of toShift) {
      this.repo.update(sib.id, { order: sib.order + 1, updated_at: now });
    }

    // 状态同步：更新伏笔和角色状态中引用的章节号
    if (existing.level === 'chapter') {
      this.shiftDraftChapters(existing.project_id, newChapterIndex, 1);
      this.insertBlankChapterForOutline(existing, newId, newChapterIndex, dto.newTitle, now);
    }
    this.syncAfterChapterChange(existing.project_id, newChapterIndex, 1);
    this.analyzeOperationImpact(existing, 'split', { newTitle: dto.newTitle, splitPoint: dto.splitPoint });

    return {
      original: this.toResponse(this.repo.findById(id)!),
      new: this.toResponse(this.repo.findById(newId)!),
    };
  }

  insertAdjacent(id: string, dto: InsertOutlineDto): OutlineResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);
    const now = new Date().toISOString();
    const newOrder = dto.position === 'before' ? existing.order : existing.order + 1;
    const newChapterIndex = newOrder + 1;
    this.shiftSiblings(existing.project_id, existing.parent_id, newOrder, 1);

    const chapterTargetWords = this.resolveChapterTargetWords(existing.project_id, dto.targetWords);
    const detail = this.buildChapterDetail({
      title: dto.title || `新章节 ${newOrder + 1}`,
      order: newOrder,
      targetWords: chapterTargetWords,
      planning: {},
    });
    const newId = uuid();
    this.repo.insert({
      id: newId,
      project_id: existing.project_id,
      level: existing.level,
      parent_id: existing.parent_id,
      order: newOrder,
      title: dto.title || `新章节 ${newOrder + 1}`,
      content: dto.content || this.renderChapterDetail(detail),
      chapter_function: 'breathing',
      goal_arc: 'crisis_resolve',
      target_words: chapterTargetWords,
      actual_words: 0,
      foreshadowing_ids: '[]',
      plot_points: '[]',
      status: 'planned',
      character_ids: '[]',
      scenes: null,
      volumes: null,
      book_skeleton: null,
      created_at: now,
      updated_at: now,
    });
    this.writeOutlineExtensions(newId, { detail, plan: { inserted: dto.position } });
    if (existing.level === 'chapter') {
      this.shiftDraftChapters(existing.project_id, newChapterIndex, 1);
      this.insertBlankChapterForOutline(existing, newId, newChapterIndex, dto.title || `新章节 ${newOrder + 1}`, now);
    }
    this.syncAfterChapterChange(existing.project_id, newChapterIndex, 1);
    this.analyzeOperationImpact(existing, 'insert', { position: dto.position, newOrder });
    return this.toResponse(this.repo.findById(newId)!);
  }

  mergeNext(id: string, targetWords: number): OutlineResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);
    if (existing.status === 'locked') throw new Error('Locked outline cannot be merged');
    const next = this.findSiblingByOrder(existing.project_id, existing.parent_id, existing.order + 1);
    if (!next) throw new NotFoundException('Next outline chapter not found');
    if (next.status === 'locked') throw new Error('Locked outline cannot be merged');
    const nextChapterIndex = next.order + 1;
    if (existing.level === 'chapter') this.assertChapterStructureEditable(existing.project_id, nextChapterIndex);
    const nextChapter = this.db.getDb().prepare('SELECT id FROM chapters WHERE project_id = ? AND outline_id = ?').get(existing.project_id, next.id) as any;
    const mergedTargetWords = this.resolveChapterTargetWords(existing.project_id, targetWords);

    const now = new Date().toISOString();
    this.repo.update(existing.id, {
      title: `${existing.title} / ${next.title}`,
      content: `${existing.content || ''}\n\n${next.content || ''}`.trim(),
      target_words: mergedTargetWords,
      updated_at: now,
    });
    this.repo.delete(next.id);
    if (nextChapter) this.db.getDb().prepare('DELETE FROM chapters WHERE id = ?').run(nextChapter.id);
    if (existing.level === 'chapter') this.shiftDraftChapters(existing.project_id, nextChapterIndex + 1, -1);
    this.shiftSiblings(existing.project_id, existing.parent_id, next.order + 1, -1);
    this.syncAfterChapterChange(existing.project_id, nextChapterIndex + 1, -1);
    this.analyzeOperationImpact(existing, 'merge_next', { mergedId: next.id, mergedTitle: next.title });
    return this.toResponse(this.repo.findById(existing.id)!);
  }

  moveOrder(id: string, direction: 'up' | 'down'): OutlineResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);
    const targetOrder = direction === 'up' ? existing.order - 1 : existing.order + 1;
    if (targetOrder < 0) return this.toResponse(existing);
    const sibling = this.findSiblingByOrder(existing.project_id, existing.parent_id, targetOrder);
    if (!sibling) return this.toResponse(existing);
    const now = new Date().toISOString();
    this.repo.update(existing.id, { order: targetOrder, updated_at: now });
    this.repo.update(sibling.id, { order: existing.order, updated_at: now });
    this.syncBlankChapterOrder(existing.project_id);
    this.syncAfterChapterChange(existing.project_id, Math.min(existing.order, targetOrder) + 1, 0);
    this.analyzeOperationImpact(existing, `move_${direction}`, { swappedWith: sibling.id });
    return this.toResponse(this.repo.findById(existing.id)!);
  }

  continueCreate(projectId: string, dto: ContinueOutlineDto): { success: boolean; outlines: OutlineResponse[]; plan: Record<string, unknown> } {
    const count = Number(dto.count);
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error('续写大纲数量配置无效：必须明确填写大于0的整数。');
    }
    const base = dto.fromOutlineId
      ? this.repo.findById(dto.fromOutlineId)
      : this.findLastChapter(projectId);
    const plan = this.recommendPlan(projectId, { planning: dto.planning || {} });
    const parentId = base?.parent_id || null;
    let order = (base?.order ?? -1) + 1;
    const created: OutlineResponse[] = [];
    if (!Array.isArray(dto.chapterTargets) || dto.chapterTargets.length !== count) {
      throw new BadRequestException('续建章节必须逐章提供目标字数，数量需与续建章数一致。');
    }
    const chapterTargets = dto.chapterTargets.map(value => this.resolveChapterTargetWords(projectId, value));
    for (let i = 0; i < count; i++) {
      const title = `续写细纲 ${order + 1}`;
      const targetWords = chapterTargets[i];
      const detail = this.buildChapterDetail({ title, order, targetWords, planning: plan });
      const createdNode = this.create(projectId, {
        title,
        level: 'chapter',
        parentId: parentId || undefined,
        order,
        content: this.renderChapterDetail(detail),
        targetWords,
      });
      this.writeOutlineExtensions(createdNode.id, { detail, plan });
      created.push(this.findOne(createdNode.id));
      order++;
    }
    this.syncBlankChapterOrder(projectId);
    return { success: true, outlines: created, plan };
  }

  recommendPlan(projectId: string, dto: RecommendOutlinePlanDto): Record<string, unknown> {
    const d = this.db.getDb();
    const project = d.prepare(
      'SELECT title, type, target_words, platform_style, description, settings FROM projects WHERE id = ?',
    ).get(projectId) as { title: string; type: string; target_words: number; platform_style: string; description: string; settings: string } | undefined;
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    const settings = safeJson({ settings: project.settings } as any, 'settings', {});
    const planning = (dto.planning || {}) as any;
    const workScale = dto.workScale || (project.type === 'short_story' ? 'short_story' : 'long');
    const isShort = workScale.includes('short') || project?.type?.includes('short');
    const target = Number(project?.target_words || 0);
    if (!Number.isInteger(target) || target <= 0) throw new Error('项目未配置有效的目标总字数，不能使用固定篇幅代替。');
    const chapterWordRange = { min: 3200, max: 4000 };
    const chapterRange = { min: Math.ceil(target / chapterWordRange.max), max: Math.ceil(target / chapterWordRange.min) };
    const existing = d.prepare(`SELECT level, parent_id, target_words FROM outlines WHERE project_id = ?`).all(projectId) as any[];
    const existingChapters = existing.filter(row => row.level === 'chapter');
    const existingVolumes = isShort ? [] : existing.filter(row => row.level === 'volume');
    const invalidTargets = existingChapters.filter(row => Number(row.target_words) < chapterWordRange.min || Number(row.target_words) > chapterWordRange.max);
    return {
      workScale,
      targetWordsRange: dto.targetWordsRange || `${target}-${target}`,
      chapterWords: { mode: 'dynamic_range', min: chapterWordRange.min, max: chapterWordRange.max, recommended: null },
      totalChapters: { mode: existingChapters.length ? 'planned_by_story_rhythm' : 'dynamic_range', recommended: existingChapters.length || null, min: chapterRange.min, max: chapterRange.max },
      volumes: { mode: isShort ? 'not_applicable' : existingVolumes.length ? 'planned_by_story_arcs' : 'dynamic_by_story_arcs', recommended: isShort ? 0 : (existingVolumes.length || null) },
      chaptersPerVolume: { mode: isShort ? 'not_applicable' : 'dynamic_per_volume', recommended: null },
      updatePlan: planning.updatePlan || '根据主线阶段、冲突升级、人物弧光和节奏动态调整',
      requiresConfiguration: false,
      requiresStructurePlanning: existingChapters.length === 0,
      structureValid: existingChapters.length > 0 && invalidTargets.length === 0,
      invalidChapterTargets: invalidTargets.length,
      shortStoryFlow: isShort ? ['题材钩子', '闭环故事卡', '场景序列', '伏笔回收表', '章节写作包', '开篇吸引力检查'] : [],
      ultraLongReference: {
        note: '严格遵守指南的流程和资料结构；卷数、每卷章数和总章数不得套用示例数量。每章按剧情任务在3200-4000字内动态规划。',
      },
    };
  }

  /**
   * 将章节移动到其他卷
   */
  moveToVolume(id: string, targetVolumeId: string): OutlineResponse {
    const node = this.repo.findById(id);
    if (!node) throw new NotFoundException(`Outline ${id} not found`);
    const row = this.repo.moveNode(id, targetVolumeId, 999);
    if (node.level === 'chapter') this.syncBlankChapterOrder(node.project_id);
    this.analyzeOperationImpact(node, 'move_to_volume', { targetVolumeId });
    return this.toResponse(row!);
  }

  private findSiblingByOrder(projectId: string, parentId: string | null, order: number): OutlineRow | undefined {
    const d = this.db.getDb();
    const sql = parentId
      ? 'SELECT * FROM outlines WHERE project_id = ? AND parent_id = ? AND "order" = ? LIMIT 1'
      : 'SELECT * FROM outlines WHERE project_id = ? AND parent_id IS NULL AND "order" = ? LIMIT 1';
    const params = parentId ? [projectId, parentId, order] : [projectId, order];
    return d.prepare(sql).get(...params) as OutlineRow | undefined;
  }

  private findLastChapter(projectId: string): OutlineRow | undefined {
    return this.db.getDb().prepare(
      'SELECT * FROM outlines WHERE project_id = ? AND level = ? ORDER BY "order" DESC LIMIT 1',
    ).get(projectId, 'chapter') as OutlineRow | undefined;
  }

  private shiftSiblings(projectId: string, parentId: string | null, fromOrder: number, offset: number): void {
    if (offset === 0) return;
    const d = this.db.getDb();
    const now = new Date().toISOString();
    if (parentId) {
      d.prepare(`
        UPDATE outlines SET "order" = "order" + ?, updated_at = ?
        WHERE project_id = ? AND parent_id = ? AND "order" >= ?
      `).run(offset, now, projectId, parentId, fromOrder);
    } else {
      d.prepare(`
        UPDATE outlines SET "order" = "order" + ?, updated_at = ?
        WHERE project_id = ? AND parent_id IS NULL AND "order" >= ?
      `).run(offset, now, projectId, fromOrder);
    }
  }

  private writeOutlineExtensions(id: string, data: { detail?: Record<string, unknown>; attention?: Record<string, unknown>; plan?: Record<string, unknown> }): void {
    this.db.getDb().prepare(`
      UPDATE outlines
      SET detail_json = COALESCE(?, detail_json),
          attention_json = COALESCE(?, attention_json),
          plan_json = COALESCE(?, plan_json),
          updated_at = ?
      WHERE id = ?
    `).run(
      data.detail ? JSON.stringify(data.detail) : null,
      data.attention ? JSON.stringify(data.attention) : null,
      data.plan ? JSON.stringify(data.plan) : null,
      new Date().toISOString(),
      id,
    );
  }

  private buildChapterDetail(input: { title: string; order: number; targetWords: number; planning: Record<string, unknown> }) {
    const chapterWords = this.resolveChapterTargetWordsFromValue(input.targetWords);
    return {
      title: input.title,
      chapterFunction: '推进主线并制造下一章追读',
      targetWords: chapterWords,
      targetWordsRange: `${chapterWords}-${chapterWords}`,
      wordCountReason: '由本章事件量、场景复杂度与节奏人工或AI单独确定，不继承项目级固定值。',
      chapterGoal: '让主角在压力下做出选择，并暴露新的信息差。',
      openingStimulus: '按项目配置的开篇节奏出现异常、冲突、强情绪或明确代价。',
      mainScenes: ['高压开场', '冲突升级', '信息变化', '结尾钩子'],
      characters: [],
      characterActions: ['主角主动行动', '对手施压', '关键角色给出误导信息'],
      conflictDesign: '外部阻力和内部犹豫同时存在。',
      misjudgmentOrGap: '读者知道或角色误判一个关键信息。',
      payoffOrPressure: '给出爽点、压迫点或情绪兑现。',
      reversal: '结尾前出现一次小反转。',
      cost: '行动必须付出时间、关系、资源或名誉代价。',
      newForeshadowing: [],
      recoveredForeshadowing: [],
      characterStateChange: '至少一名角色的立场、关系或心理状态发生变化。',
      worldIncrement: '只新增推动本章冲突所需的规则或信息。',
      timelineProgress: `推进到第${input.order + 1}章对应事件节点。`,
      endingHook: '用未解决问题或新威胁承接下一章。',
      nextChapterBridge: '下一章承接当前选择造成的后果。',
    };
  }

  private resolveChapterTargetWords(projectId: string, explicit?: number): number {
    const direct = Number(explicit || 0);
    if (Number.isInteger(direct) && direct >= 3200 && direct <= 4000) return direct;
    const row = this.db.getDb().prepare('SELECT settings FROM projects WHERE id = ?').get(projectId) as any;
    if (!row) throw new NotFoundException(`Project ${projectId} not found`);
    throw new BadRequestException('请根据本章剧情任务、场景数量和节奏，为该章单独规划3200-4000字的目标；不得使用项目级固定单章字数。');
  }

  private resolveChapterTargetWordsFromValue(explicit?: number): number {
    const direct = Number(explicit || 0);
    if (Number.isInteger(direct) && direct >= 3200 && direct <= 4000) return direct;
    throw new BadRequestException('章节目标字数必须根据本章任务单独确定，并处于3200-4000字。');
  }

  private renderChapterDetail(detail: Record<string, any>): string {
    return [
      `章节标题：${detail.title}`,
      `章节功能：${detail.chapterFunction}`,
      `目标字数范围：${detail.targetWordsRange}`,
      `本章目标：${detail.chapterGoal}`,
      `开场刺激：${detail.openingStimulus}`,
      `主要场景：${(detail.mainScenes || []).join(' / ')}`,
      `出场人物：${(detail.characters || []).join(' / ') || '待定'}`,
      `人物行动：${(detail.characterActions || []).join(' / ')}`,
      `冲突设计：${detail.conflictDesign}`,
      `误判/信息差：${detail.misjudgmentOrGap}`,
      `爽点/压迫点：${detail.payoffOrPressure}`,
      `反转点：${detail.reversal}`,
      `代价：${detail.cost}`,
      `新增伏笔：${(detail.newForeshadowing || []).join(' / ') || '待定'}`,
      `回收伏笔：${(detail.recoveredForeshadowing || []).join(' / ') || '待定'}`,
      `角色状态变化：${detail.characterStateChange}`,
      `世界观增量：${detail.worldIncrement}`,
      `时间线推进：${detail.timelineProgress}`,
      `结尾钩子：${detail.endingHook}`,
      `下章承接：${detail.nextChapterBridge}`,
    ].join('\n');
  }

  /**
   * 章节变动后同步：调整foreshadowings和character_states中引用的章节号
   * @param projectId 项目ID
   * @param fromChapter 从第几章开始偏移
   * @param offset +1(拆分) 或 -1(删除)
   */
  private syncAfterChapterChange(projectId: string, fromChapter: number, offset: number) {
    if (offset === 0) return;
    const d = this.db.getDb();
    const now = new Date().toISOString();
    const tableExists = (table: string) => Boolean(d.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table));
    const hasColumn = (table: string, column: string) => tableExists(table)
      && (d.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(item => item.name === column);
    const shiftColumn = (table: string, column: string) => {
      if (!hasColumn(table, 'project_id') || !hasColumn(table, column)) return;
      const setUpdated = hasColumn(table, 'updated_at') ? ', updated_at = ?' : '';
      const params = setUpdated
        ? [offset, now, projectId, fromChapter]
        : [offset, projectId, fromChapter];
      d.prepare(`UPDATE ${table} SET "${column}" = "${column}" + ?${setUpdated} WHERE project_id = ? AND "${column}" >= ?`).run(...params);
    };
    this.db.transaction(() => {
      for (const column of ['buried_chapter_index', 'planned_recovery_chapter_index', 'actual_recovery_chapter_index', 'recovery_window_start', 'recovery_window_end']) {
        shiftColumn('foreshadowings', column);
      }
      shiftColumn('foreshadowing_states', 'planted_chapter');
      shiftColumn('foreshadowing_states', 'recovered_chapter');
      shiftColumn('plot_progress', 'chapter_index');
      shiftColumn('consistency_checks', 'chapter_index');
      shiftColumn('timeline_three_line_events', 'chapter_index');
      shiftColumn('character_evolution_events', 'chapter_index');
    });
  }

  /** Move a node while keeping sibling sequence unique and contiguous. */
  private moveWithSiblingOrder(existing: OutlineRow, newParentId: string | null, newOrder: number): OutlineRow | undefined {
    const d = this.db.getDb();
    const now = new Date().toISOString();
    const parentClause = (parentId: string | null) => parentId === null ? 'parent_id IS NULL' : 'parent_id = ?';
    this.db.transaction(() => {
      if (existing.parent_id === newParentId) {
        if (newOrder < existing.order) {
          const bind = existing.parent_id === null
            ? [now, newOrder, existing.order, existing.id]
            : [now, existing.parent_id, newOrder, existing.order, existing.id];
          d.prepare(`UPDATE outlines SET "order" = "order" + 1, updated_at = ?
            WHERE ${parentClause(existing.parent_id)} AND "order" >= ? AND "order" < ? AND id <> ?`).run(...bind);
        } else if (newOrder > existing.order) {
          const bind = existing.parent_id === null
            ? [now, existing.order, newOrder, existing.id]
            : [now, existing.parent_id, existing.order, newOrder, existing.id];
          d.prepare(`UPDATE outlines SET "order" = "order" - 1, updated_at = ?
            WHERE ${parentClause(existing.parent_id)} AND "order" > ? AND "order" <= ? AND id <> ?`).run(...bind);
        }
      } else {
        const oldBind = existing.parent_id === null ? [now, existing.order] : [now, existing.parent_id, existing.order];
        d.prepare(`UPDATE outlines SET "order" = "order" - 1, updated_at = ?
          WHERE ${parentClause(existing.parent_id)} AND "order" > ?`).run(...oldBind);
        const newBind = newParentId === null ? [now, newOrder] : [now, newParentId, newOrder];
        d.prepare(`UPDATE outlines SET "order" = "order" + 1, updated_at = ?
          WHERE ${parentClause(newParentId)} AND "order" >= ?`).run(...newBind);
      }
      d.prepare('UPDATE outlines SET parent_id = ?, "order" = ?, updated_at = ? WHERE id = ?')
        .run(newParentId, newOrder, now, existing.id);
    });
    return this.repo.findById(existing.id);
  }

  private assertChapterStructureEditable(projectId: string, fromChapter: number) {
    const authored = this.db.getDb().prepare(`
      SELECT chapter_index, title, status FROM chapters
      WHERE project_id = ? AND chapter_index >= ?
        AND (status <> 'draft' OR length(trim(COALESCE(content, ''))) > 0)
      ORDER BY chapter_index LIMIT 1
    `).get(projectId, fromChapter) as any;
    if (authored) {
      throw new Error(`第${authored.chapter_index}章已有正文或处于${authored.status}状态，不能自动改动章节结构；请先通过正文版本/审核流程处理。`);
    }
  }

  private shiftDraftChapters(projectId: string, fromChapter: number, offset: number) {
    if (offset === 0) return;
    const d = this.db.getDb();
    const direction = offset > 0 ? 'DESC' : 'ASC';
    const rows = d.prepare(`SELECT id, chapter_index FROM chapters WHERE project_id = ? AND chapter_index >= ? ORDER BY chapter_index ${direction}`)
      .all(projectId, fromChapter) as Array<{ id: string; chapter_index: number }>;
    const now = new Date().toISOString();
    for (const row of rows) d.prepare('UPDATE chapters SET chapter_index = ?, updated_at = ? WHERE id = ?').run(row.chapter_index + offset, now, row.id);
  }

  private insertBlankChapterForOutline(existing: OutlineRow, outlineId: string, chapterIndex: number, title: string, now: string) {
    const d = this.db.getDb();
    const linked = d.prepare('SELECT volume_index FROM chapters WHERE project_id = ? AND outline_id = ?').get(existing.project_id, existing.id) as any;
    d.prepare(`INSERT INTO chapters (id, project_id, outline_id, volume_index, chapter_index, title, content, word_count, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '', 0, 'draft', ?, ?)`)
      .run(uuid(), existing.project_id, outlineId, Number(linked?.volume_index || 1), chapterIndex, title, now, now);
  }

  private syncBlankChapterOrder(projectId: string) {
    const d = this.db.getDb();
    const rows = d.prepare(`
      SELECT chapter.id, COALESCE(parent."order", 0) + 1 AS volume_index
      FROM chapters chapter
      LEFT JOIN outlines outline ON outline.id = chapter.outline_id
      LEFT JOIN outlines parent ON parent.id = outline.parent_id
      WHERE chapter.project_id = ?
      ORDER BY COALESCE(parent."order", 0), COALESCE(outline."order", chapter.chapter_index), chapter.created_at, chapter.id
    `).all(projectId) as Array<{ id: string; volume_index: number }>;
    const now = new Date().toISOString();
    this.db.transaction(() => {
      for (let index = 0; index < rows.length; index += 1) {
        d.prepare('UPDATE chapters SET chapter_index = ?, updated_at = ? WHERE id = ?').run(-(index + 1), now, rows[index].id);
      }
      for (let index = 0; index < rows.length; index += 1) {
        d.prepare('UPDATE chapters SET chapter_index = ?, volume_index = ?, updated_at = ? WHERE id = ?')
          .run(index + 1, rows[index].volume_index, now, rows[index].id);
      }
    });
  }

  private analyzeStateImpact(existing: OutlineRow, dto: UpdateOutlineDto) {
    if (!this.stateItemService) return;
    const targetType = existing.level === 'volume'
      ? 'volume'
      : existing.level === 'chapter'
        ? 'chapter_plan'
        : 'outline';
    const priority = targetType === 'outline' ? 'book_outline' : targetType;
    this.stateItemService.analyzeImpactTracked(existing.project_id, {
        targetType,
        targetId: existing.id,
        summary: `${targetType === 'volume' ? '分卷' : targetType === 'chapter_plan' ? '章节规划' : '总纲'}修改影响分析`,
        payload: {
          before: this.toResponse(existing),
          after: dto,
          priority,
          affects: targetType === 'outline'
            ? ['volume', 'chapter_plan', 'chapter']
            : targetType === 'volume'
              ? ['chapter_plan', 'chapter']
              : ['chapter'],
        },
    });
  }

  private analyzeOperationImpact(existing: OutlineRow, operation: string, extra?: Record<string, unknown>) {
    if (!this.stateItemService) return;
    const targetType = existing.level === 'volume'
      ? 'volume'
      : existing.level === 'chapter'
        ? 'chapter_plan'
        : 'outline';
    const priority = targetType === 'outline' ? 'book_outline' : targetType;
    this.stateItemService.analyzeImpactTracked(existing.project_id, {
        targetType,
        targetId: existing.id,
        summary: `${operation}: ${existing.title || existing.level} 结构变更影响分析`,
        payload: {
          operation,
          before: this.toResponse(existing),
          after: { ...(extra || {}) },
          priority,
          affects: targetType === 'outline'
            ? ['volume', 'chapter_plan', 'chapter']
            : targetType === 'volume'
              ? ['chapter_plan', 'chapter']
              : ['chapter'],
        },
    });
  }

  findChildren(id: string): OutlineResponse[] {
    return this.repo.findChildren(id).map((r) => this.toResponse(r));
  }

  private toResponse(row: OutlineRow & { children?: OutlineRow[] }): OutlineResponse {
    const result: OutlineResponse = {
      id: row.id,
      projectId: row.project_id,
      level: row.level,
      parentId: row.parent_id || undefined,
      order: row.order,
      title: row.title,
      content: row.content,
      chapterFunction: row.chapter_function,
      goalArc: row.goal_arc,
      targetWords: row.target_words,
      actualWords: row.actual_words || undefined,
      foreshadowingIds: JSON.parse(row.foreshadowing_ids),
      plotPoints: JSON.parse(row.plot_points),
      scenes: safeJson(row as any, 'scenes', null),
      volumes: safeJson(row as any, 'volumes', null),
      bookSkeleton: safeJson(row as any, 'book_skeleton', null),
      status: row.status,
      characterIds: JSON.parse(row.character_ids),
      detail: safeJson(row as any, 'detail_json', {}),
      attention: safeJson(row as any, 'attention_json', {}),
      plan: safeJson(row as any, 'plan_json', {}),
      children: row.children ? row.children.map((c) => this.toResponse(c as any)) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return result;
  }
}

function safeJson(row: Record<string, any>, key: string, fallback: any) {
  try {
    return JSON.parse(row[key] || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}
