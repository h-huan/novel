/**
 * 大纲 Service
 */
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
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

    this.repo.insert({
      id,
      project_id: projectId,
      level: dto.level || 'chapter',
      parent_id: dto.parentId || null,
      order: dto.order || 0,
      title: dto.title,
      content: dto.content || '',
      chapter_function: dto.chapterFunction || 'breathing',
      goal_arc: dto.goalArc || 'crisis_resolve',
      target_words: dto.targetWords || 3000,
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

    return this.toResponse(this.repo.findById(id)!);
  }

  findByProjectId(projectId: string): OutlineResponse[] {
    return this.repo.findByProjectId(projectId).map((r) => this.toResponse(r));
  }

  getTree(projectId: string): OutlineResponse[] {
    return this.repo.getTree(projectId).map((r) => this.toResponse(r));
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
    if (dto.targetWords !== undefined) updateData.target_words = dto.targetWords;
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
    this.repo.delete(id);
    // 后续章节号前移
    const siblings = this.repo.findChildren(existing.parent_id || '') || [];
    for (const sib of siblings.filter(s => s.order > order)) {
      this.repo.update(sib.id, { order: sib.order - 1, updated_at: new Date().toISOString() });
    }
    // 状态同步
    this.syncAfterChapterChange(existing.project_id, order + 1, -1);
    this.analyzeOperationImpact(existing, 'remove');
    return { success: true };
  }

  move(id: string, dto: MoveOutlineDto): OutlineResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);

    const row = this.repo.moveNode(id, dto.newParentId || null, dto.newOrder);
    this.analyzeOperationImpact(existing, 'move', { newParentId: dto.newParentId, newOrder: dto.newOrder });
    return this.toResponse(row!);
  }

  reorderChildren(id: string, dto: { orderedIds: string[] }): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);
    this.repo.reorderChildren(id, dto.orderedIds);
    this.analyzeOperationImpact(existing, 'reorder', { orderedIds: dto.orderedIds });
    return { success: true };
  }

  /**
   * 拆分章节：在当前位置创建一个新章节，原章节保留前半部分
   * 后续章节顺序自动后移
   */
  split(id: string, dto: { newTitle: string; newContent?: string; splitPoint?: number }): { original: OutlineResponse; new: OutlineResponse } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);

    const now = new Date().toISOString();
    const newId = uuid();
    const newOrder = existing.order + 1;
    const splitPoint = dto.splitPoint ?? Math.floor((existing.content?.length || 100) / 2);

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
      target_words: Math.floor(existing.target_words / 2),
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
      target_words: Math.floor(existing.target_words / 2),
      updated_at: now,
    });

    // 后续章节顺序后移
    const siblings = this.repo.findChildren(existing.parent_id || '');
    const toShift = siblings.filter(s => s.order > existing.order && s.id !== newId);
    for (const sib of toShift) {
      this.repo.update(sib.id, { order: sib.order + 1, updated_at: now });
    }

    // 状态同步：更新伏笔和角色状态中引用的章节号
    this.syncAfterChapterChange(existing.project_id, existing.order + 1, 1);
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
    this.shiftSiblings(existing.project_id, existing.parent_id, newOrder, 1);

    const detail = this.buildChapterDetail({
      title: dto.title || `新章节 ${newOrder + 1}`,
      order: newOrder,
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
      target_words: existing.target_words || 3000,
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
    this.syncAfterChapterChange(existing.project_id, newOrder + 1, 1);
    this.analyzeOperationImpact(existing, 'insert', { position: dto.position, newOrder });
    return this.toResponse(this.repo.findById(newId)!);
  }

  mergeNext(id: string): OutlineResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Outline ${id} not found`);
    if (existing.status === 'locked') throw new Error('Locked outline cannot be merged');
    const next = this.findSiblingByOrder(existing.project_id, existing.parent_id, existing.order + 1);
    if (!next) throw new NotFoundException('Next outline chapter not found');
    if (next.status === 'locked') throw new Error('Locked outline cannot be merged');

    const now = new Date().toISOString();
    this.repo.update(existing.id, {
      title: `${existing.title} / ${next.title}`,
      content: `${existing.content || ''}\n\n${next.content || ''}`.trim(),
      target_words: (existing.target_words || 0) + (next.target_words || 0),
      updated_at: now,
    });
    this.repo.delete(next.id);
    this.shiftSiblings(existing.project_id, existing.parent_id, next.order + 1, -1);
    this.syncAfterChapterChange(existing.project_id, next.order + 1, -1);
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
    this.syncAfterChapterChange(existing.project_id, Math.min(existing.order, targetOrder) + 1, 0);
    this.analyzeOperationImpact(existing, `move_${direction}`, { swappedWith: sibling.id });
    return this.toResponse(this.repo.findById(existing.id)!);
  }

  continueCreate(projectId: string, dto: ContinueOutlineDto): { success: boolean; outlines: OutlineResponse[]; plan: Record<string, unknown> } {
    const count = Math.min(Math.max(Number(dto.count || 1) || 1, 1), 20);
    const base = dto.fromOutlineId
      ? this.repo.findById(dto.fromOutlineId)
      : this.findLastChapter(projectId);
    const plan = this.recommendPlan(projectId, { planning: dto.planning || {} });
    const parentId = base?.parent_id || null;
    let order = (base?.order ?? -1) + 1;
    const created: OutlineResponse[] = [];
    for (let i = 0; i < count; i++) {
      const title = `续写细纲 ${order + 1}`;
      const detail = this.buildChapterDetail({ title, order, planning: plan });
      const createdNode = this.create(projectId, {
        title,
        level: 'chapter',
        parentId: parentId || undefined,
        order,
        content: this.renderChapterDetail(detail),
        targetWords: Number((plan as any).chapterWords?.recommended || 3000),
      });
      this.writeOutlineExtensions(createdNode.id, { detail, plan });
      created.push(this.findOne(createdNode.id));
      order++;
    }
    return { success: true, outlines: created, plan };
  }

  recommendPlan(projectId: string, dto: RecommendOutlinePlanDto): Record<string, unknown> {
    const d = this.db.getDb();
    const project = d.prepare(
      'SELECT title, type, target_words, platform_style, description FROM projects WHERE id = ?',
    ).get(projectId) as { title: string; type: string; target_words: number; platform_style: string; description: string } | undefined;
    const workScale = dto.workScale || (project?.target_words && project.target_words <= 50000 ? 'short_story' : 'long');
    const isShort = workScale.includes('short') || project?.type?.includes('short');
    const target = Number(project?.target_words || 0);
    const recommendedWords = isShort
      ? (target > 0 ? target : 12000)
      : target > 0
        ? target
        : workScale === 'ultra_long' ? 1200000 : workScale === 'long' ? 600000 : 180000;
    const chapterWords = isShort ? 1800 : project?.platform_style === 'web' ? 3500 : 2800;
    const chapters = Math.max(1, Math.ceil(recommendedWords / chapterWords));
    const volumes = isShort ? 1 : Math.max(1, Math.ceil(chapters / 28));
    return {
      workScale,
      targetWordsRange: dto.targetWordsRange || `${Math.round(recommendedWords * 0.8)}-${Math.round(recommendedWords * 1.2)}`,
      chapterWords: { mode: 'ai_recommended', recommended: chapterWords, range: `${Math.round(chapterWords * 0.8)}-${Math.round(chapterWords * 1.2)}` },
      volumes: { mode: 'ai_recommended', recommended: volumes },
      chaptersPerVolume: { mode: 'dynamic', recommended: Math.ceil(chapters / volumes) },
      updatePlan: (dto.planning as any)?.updatePlan || '根据目标规模动态安排',
      generateCounts: [1, 2, 5, 10],
      shortStoryFlow: isShort ? ['题材钩子', '完整第一人称大纲', '递进反转表', '伏笔回收表', '每章天龙8步法', '前300-500字强吸引'] : [],
      ultraLongReference: {
        note: '超长篇可参考 200万字、8卷、每卷约50章、每章4000-5000字，但不会作为固定默认值。',
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

  private buildChapterDetail(input: { title: string; order: number; planning: Record<string, unknown> }) {
    const chapterWords = Number((input.planning as any)?.chapterWords?.recommended || 3000);
    return {
      title: input.title,
      chapterFunction: '推进主线并制造下一章追读',
      targetWordsRange: `${Math.round(chapterWords * 0.8)}-${Math.round(chapterWords * 1.2)}`,
      chapterGoal: '让主角在压力下做出选择，并暴露新的信息差。',
      openingStimulus: '前300-500字必须出现异常、冲突、强情绪或明确代价。',
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
    try {
      const d = this.db.getDb();
      // 同步 foreshadowings 表中的章节索引
      d.prepare(`
        UPDATE foreshadowings SET buried_chapter_index = buried_chapter_index + ?,
          planned_recovery_chapter_index = CASE WHEN planned_recovery_chapter_index >= ? THEN planned_recovery_chapter_index + ? ELSE planned_recovery_chapter_index END,
          updated_at = ?
        WHERE project_id = ? AND buried_chapter_index >= ?
      `).run(offset, fromChapter, offset, new Date().toISOString(), projectId, fromChapter);
    } catch {
      // 状态同步失败不影响主流程
    }
  }

  private analyzeStateImpact(existing: OutlineRow, dto: UpdateOutlineDto) {
    if (!this.stateItemService) return;
    const targetType = existing.level === 'volume'
      ? 'volume'
      : existing.level === 'chapter'
        ? 'chapter_plan'
        : 'outline';
    const priority = targetType === 'outline' ? 'book_outline' : targetType;
    try {
      this.stateItemService.analyzeImpact(existing.project_id, {
        targetType,
        targetId: existing.id,
        summary: `${targetType === 'volume' ? '分卷' : targetType === 'chapter_plan' ? '章节规划' : '总纲'}修改影响分析`,
        payload: {
          before: {
            title: existing.title,
            content: existing.content,
            level: existing.level,
            order: existing.order,
          },
          after: dto,
          priority,
          affects: targetType === 'outline'
            ? ['volume', 'chapter_plan', 'chapter']
            : targetType === 'volume'
              ? ['chapter_plan', 'chapter']
              : ['chapter'],
        },
      });
    } catch {
      // 影响分析失败不能阻断大纲保存
    }
  }

  private analyzeOperationImpact(existing: OutlineRow, operation: string, extra?: Record<string, unknown>) {
    if (!this.stateItemService) return;
    const targetType = existing.level === 'volume'
      ? 'volume'
      : existing.level === 'chapter'
        ? 'chapter_plan'
        : 'outline';
    const priority = targetType === 'outline' ? 'book_outline' : targetType;
    try {
      this.stateItemService.analyzeImpact(existing.project_id, {
        targetType,
        targetId: existing.id,
        summary: `${operation}: ${existing.title || existing.level} 结构变更影响分析`,
        payload: {
          operation,
          before: { title: existing.title, content: existing.content, level: existing.level, order: existing.order, parentId: existing.parent_id },
          after: { ...(extra || {}) },
          priority,
          affects: targetType === 'outline'
            ? ['volume', 'chapter_plan', 'chapter']
            : targetType === 'volume'
              ? ['chapter_plan', 'chapter']
              : ['chapter'],
        },
      });
    } catch {
      // 影响分析失败不能阻断主操作
    }
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
