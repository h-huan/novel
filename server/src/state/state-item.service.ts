import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { DatabaseService } from '../database/database.service';

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
    if (existing) return this.mapStateItem(existing);

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
      input.authority || 'soft_candidate',
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
        SET status = 'confirmed', authority = 'canon', confirmed_by = ?, confirmed_at = datetime('now'), updated_at = datetime('now')
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
      SET status = 'rejected', rejected_by = ?, rejected_at = datetime('now'), updated_at = datetime('now')
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
      SET status = 'archived', archived_at = datetime('now'), updated_at = datetime('now')
      WHERE project_id = ? AND id = ?
    `).run(projectId, id);
    return this.get(projectId, id);
  }

  createFromArchive(projectId: string, sourceChapterId: string, archive: any) {
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
          payload: { ...item, matchedTarget: target },
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
      this.formatContextSection('【已确稿状态: 可作为事实】', grouped.confirmed.slice(0, 40)),
      this.formatContextSection('【待确稿状态: 只能作为候选参考, 不可写成硬事实】', grouped.pending.slice(0, 25)),
      this.formatContextSection('【冲突状态: 写作时必须避开或等待作者处理】', grouped.conflict.slice(0, 15)),
      this.formatContextSection('【过期状态: 可能被后续修改影响, 仅作提醒】', grouped.stale.slice(0, 15)),
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
      stateGuard: 'Confirmed items are canon. Pending items are candidate references only. Conflict and stale items require author attention and must not be treated as stable facts.',
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
          UPDATE state_items SET status = 'stale', updated_at = datetime('now')
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

  private createCharacterEvolutionFromItem(projectId: string, item: any) {
    if (item.targetType !== 'character' && !item.tags.includes('character')) return;
    const db = this.databaseService.getDb();
    const chapter = item.sourceChapterId
      ? db.prepare('SELECT chapter_index FROM chapters WHERE project_id = ? AND id = ?').get(projectId, item.sourceChapterId) as any
      : null;
    db.prepare(`
      INSERT INTO character_evolution_events (
        id, project_id, character_id, character_name, source_state_item_id, source_chapter_id,
        chapter_index, event_type, title, summary, delta, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      JSON.stringify(item.payload || {}),
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
    return `${title}\n${items.map(item => `- [${item.targetType}] ${item.targetLabel || item.title}: ${item.summary}`).join('\n')}`;
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
      SELECT status, is_locked FROM chapters WHERE project_id = ? AND id = ?
    `).get(projectId, chapterId) as any;
    return Boolean(row && (row.is_locked === 1 || row.status === 'locked'));
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
      authority: row.authority,
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
