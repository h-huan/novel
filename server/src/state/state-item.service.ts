import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { WRITING_QUALITY_TAGS } from './writing-quality-tags';

type StateStatus = 'pending' | 'confirmed' | 'rejected' | 'archived' | 'conflict' | 'stale';

interface StateItemInput {
  sourceType?: string;
  sourceId?: string | null;
  sourceChapterId?: string | null;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  stateKey?: string | null;
  title?: string | null;
  summary: string;
  content?: string | null;
  payload?: Record<string, unknown>;
  status?: StateStatus;
  authority?: string;
  source?: string;
  confidence?: number;
  tags?: string[];
  impactScope?: string[];
  createdBy?: string;
}

@Injectable()
export class StateItemService {
  private readonly logger = new Logger(StateItemService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  list(projectId: string, query: { status?: string; targetType?: string; limit?: string | number } = {}) {
    const db = this.databaseService.getDb();
    const limit = Math.min(Math.max(Number(query.limit || 200) || 200, 1), 500);
    const clauses = ['project_id = ?'];
    const params: any[] = [projectId];

    if (query.status && query.status !== 'all') {
      clauses.push('status = ?');
      params.push(query.status);
    }
    if (query.targetType && query.targetType !== 'all') {
      clauses.push('target_type = ?');
      params.push(query.targetType);
    }

    const rows = db.prepare(`
      SELECT * FROM state_items
      WHERE ${clauses.join(' AND ')}
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?
    `).all(...params, limit) as any[];

    return rows.map(row => this.mapStateItem(row));
  }

  get(projectId: string, id: string) {
    const row = this.databaseService.getDb().prepare(`
      SELECT * FROM state_items WHERE project_id = ? AND id = ?
    `).get(projectId, id) as any;
    if (!row) throw new NotFoundException('State item not found');
    return this.mapStateItem(row);
  }

  create(projectId: string, input: StateItemInput) {
    const db = this.databaseService.getDb();
    const now = new Date().toISOString();
    const summary = String(input.summary || '').trim();
    if (!summary) throw new BadRequestException('State summary is required');

    const targetType = this.normalizeTargetType(input.targetType);
    const summaryHash = this.hashSummary(summary);
    const existing = db.prepare(`
      SELECT * FROM state_items
      WHERE project_id = ? AND target_type = ? AND IFNULL(target_id, '') = IFNULL(?, '') AND summary_hash = ?
      LIMIT 1
    `).get(projectId, targetType, input.targetId || null, summaryHash) as any;
    if (existing) {
      // active 状态（pending / confirmed / conflict / stale）命中去重时，直接返回已有项
      if (existing.status !== 'rejected' && existing.status !== 'archived') return this.mapStateItem(existing);
      // rejected / archived 命中时，复活旧记录而非 INSERT（避免唯一索引冲突）
      return this.reviveExcludedStateItem(projectId, existing, input, targetType, summary, summaryHash, now);
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO state_items (
        id, project_id, source_type, source_id, source_chapter_id, target_type, target_id, target_label,
        state_key, title, summary, content, payload, status, authority, source, confidence, tags,
        impact_scope, summary_hash, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      projectId,
      input.sourceType || 'ai',
      input.sourceId || null,
      input.sourceChapterId || null,
      targetType,
      input.targetId || null,
      input.targetLabel || input.title || targetType,
      input.stateKey || null,
      input.title || input.targetLabel || targetType,
      summary,
      input.content || summary,
      JSON.stringify(input.payload || {}),
      input.status || 'pending',
      input.authority || this.authorityForStatus(input.status || 'pending'),
      input.source || 'ai_extracted',
      input.confidence ?? 0.6,
      JSON.stringify(input.tags || []),
      JSON.stringify(input.impactScope || []),
      summaryHash,
      input.createdBy || 'system',
      now,
      now,
    );

    const item = this.get(projectId, id);
    this.createCharacterEvolutionFromItem(projectId, item);
    return item;
  }

  /**
   * 复活被排除的状态项（rejected / archived）
   * 将旧记录 UPDATE 回 pending，而非 INSERT 新行，避免唯一索引冲突。
   * 复活后状态变为 pending + soft_candidate，重新进入写作上下文候选池。
   */
  private reviveExcludedStateItem(projectId: string, existing: any, input: StateItemInput, targetType: string, summary: string, summaryHash: string, now: string) {
    const db = this.databaseService.getDb();
    const isArchived = existing.status === 'archived';
    const oldPayload = this.parseJson(existing.payload, {});
    const mergedPayload = {
      ...oldPayload,
      ...(input.payload || {}),
      previousStatus: existing.status,
      revivedAt: now,
      ...(isArchived ? { reusedFromArchived: true } : { reusedFromRejected: true }),
    };

    db.prepare(`
      UPDATE state_items
      SET source_type = ?, source_id = ?, source_chapter_id = ?,
          target_label = ?, state_key = ?, title = ?,
          summary = ?, content = ?, payload = ?,
          status = 'pending', authority = 'soft_candidate',
          source = ?, confidence = ?, tags = ?, impact_scope = ?,
          summary_hash = ?, created_by = ?,
          rejected_by = NULL, rejected_at = NULL, archived_at = NULL,
          updated_at = ?
      WHERE project_id = ? AND id = ?
    `).run(
      input.sourceType || 'ai',
      input.sourceId || null,
      input.sourceChapterId || null,
      input.targetLabel || input.title || targetType,
      input.stateKey || null,
      input.title || input.targetLabel || targetType,
      summary,
      input.content || summary,
      JSON.stringify(mergedPayload),
      input.source || 'ai_extracted',
      input.confidence ?? 0.6,
      JSON.stringify(input.tags || []),
      JSON.stringify(input.impactScope || []),
      summaryHash,
      input.createdBy || 'system',
      now,
      projectId,
      existing.id,
    );

    const item = this.get(projectId, existing.id);
    this.createCharacterEvolutionFromItem(projectId, item);
    return item;
  }

  update(projectId: string, id: string, body: Partial<StateItemInput>) {
    this.get(projectId, id);
    const db = this.databaseService.getDb();
    const current = this.get(projectId, id);
    const summary = body.summary !== undefined ? String(body.summary || '').trim() : current.summary;
    const targetType = body.targetType ? this.normalizeTargetType(body.targetType) : current.targetType;

    db.prepare(`
      UPDATE state_items
      SET target_type = ?, target_id = ?, target_label = ?, state_key = ?, title = ?,
          summary = ?, content = ?, payload = ?, tags = ?, impact_scope = ?,
          summary_hash = ?, updated_at = datetime('now')
      WHERE project_id = ? AND id = ?
    `).run(
      targetType,
      body.targetId !== undefined ? body.targetId || null : current.targetId,
      body.targetLabel !== undefined ? body.targetLabel || null : current.targetLabel,
      body.stateKey !== undefined ? body.stateKey || null : current.stateKey,
      body.title !== undefined ? body.title || null : current.title,
      summary,
      body.content !== undefined ? body.content || null : current.content,
      JSON.stringify(body.payload || current.payload || {}),
      JSON.stringify(body.tags || current.tags || []),
      JSON.stringify(body.impactScope || current.impactScope || []),
      this.hashSummary(summary),
      projectId,
      id,
    );

    return this.get(projectId, id);
  }

  confirm(projectId: string, id: string, confirmedBy = 'author') {
    const item = this.get(projectId, id);
    const db = this.databaseService.getDb();
    db.exec('BEGIN');
    try {
      db.prepare(`
        UPDATE state_items
        SET status = 'confirmed', authority = 'hard_fact', confirmed_by = ?, confirmed_at = datetime('now'), updated_at = datetime('now')
        WHERE project_id = ? AND id = ?
      `).run(confirmedBy, projectId, id);

      const writeback = this.writeBackCanonical(projectId, item, confirmedBy);
      db.prepare(`
        UPDATE character_evolution_events
        SET status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now')
        WHERE project_id = ? AND source_state_item_id = ?
      `).run(projectId, id);
      db.exec('COMMIT');
      return { ...this.get(projectId, id), writeback };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  reject(projectId: string, id: string, rejectedBy = 'author') {
    this.get(projectId, id);
    const db = this.databaseService.getDb();
    db.prepare(`
      UPDATE state_items
      SET status = 'rejected', authority = 'excluded', rejected_by = ?, rejected_at = datetime('now'), updated_at = datetime('now')
      WHERE project_id = ? AND id = ?
    `).run(rejectedBy, projectId, id);
    db.prepare(`
      UPDATE character_evolution_events
      SET status = 'rejected', updated_at = datetime('now')
      WHERE project_id = ? AND source_state_item_id = ?
    `).run(projectId, id);
    return this.get(projectId, id);
  }

  archive(projectId: string, id: string) {
    this.get(projectId, id);
    this.databaseService.getDb().prepare(`
      UPDATE state_items
      SET status = 'archived', authority = 'excluded', archived_at = datetime('now'), updated_at = datetime('now')
      WHERE project_id = ? AND id = ?
    `).run(projectId, id);
    return this.get(projectId, id);
  }

  createFromArchive(projectId: string, sourceChapterId: string, archive: any, sourceMode = 'generated_body') {
    const groups = [
      { key: 'worldSettingUpdates', type: 'world_setting', label: '世界观', tags: ['world'] },
      { key: 'characterUpdates', type: 'character', label: '角色', tags: ['character'] },
      { key: 'organizationUpdates', type: 'organization', label: '组织', tags: ['organization'] },
      { key: 'outlineUpdates', type: 'outline', label: '大纲', tags: ['outline'] },
      { key: 'foreshadowingUpdates', type: 'foreshadowing', label: '伏笔', tags: ['foreshadowing'] },
      { key: 'timelineUpdates', type: 'timeline_state', label: '时间线', tags: ['timeline'] },
      { key: 'conflicts', type: 'plot_logic', label: '潜在冲突', tags: ['conflict'] },
    ];

    const created: any[] = [];
    for (const group of groups) {
      const items = Array.isArray(archive?.[group.key]) ? archive[group.key] : [];
      for (const item of items) {
        const target = this.resolveTarget(projectId, sourceChapterId, group.type, item);
        created.push(this.create(projectId, {
          sourceType: 'post_write_archive',
          sourceId: sourceChapterId,
          sourceChapterId,
          targetType: group.type,
          targetId: target.id,
          targetLabel: target.label || item.title || group.label,
          title: item.title || group.label,
          summary: `${item.title || group.label}: ${item.summary || item.content || ''}`,
          content: item.summary || item.content || '',
          payload: { ...item, matchedTarget: target, sourceMode },
          status: group.type === 'plot_logic' ? 'conflict' : 'pending',
          tags: group.tags,
          source: 'ai_archive',
          createdBy: 'post_write_archive',
        }));
      }
    }
    return created;
  }

  createFromExtractedStates(projectId: string, sourceChapterId: string | null | undefined, extractedStates: any[] = []) {
    return extractedStates.map(state => this.create(projectId, {
      sourceType: 'state_extract',
      sourceId: sourceChapterId || null,
      sourceChapterId: sourceChapterId || null,
      targetType: this.normalizeTargetType(state.type || state.targetType || 'plot'),
      targetId: state.id || state.targetId || null,
      targetLabel: state.label || state.name || state.id || state.type || '状态',
      title: state.label || state.name || state.type || '状态更新',
      summary: this.summarizeExtractedState(state),
      content: this.summarizeExtractedState(state),
      payload: state,
      tags: [String(state.type || 'state')],
      source: 'ai_extract',
      createdBy: 'state_extract',
    }));
  }

  buildWritingStateContext(projectId: string, chapterNumber?: number) {
    const db = this.databaseService.getDb();
    const rows = db.prepare(`
      SELECT * FROM state_items
      WHERE project_id = ? AND status IN ('confirmed', 'pending', 'conflict', 'stale')
      ORDER BY
        CASE status WHEN 'confirmed' THEN 1 WHEN 'pending' THEN 2 WHEN 'conflict' THEN 3 ELSE 4 END,
        updated_at DESC
      LIMIT 120
    `).all(projectId) as any[];

    const grouped = {
      confirmed: rows.filter(row => row.status === 'confirmed').map(row => this.mapStateItem(row)),
      pending: rows.filter(row => row.status === 'pending').map(row => this.mapStateItem(row)),
      conflict: rows.filter(row => row.status === 'conflict').map(row => this.mapStateItem(row)),
      stale: rows.filter(row => row.status === 'stale').map(row => this.mapStateItem(row)),
    };

    const contextSections = [
      this.formatContextSection('【已确稿状态｜必须遵守】', grouped.confirmed.filter(item => item.authority === 'hard_fact').slice(0, 40)),
      this.formatContextSection('【待确认状态｜可参考但不要写死】', grouped.pending.filter(item => item.authority === 'soft_candidate').slice(0, 25)),
      this.formatContextSection('【冲突提醒｜需要避免】', grouped.conflict.filter(item => item.authority === 'warning').slice(0, 15)),
      this.formatContextSection('【过期风险｜需要复核】', grouped.stale.filter(item => item.authority === 'warning').slice(0, 15)),
    ].filter(Boolean);

    const legacy = this.buildLegacyConfirmedContext(projectId, chapterNumber, grouped.pending);
    return {
      contextText: [legacy, ...contextSections].filter(Boolean).join('\n\n'),
      confirmed: grouped.confirmed,
      pending: grouped.pending,
      conflict: grouped.conflict,
      stale: grouped.stale,
      pendingTotal: grouped.pending.length,
      pendingSummary: grouped.pending.slice(0, 10).map(item => `${item.targetLabel}: ${item.summary}`),
      stateGuard: '已确稿 hard_fact 必须遵守。待确认 soft_candidate 只能参考, 不要写死。冲突/过期 warning 需要避免或复核。若提示角色不会自然做出某选择, 必须补充动机、事件或过渡剧情。',
    };
  }

  analyzeImpact(projectId: string, body: {
    sourceStateItemId?: string;
    targetType?: string;
    targetId?: string;
    summary?: string;
    payload?: Record<string, unknown>;
    createdBy?: string;
  }) {
    const db = this.databaseService.getDb();
    const sourceItem = body.sourceStateItemId
      ? db.prepare('SELECT * FROM state_items WHERE project_id = ? AND id = ?').get(projectId, body.sourceStateItemId) as any
      : null;
    const targetType = this.normalizeTargetType(body.targetType || sourceItem?.target_type || 'state');
    const targetId = body.targetId || sourceItem?.target_id || null;
    const summary = body.summary || sourceItem?.summary || '手动状态修改影响分析';
    const related = db.prepare(`
      SELECT * FROM state_items
      WHERE project_id = ? AND id != IFNULL(?, '') AND status IN ('pending', 'confirmed')
        AND (target_type = ? OR IFNULL(target_id, '') = IFNULL(?, ''))
      ORDER BY updated_at DESC
      LIMIT 30
    `).all(projectId, body.sourceStateItemId || '', targetType, targetId) as any[];

    const items: any[] = related.map(row => ({
      id: randomUUID(),
      impactType: row.status === 'confirmed' ? 'may_make_confirmed_state_stale' : 'candidate_needs_review',
      targetType: row.target_type,
      targetId: row.target_id,
      targetLabel: row.target_label,
      summary: `${row.target_label || row.target_type} 可能受影响: ${row.summary}`,
      severity: row.status === 'confirmed' ? 'high' : 'medium',
      actionHint: row.status === 'confirmed' ? '请复核后标记为过期或重新确认' : '请在状态确稿中心确认或驳回',
      payload: { relatedStateItemId: row.id, sourceStatus: row.status },
    }));

    const chapterImpacts = this.buildChapterImpactItems(projectId, targetType, targetId);
    items.push(...chapterImpacts);

    const hasLockedChapter = this.hasLockedChapter(projectId, sourceItem?.source_chapter_id || body.payload?.sourceChapterId as string | undefined);
    if (hasLockedChapter) {
      items.push({
        id: randomUUID(),
        impactType: 'blocked_by_locked_chapter',
        targetType: 'chapter',
        targetId: sourceItem?.source_chapter_id || String(body.payload?.sourceChapterId || ''),
        targetLabel: '已锁定章节',
        summary: '相关章节已锁定, 自动应用修改被阻止',
        severity: 'high',
        actionHint: '解锁章节或手动处理后再应用影响项',
        payload: {},
      });
    }

    const riskLevel = items.some(item => item.severity === 'high') ? 'high' : items.length > 0 ? 'medium' : 'low';
    const reportId = randomUUID();
    db.exec('BEGIN');
    try {
      db.prepare(`
        INSERT INTO state_impact_reports (
          id, project_id, source_state_item_id, source_type, summary, risk_level, status, created_by, payload
        ) VALUES (?, ?, ?, 'manual_edit', ?, ?, 'open', ?, ?)
      `).run(reportId, projectId, body.sourceStateItemId || null, summary, riskLevel, body.createdBy || 'author', JSON.stringify(body.payload || {}));

      const insertItem = db.prepare(`
        INSERT INTO state_impact_items (
          id, report_id, project_id, impact_type, target_type, target_id, target_label,
          summary, severity, status, action_hint, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `);
      for (const item of items) {
        insertItem.run(
          item.id,
          reportId,
          projectId,
          item.impactType,
          item.targetType,
          item.targetId,
          item.targetLabel,
          item.summary,
          item.severity,
          item.actionHint,
          JSON.stringify(item.payload || {}),
        );
      }

      for (const row of related.filter(row => row.status === 'confirmed')) {
        db.prepare(`
          UPDATE state_items SET status = 'stale', authority = 'warning', updated_at = datetime('now')
          WHERE project_id = ? AND id = ?
        `).run(projectId, row.id);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return this.getImpactReport(projectId, reportId);
  }

  listImpactReports(projectId: string, limit = 100) {
    const db = this.databaseService.getDb();
    const rows = db.prepare(`
      SELECT * FROM state_impact_reports
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(projectId, Math.min(Math.max(limit, 1), 300)) as any[];
    return rows.map(row => this.mapImpactReport(row));
  }

  getImpactReport(projectId: string, reportId: string) {
    const db = this.databaseService.getDb();
    const report = db.prepare('SELECT * FROM state_impact_reports WHERE project_id = ? AND id = ?')
      .get(projectId, reportId) as any;
    if (!report) throw new NotFoundException('Impact report not found');
    const items = db.prepare(`
      SELECT * FROM state_impact_items
      WHERE project_id = ? AND report_id = ?
      ORDER BY created_at ASC
    `).all(projectId, reportId) as any[];
    return { ...this.mapImpactReport(report), items: items.map(row => this.mapImpactItem(row)) };
  }

  applyImpactItem(projectId: string, itemId: string) {
    const db = this.databaseService.getDb();
    const item = db.prepare('SELECT * FROM state_impact_items WHERE project_id = ? AND id = ?')
      .get(projectId, itemId) as any;
    if (!item) throw new NotFoundException('Impact item not found');
    if (item.impact_type === 'blocked_by_locked_chapter') {
      throw new BadRequestException('相关章节已锁定, 不能自动应用该影响项');
    }
    db.prepare(`
      UPDATE state_impact_items
      SET status = 'applied', applied_at = datetime('now'), updated_at = datetime('now')
      WHERE project_id = ? AND id = ?
    `).run(projectId, itemId);
    return this.mapImpactItem({ ...item, status: 'applied', applied_at: new Date().toISOString() });
  }

  getCharacterEvolution(projectId: string, characterId: string) {
    const rows = this.databaseService.getDb().prepare(`
      SELECT * FROM character_evolution_events
      WHERE project_id = ? AND (character_id = ? OR character_name = ?)
      ORDER BY COALESCE(chapter_index, 999999), created_at ASC
    `).all(projectId, characterId, characterId) as any[];
    return rows.map(row => ({
      id: row.id,
      projectId: row.project_id,
      characterId: row.character_id,
      characterName: row.character_name,
      sourceStateItemId: row.source_state_item_id,
      sourceChapterId: row.source_chapter_id,
      chapterIndex: row.chapter_index,
      eventType: row.event_type,
      title: row.title,
      summary: row.summary,
      beforeState: this.parseJson(row.before_state, {}),
      afterState: this.parseJson(row.after_state, {}),
      delta: this.parseJson(row.delta, {}),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      confirmedAt: row.confirmed_at,
    }));
  }

  createFromManualChapterEdit(projectId: string, chapterId: string, beforeContent: string, afterContent: string) {
    const facts = this.extractManualChapterFacts(afterContent || '', beforeContent || '');
    const created = facts.map(fact => this.create(projectId, {
      sourceType: 'manual_chapter_edit',
      sourceId: chapterId,
      sourceChapterId: chapterId,
      targetType: fact.targetType,
      targetLabel: fact.targetLabel,
      title: fact.title,
      summary: fact.summary,
      content: fact.evidence,
      payload: { evidenceEvent: fact.evidence, manualEdit: true },
      tags: fact.tags,
      status: 'pending',
      authority: 'soft_candidate',
      source: 'manual_edit_extract',
      createdBy: 'manual_edit',
    }));
    const impactReport = this.analyzeImpact(projectId, {
      targetType: 'chapter',
      targetId: chapterId,
      summary: `未锁定正文修改影响分析: ${created.length} 项状态候选`,
      payload: { sourceChapterId: chapterId, stateItemIds: created.map(item => item.id), canAutoSync: true, needsReview: created.length > 0 },
    });
    return { created, impactReport };
  }

  private createCharacterEvolutionFromItem(projectId: string, item: any) {
    if (item.targetType !== 'character' && !item.tags.includes('character')) return;
    const db = this.databaseService.getDb();
    const chapter = item.sourceChapterId
      ? db.prepare('SELECT chapter_index FROM chapters WHERE project_id = ? AND id = ?').get(projectId, item.sourceChapterId) as any
      : null;
    const evolutionPayload = this.buildCharacterEvolutionPayload(item);
    // 尝试获取前一个状态作为 before_state
    const prevEvent = item.targetId ? db.prepare(`
      SELECT id, delta, after_state FROM character_evolution_events
      WHERE project_id = ? AND character_id = ?
      ORDER BY COALESCE(chapter_index, 999999) DESC, created_at DESC
      LIMIT 1
    `).get(projectId, item.targetId) as any : null;
    const beforeState = prevEvent?.after_state || '{}';
    // 当前状态作为 after_state（如果无法推断则写空对象）
    const afterState = JSON.stringify({ summary: item.summary, content: item.content, changedAt: new Date().toISOString() });
    db.prepare(`
      INSERT INTO character_evolution_events (
        id, project_id, character_id, character_name, source_state_item_id, source_chapter_id,
        chapter_index, event_type, title, summary, before_state, after_state, delta, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      projectId,
      item.targetId || null,
      item.targetLabel || item.title || null,
      item.id,
      item.sourceChapterId || null,
      chapter?.chapter_index || null,
      'state_change',
      item.title || '角色状态变化',
      item.summary,
      beforeState,
      afterState,
      JSON.stringify(evolutionPayload),
      item.status === 'confirmed' ? 'confirmed' : 'pending',
    );
  }

  private writeBackCanonical(projectId: string, item: any, actor: string) {
    const db = this.databaseService.getDb();
    const now = new Date().toISOString();
    if (item.targetType === 'character') {
      const characterId = item.targetId || this.findCharacterId(projectId, item.targetLabel || item.title);
      if (!characterId) return { skipped: true, reason: 'character_not_matched' };
      const latest = db.prepare(`
        SELECT * FROM character_states WHERE project_id = ? AND character_id = ?
        ORDER BY snapshot_order DESC LIMIT 1
      `).get(projectId, characterId) as any;
      const states = latest ? this.parseJson(latest.states_json, {}) : {};
      const nextStates = {
        ...states,
        last_confirmed_change: item.summary,
        last_confirmed_at: now,
      };
      const order = (latest?.snapshot_order || 0) + 1;
      db.prepare(`
        INSERT INTO character_states (
          id, project_id, character_id, snapshot_order, states_json, change_summary,
          changed_by, previous_snapshot_id, timestamp, needs_review, manually_modified, modified_fields
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
      `).run(randomUUID(), projectId, characterId, order, JSON.stringify(nextStates), item.summary, actor, latest?.id || null, now, JSON.stringify(['last_confirmed_change']));
      return { type: 'character_states', characterId, snapshotOrder: order };
    }

    if (item.targetType === 'foreshadowing') {
      const targetId = item.targetId || randomUUID();
      const existing = db.prepare('SELECT id FROM foreshadowing_states WHERE project_id = ? AND foreshadowing_id = ?')
        .get(projectId, targetId) as any;
      if (existing) {
        db.prepare(`
          UPDATE foreshadowing_states
          SET recovery_method = COALESCE(recovery_method, ?), needs_review = 0, reviewed_at = datetime('now'), reviewed_by = ?, updated_at = datetime('now')
          WHERE project_id = ? AND foreshadowing_id = ?
        `).run(item.summary, actor, projectId, targetId);
      } else {
        db.prepare(`
          INSERT INTO foreshadowing_states (
            id, project_id, foreshadowing_id, status, recovery_method, mention_count, needs_review, reviewed_at, reviewed_by, created_at, updated_at
          ) VALUES (?, ?, ?, 'planted', ?, 1, 0, datetime('now'), ?, datetime('now'), datetime('now'))
        `).run(randomUUID(), projectId, targetId, item.summary, actor);
      }
      return { type: 'foreshadowing_states', foreshadowingId: targetId };
    }

    if (item.targetType === 'timeline_state' || item.targetType === 'plot') {
      const chapter = item.sourceChapterId
        ? db.prepare('SELECT chapter_index FROM chapters WHERE project_id = ? AND id = ?').get(projectId, item.sourceChapterId) as any
        : null;
      const chapterIndex = chapter?.chapter_index || 0;
      const existing = db.prepare('SELECT id FROM plot_progress WHERE project_id = ? AND chapter_index = ?')
        .get(projectId, chapterIndex) as any;
      if (existing) {
        db.prepare(`
          UPDATE plot_progress
          SET emotional_beat = ?, needs_review = 0, reviewed_at = datetime('now'), reviewed_by = ?, updated_at = datetime('now')
          WHERE project_id = ? AND id = ?
        `).run(item.summary, actor, projectId, existing.id);
        return { type: 'plot_progress', id: existing.id };
      }
    }

    return { type: item.targetType, status: 'confirmed_without_canonical_table' };
  }

  private buildLegacyConfirmedContext(projectId: string, chapterNumber: number | undefined, pendingItems: any[]) {
    const db = this.databaseService.getDb();
    const pendingKeys = new Set(pendingItems.map(item => `${item.targetType}:${item.targetId || ''}`));
    const sections: string[] = [];

    try {
      const characters = db.prepare(`
        SELECT cs.character_id, c.name, cs.states_json, cs.change_summary
        FROM character_states cs
        LEFT JOIN characters c ON c.id = cs.character_id
        WHERE cs.project_id = ? AND COALESCE(cs.needs_review, 0) = 0
        ORDER BY cs.character_id, cs.snapshot_order DESC
      `).all(projectId) as any[];
      const seen = new Set<string>();
      const latest = characters.filter(row => {
        if (seen.has(row.character_id) || pendingKeys.has(`character:${row.character_id}`)) return false;
        seen.add(row.character_id);
        return true;
      }).slice(0, 12);
      if (latest.length) {
        sections.push('【旧状态快照: 已确稿角色】');
        sections.push(latest.map(row => `- ${row.name || row.character_id}: ${JSON.stringify(this.parseJson(row.states_json, {})).slice(0, 220)}${row.change_summary ? `; ${row.change_summary}` : ''}`).join('\n'));
      }

      const plotRows = db.prepare(`
        SELECT chapter_index, main_goal_progress, emotional_beat, turning_points
        FROM plot_progress
        WHERE project_id = ? AND chapter_index < ? AND COALESCE(needs_review, 0) = 0
        ORDER BY chapter_index DESC
        LIMIT 8
      `).all(projectId, chapterNumber || 999999) as any[];
      if (plotRows.length) {
        sections.push('【旧状态快照: 已确稿剧情进度】');
        sections.push(plotRows.map(row => `- 第${row.chapter_index}章: 主线${row.main_goal_progress || 0}%; ${row.emotional_beat || ''}; 转折${this.parseJson(row.turning_points, []).join('、') || '无'}`).join('\n'));
      }
    } catch (error) {
      this.logger.warn(`Failed to build legacy state context: ${error instanceof Error ? error.message : String(error)}`);
    }

    return sections.join('\n\n');
  }

  private formatContextSection(title: string, items: any[]) {
    if (!items.length) return '';
    return `${title}\n${items.map(item => {
      const tags = item.tags?.length ? ` 标签:${item.tags.join(',')}` : '';
      const personaWarning = item.tags?.includes('out_of_character') || item.tags?.includes('needs_transition')
        ? ' 这个角色当前不会自然做出这个选择。如果坚持，需要补充动机、事件或过渡剧情。'
        : '';
      return `- [${item.targetType}/${item.authority}] ${item.targetLabel || item.title}: ${item.summary}${tags}${personaWarning}`;
    }).join('\n')}`;
  }

  private extractManualChapterFacts(afterContent: string, beforeContent: string) {
    const delta = afterContent.length > beforeContent.length ? afterContent.slice(Math.max(0, beforeContent.length - 200)) : afterContent;
    const text = delta || afterContent;
    const rules: Array<{ pattern: RegExp; targetType: string; targetLabel: string; title: string; tags: string[] }> = [
      { pattern: /受伤|流血|伤口|昏迷|中毒|骨折/, targetType: 'character', targetLabel: '人物状态', title: '人物受伤或身体状态变化', tags: ['character', 'needs_review'] },
      { pattern: /关系|背叛|和解|结盟|决裂|信任|怀疑/, targetType: 'character', targetLabel: '人物关系', title: '人物关系变化', tags: ['character', 'relationshipChange', 'needs_review'] },
      { pattern: /来到|抵达|离开|返回|进入|地点|城|村|山|宫|学校|公司/, targetType: 'timeline_state', targetLabel: '地点变化', title: '地点或场景变化', tags: ['location_change'] },
      { pattern: /埋下|暗示|伏笔|线索|谜团/, targetType: 'foreshadowing', targetLabel: '伏笔', title: '伏笔埋设', tags: ['foreshadowing', 'reader_hook'] },
      { pattern: /回收|揭晓|真相|原来|终于明白/, targetType: 'foreshadowing', targetLabel: '伏笔', title: '伏笔回收', tags: ['foreshadowing', 'emotional_payoff'] },
      { pattern: /规则|禁忌|法则|设定|世界观|制度/, targetType: 'world_setting', targetLabel: '世界观规则', title: '世界观新增规则', tags: ['world'] },
      { pattern: /道具|钥匙|戒指|剑|手机|信物|归属|交给|拿走/, targetType: 'prop', targetLabel: '道具归属', title: '道具归属变化', tags: ['prop_ownership'] },
      { pattern: /组织|门派|公司|家族|阵营|联盟|敌对/, targetType: 'organization', targetLabel: '组织关系', title: '组织关系变化', tags: ['organization'] },
      { pattern: /第二天|当天|随后|此前|之后|时间|三年|一夜|清晨|黄昏/, targetType: 'timeline_state', targetLabel: '时间线', title: '时间线推进', tags: ['timeline'] },
      { pattern: /不像他|反常|突然变得|毫无理由|性格大变/, targetType: 'character', targetLabel: '角色一致性', title: '角色行为可能违背核心设定', tags: ['character', 'out_of_character', 'needs_transition', 'needs_review'] },
    ];
    const matched = rules.filter(rule => rule.pattern.test(text));
    return (matched.length ? matched : [{
      pattern: /./,
      targetType: 'timeline_state',
      targetLabel: '正文变化',
      title: '未锁定正文发生修改',
      tags: ['needs_review'],
    }]).map(rule => ({
      targetType: rule.targetType,
      targetLabel: rule.targetLabel,
      title: rule.title,
      summary: `${rule.title}: ${text.slice(0, 220)}`,
      evidence: text.slice(0, 1000),
      tags: [...rule.tags, ...this.inferWritingQualityTags(text)],
    }));
  }

  private inferWritingQualityTags(text: string) {
    const tags: string[] = [];
    if (/钩子|悬念|谜团|反转/.test(text)) tags.push('chapter_hook');
    if (/说明|解释|介绍|背景是/.test(text)) tags.push('too_expository');
    if (/感到|觉得|非常|很/.test(text)) tags.push('low_specificity');
    if (/对话|说道|说/.test(text) && !/[“”"]/.test(text)) tags.push('flat_dialogue');
    return tags.filter(tag => (WRITING_QUALITY_TAGS as readonly string[]).includes(tag));
  }

  private buildCharacterEvolutionPayload(item: any) {
    const text = `${item.summary}\n${item.content || ''}`;
    const tags = new Set<string>(item.tags || []);
    if (/不像他|反常|毫无理由|性格大变|违背/.test(text)) tags.add('out_of_character');
    if (/突然|立刻|瞬间|直接/.test(text)) tags.add('needs_transition');
    if (!item.content && !item.payload?.evidenceEvent) tags.add('needs_review');
    return {
      coreSetting: item.payload?.coreSetting || null,
      currentState: item.payload?.currentState || item.summary,
      personalityDrift: /性格|反常|不像/.test(text),
      appearanceChange: /外貌|衣着|伤口|脸色/.test(text),
      relationshipChange: /关系|背叛|和解|结盟|决裂/.test(text),
      motivationChange: /目标|动机|想要|决定/.test(text),
      behaviorPattern: item.payload?.behaviorPattern || null,
      readerExpectation: item.payload?.readerExpectation || null,
      conflictWithPersona: tags.has('out_of_character'),
      needsTransition: tags.has('needs_transition'),
      needsReview: tags.has('needs_review'),
      evidenceEvent: item.payload?.evidenceEvent || item.content || item.summary,
      tags: Array.from(tags),
    };
  }

  private resolveTarget(projectId: string, sourceChapterId: string | null, targetType: string, item: any) {
    const db = this.databaseService.getDb();
    const text = `${item?.title || ''}\n${item?.summary || item?.content || ''}`.toLowerCase();
    const contains = (value: string | null | undefined) => Boolean(value && text.includes(String(value).toLowerCase()));

    if (targetType === 'character') {
      const found = (db.prepare('SELECT id, name, identity FROM characters WHERE project_id = ?').all(projectId) as any[])
        .find(row => contains(row.name) || contains(row.identity));
      return found ? { id: found.id, label: found.name } : { id: null, label: item?.title || '角色' };
    }
    if (targetType === 'foreshadowing') {
      const found = (db.prepare('SELECT id, content, type FROM foreshadowings WHERE project_id = ?').all(projectId) as any[])
        .find(row => contains(row.content) || contains(row.type));
      return found ? { id: found.id, label: String(found.content || '伏笔').slice(0, 40) } : { id: null, label: item?.title || '伏笔' };
    }
    if ((targetType === 'timeline_state' || targetType === 'plot_logic') && sourceChapterId) {
      const chapter = db.prepare('SELECT chapter_index FROM chapters WHERE project_id = ? AND id = ?')
        .get(projectId, sourceChapterId) as any;
      if (chapter?.chapter_index !== undefined) {
        return { id: String(chapter.chapter_index), label: `第${chapter.chapter_index}章状态` };
      }
    }
    return { id: null, label: item?.title || targetType };
  }

  private findCharacterId(projectId: string, label?: string | null) {
    if (!label) return null;
    const row = this.databaseService.getDb().prepare(`
      SELECT id FROM characters
      WHERE project_id = ? AND (name = ? OR instr(?, name) > 0)
      LIMIT 1
    `).get(projectId, label, label) as any;
    return row?.id || null;
  }

  private hasLockedChapter(projectId: string, chapterId?: string) {
    if (!chapterId) return false;
    const row = this.databaseService.getDb().prepare(`
      SELECT status FROM chapters WHERE project_id = ? AND id = ?
    `).get(projectId, chapterId) as any;
    return Boolean(row && row.status === 'locked');
  }

  private buildChapterImpactItems(projectId: string, targetType: string, targetId: string | null) {
    const db = this.databaseService.getDb();
    const rows = db.prepare(`
      SELECT id, title, status, chapter_index, volume_index
      FROM chapters
      WHERE project_id = ?
      ORDER BY
        CASE WHEN status = 'locked' THEN 0 ELSE 1 END,
        volume_index ASC,
        chapter_index ASC
      LIMIT 40
    `).all(projectId) as any[];
    if (!rows.length) return [];

    const priorityRank: Record<string, number> = {
      world_setting: 90,
      character: 80,
      outline: 70,
      volume: 60,
      chapter_plan: 50,
      chapter: 40,
    };
    const rank = priorityRank[targetType] || 30;
    return rows
      .filter(row => row.status === 'locked' || rank >= 50)
      .slice(0, 12)
      .map(row => {
        const locked = row.status === 'locked';
        return {
          id: randomUUID(),
          impactType: locked ? 'blocked_by_locked_chapter' : 'downstream_chapter_needs_sync',
          targetType: 'chapter',
          targetId: row.id,
          targetLabel: `第${row.chapter_index || '?'}章 ${row.title || ''}`.trim(),
          summary: locked
            ? `已锁定正文可能受 ${targetType} 修改影响, 只生成阻断提示, 不自动修改`
            : `未锁定正文可能受 ${targetType} 修改影响, 可标记为 stale/needs_review/can_auto_sync`,
          severity: locked ? 'high' : rank >= 80 ? 'medium' : 'low',
          actionHint: locked ? '保持锁定, 人工复核冲突' : '标记需复核, 可后续自动同步',
          payload: {
            sourceTargetType: targetType,
            sourceTargetId: targetId,
            locked,
            stale: true,
            needsReview: true,
            canAutoSync: !locked,
          },
        };
      });
  }

  private summarizeExtractedState(state: any) {
    const changes = state?.changes ? JSON.stringify(state.changes) : '';
    return String(state?.summary || state?.description || changes || `${state?.type || '状态'} 更新`).slice(0, 800);
  }

  private normalizeTargetType(type: string) {
    const value = String(type || 'state').trim();
    if (value === 'plot') return 'timeline_state';
    return value;
  }

  private authorityForStatus(status: string) {
    if (status === 'confirmed') return 'hard_fact';
    if (status === 'conflict' || status === 'stale') return 'warning';
    if (status === 'rejected' || status === 'archived') return 'excluded';
    return 'soft_candidate';
  }

  private hashSummary(summary: string) {
    return createHash('sha1').update(summary.trim().toLowerCase()).digest('hex');
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private mapStateItem(row: any) {
    return {
      id: row.id,
      projectId: row.project_id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceChapterId: row.source_chapter_id,
      targetType: row.target_type,
      targetId: row.target_id,
      targetLabel: row.target_label,
      stateKey: row.state_key,
      title: row.title,
      summary: row.summary,
      content: row.content,
      payload: this.parseJson(row.payload, {}),
      status: row.status,
      authority: row.authority === 'canon' ? 'hard_fact' : (row.authority || this.authorityForStatus(row.status)),
      source: row.source,
      confidence: row.confidence,
      tags: this.parseJson(row.tags, []),
      impactScope: this.parseJson(row.impact_scope, []),
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      confirmedBy: row.confirmed_by,
      confirmedAt: row.confirmed_at,
      rejectedBy: row.rejected_by,
      rejectedAt: row.rejected_at,
      archivedAt: row.archived_at,
    };
  }

  private mapImpactReport(row: any) {
    return {
      id: row.id,
      projectId: row.project_id,
      sourceStateItemId: row.source_state_item_id,
      sourceType: row.source_type,
      summary: row.summary,
      riskLevel: row.risk_level,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      payload: this.parseJson(row.payload, {}),
    };
  }

  private mapImpactItem(row: any) {
    return {
      id: row.id,
      reportId: row.report_id,
      projectId: row.project_id,
      impactType: row.impact_type,
      targetType: row.target_type,
      targetId: row.target_id,
      targetLabel: row.target_label,
      summary: row.summary,
      severity: row.severity,
      status: row.status,
      actionHint: row.action_hint,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      appliedAt: row.applied_at,
      payload: this.parseJson(row.payload, {}),
    };
  }
}
