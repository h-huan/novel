/**
 * 状态管理控制器 (State Management Controller)
 *
 * 实现规范文档第7节的 API 设计：
 * 1. 状态提取 API
 * 2. 状态查询 API
 * 3. 状态修改 API
 * 4. 一致性检查 API
 * 5. 版本历史 API
 * 6. 字段锁定 API
 */
import { Controller, Get, Post, Put, Patch, Body, Param, Query, Logger, HttpException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { StateExtractionService } from './state-extraction.service';
import { ConsistencyCheckService } from './consistency-check.service';
import { CharacterStateRepository } from '../database/repositories/character-state.repository';
import { StateItemService } from './state-item.service';

@Controller('projects/:projectId/state')
export class StateManagementController {
  private readonly logger = new Logger(StateManagementController.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly stateExtractionService: StateExtractionService,
    private readonly consistencyCheckService: ConsistencyCheckService,
    private readonly characterStateRepo: CharacterStateRepository,
    private readonly stateItemService: StateItemService,
  ) {}

  // ═══════════════════════════════════════════
  // 1. 状态提取 API
  // ═══════════════════════════════════════════

  /**
   * POST /api/projects/:projectId/state/extract
   * 触发状态提取
   */
  @Post('extract')
  async extractStates(
    @Param('projectId') projectId: string,
    @Body() body: {
      chapterIds?: string[];
      stateTypes?: ('character' | 'foreshadowing' | 'plot')[];
      force?: boolean;
    },
  ) {
    this.logger.log(`Extracting states for project ${projectId}`);

    try {
      const result = await this.stateExtractionService.batchExtract(projectId, {
        chapterIds: body.chapterIds,
        stateTypes: body.stateTypes,
        force: body.force,
      });
      const confirmations = this.createPendingConfirmations(
        projectId,
        body.chapterIds?.[0],
        result.extractedStates,
      );
      const stateItems = this.stateItemService.createFromExtractedStates(
        projectId,
        body.chapterIds?.[0],
        result.extractedStates,
      );

      return {
        success: true,
        extractedStates: result.extractedStates,
        confirmations,
        stateItems,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to extract states: ${err.message}`);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  @Get('items')
  listStateItems(
    @Param('projectId') projectId: string,
    @Query('status') status: string = 'all',
    @Query('targetType') targetType?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      success: true,
      items: this.stateItemService.list(projectId, { status, targetType, limit }),
    };
  }

  @Get('items/:id')
  getStateItem(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return { success: true, item: this.stateItemService.get(projectId, id) };
  }

  @Patch('items/:id')
  updateStateItem(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return { success: true, item: this.stateItemService.update(projectId, id, body) };
  }

  @Post('items/:id/confirm')
  confirmStateItem(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: { confirmedBy?: string } = {},
  ) {
    return { success: true, item: this.stateItemService.confirm(projectId, id, body.confirmedBy || 'author') };
  }

  @Post('items/:id/reject')
  rejectStateItem(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: { rejectedBy?: string } = {},
  ) {
    return { success: true, item: this.stateItemService.reject(projectId, id, body.rejectedBy || 'author') };
  }

  @Post('items/:id/archive')
  archiveStateItem(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return { success: true, item: this.stateItemService.archive(projectId, id) };
  }

  @Get('context-preview')
  getWritingStateContext(
    @Param('projectId') projectId: string,
    @Query('chapterNumber') chapterNumber?: string,
  ) {
    return {
      success: true,
      context: this.stateItemService.buildWritingStateContext(projectId, Number(chapterNumber || 0) || undefined),
    };
  }

  @Post('impact/analyze')
  analyzeStateImpact(
    @Param('projectId') projectId: string,
    @Body() body: any,
  ) {
    return { success: true, report: this.stateItemService.analyzeImpact(projectId, body || {}) };
  }

  @Get('impact/reports')
  listImpactReports(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
  ) {
    return { success: true, reports: this.stateItemService.listImpactReports(projectId, limit === undefined ? undefined : Number(limit)) };
  }

  @Get('impact/reports/:id')
  getImpactReport(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return { success: true, report: this.stateItemService.getImpactReport(projectId, id) };
  }

  @Post('impact/items/:id/apply')
  applyImpactItem(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return { success: true, item: this.stateItemService.applyImpactItem(projectId, id) };
  }

  @Get('versions/:entityType/:entityId')
  getCanonicalVersions(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.stateItemService.listCanonicalVersions(entityType, entityId);
  }

  @Post('versions/:entityType/:entityId/:version/restore')
  restoreCanonicalVersion(
    @Param('projectId') projectId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Param('version') version: string,
  ) {
    return this.stateItemService.restoreCanonicalVersion(projectId, entityType, entityId, Number(version));
  }

  @Get('characters/:characterId/evolution')
  getCharacterEvolution(
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
  ) {
    return {
      success: true,
      events: this.stateItemService.getCharacterEvolution(projectId, characterId),
    };
  }

  /**
   * GET /api/projects/:projectId/state/confirmations
   * 查询统一待确稿队列
   */
  @Get('confirmations')
  getConfirmations(
    @Param('projectId') projectId: string,
    @Query('status') status: 'pending' | 'confirmed' | 'rejected' | 'all' = 'pending',
    @Query('limit') limit?: string,
  ) {
    const db = this.databaseService.getDb();
    const parsedLimit = limit === undefined ? undefined : parseInt(limit, 10);
    if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit < 1)) throw new HttpException('limit must be a positive integer', 400);
    const rows = status === 'all'
      ? db.prepare(`
          SELECT * FROM state_confirmations
          WHERE project_id = ?
          ORDER BY created_at DESC
          ${parsedLimit === undefined ? '' : 'LIMIT ?'}
        `).all(projectId, ...(parsedLimit === undefined ? [] : [parsedLimit])) as any[]
      : db.prepare(`
          SELECT * FROM state_confirmations
          WHERE project_id = ? AND status = ?
          ORDER BY created_at DESC
          ${parsedLimit === undefined ? '' : 'LIMIT ?'}
        `).all(projectId, status, ...(parsedLimit === undefined ? [] : [parsedLimit])) as any[];

    return {
      success: true,
      confirmations: rows.map(row => ({
        id: row.id,
        projectId: row.project_id,
        sourceChapterId: row.source_chapter_id,
        targetType: row.target_type,
        targetId: row.target_id,
        targetLabel: row.target_label,
        summary: row.summary,
        payload: this.parseJson(row.payload, {}),
        status: row.status,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        confirmedBy: row.confirmed_by,
        confirmedAt: row.confirmed_at,
        rejectedBy: row.rejected_by,
        rejectedAt: row.rejected_at,
      })),
    };
  }

  /**
   * POST /api/projects/:projectId/state/confirmations/:id/confirm
   * 作者确稿单条状态变更
   */
  @Post('confirmations/batch/:action')
  batchUpdateConfirmations(
    @Param('projectId') projectId: string,
    @Param('action') action: 'confirm' | 'reject',
    @Body() body: { ids?: string[]; confirmedBy?: string; rejectedBy?: string } = {},
  ) {
    if (action !== 'confirm' && action !== 'reject') {
      return { success: false, error: 'Invalid action', updated: 0, failed: [] };
    }

    const ids = Array.from(new Set((body.ids || []).filter(Boolean)));
    if (ids.length === 0) {
      return { success: false, error: 'No confirmation ids provided', updated: 0, failed: [] };
    }

    const db = this.databaseService.getDb();
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT * FROM state_confirmations
      WHERE project_id = ? AND id IN (${placeholders}) AND status = 'pending'
    `).all(projectId, ...ids) as any[];
    const rowById = new Map(rows.map(row => [row.id, row]));
    const failed = ids
      .filter(id => !rowById.has(id))
      .map(id => ({ id, error: 'Confirmation not found or not pending' }));
    const actor = action === 'confirm'
      ? body.confirmedBy || 'author'
      : body.rejectedBy || 'author';
    const writebacks: Array<{ id: string; writeback: any }> = [];

    try {
      db.exec('BEGIN');
      for (const row of rows) {
        if (action === 'confirm') {
          db.prepare(`
            UPDATE state_confirmations
            SET status = 'confirmed', confirmed_by = ?, confirmed_at = datetime('now'), updated_at = datetime('now')
            WHERE project_id = ? AND id = ?
          `).run(actor, projectId, row.id);

          const writeback = this.applyConfirmedStateChange(projectId, row, actor);
          writebacks.push({ id: row.id, writeback });
          this.markReviewedTarget(projectId, row, actor);
        } else {
          db.prepare(`
            UPDATE state_confirmations
            SET status = 'rejected', rejected_by = ?, rejected_at = datetime('now'), updated_at = datetime('now')
            WHERE project_id = ? AND id = ?
          `).run(actor, projectId, row.id);
        }
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to batch ${action} confirmations: ${err.message}`);
      return { success: false, error: err.message, updated: 0, failed };
    }

    return {
      success: true,
      action,
      updated: rows.length,
      failed,
      writebacks,
    };
  }

  @Put('confirmations/:id/target')
  updateConfirmationTarget(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: { targetType?: string; targetId?: string | null; targetLabel?: string } = {},
  ) {
    const db = this.databaseService.getDb();
    const existing = db.prepare(`
      SELECT id FROM state_confirmations
      WHERE project_id = ? AND id = ? AND status = 'pending'
    `).get(projectId, id) as any;

    if (!existing) {
      return { success: false, error: 'Confirmation not found or not pending' };
    }

    const result = db.prepare(`
      UPDATE state_confirmations
      SET target_type = COALESCE(?, target_type),
          target_id = COALESCE(?, target_id),
          target_label = COALESCE(?, target_label),
          updated_at = datetime('now')
      WHERE project_id = ? AND id = ?
    `).run(
      body.targetType || null,
      body.targetId || null,
      body.targetLabel || null,
      projectId,
      id,
    );

    return {
      success: result.changes > 0,
      id,
      targetType: body.targetType,
      targetId: body.targetId || null,
      targetLabel: body.targetLabel,
    };
  }

  @Post('confirmations/:id/confirm')
  confirmStateChange(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: { confirmedBy?: string } = {},
  ) {
    const db = this.databaseService.getDb();
    const row = db.prepare(`
      SELECT * FROM state_confirmations
      WHERE project_id = ? AND id = ?
    `).get(projectId, id) as any;

    if (!row) return { success: false, error: 'Confirmation not found' };

    db.prepare(`
      UPDATE state_confirmations
      SET status = 'confirmed', confirmed_by = ?, confirmed_at = datetime('now'), updated_at = datetime('now')
      WHERE project_id = ? AND id = ?
    `).run(body.confirmedBy || 'author', projectId, id);

    const writeback = this.applyConfirmedStateChange(projectId, row, body.confirmedBy || 'author');

    this.markReviewedTarget(projectId, row, body.confirmedBy || 'author');

    return { success: true, id, status: 'confirmed', writeback };
  }

  /**
   * POST /api/projects/:projectId/state/confirmations/:id/reject
   * 驳回单条待确稿状态
   */
  @Post('confirmations/:id/reject')
  rejectStateChange(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: { rejectedBy?: string } = {},
  ) {
    const db = this.databaseService.getDb();
    const result = db.prepare(`
      UPDATE state_confirmations
      SET status = 'rejected', rejected_by = ?, rejected_at = datetime('now'), updated_at = datetime('now')
      WHERE project_id = ? AND id = ?
    `).run(body.rejectedBy || 'author', projectId, id);

    return { success: result.changes > 0, id, status: 'rejected' };
  }

  // ═══════════════════════════════════════════
  // 2. 状态查询 API
  // ═══════════════════════════════════════════

  /**
   * GET /api/projects/:projectId/state/character
   * 查询人物状态
   */
  @Get('character')
  getCharacterStates(
    @Param('projectId') projectId: string,
    @Query('characterIds') characterIds?: string,
    @Query('includeHistory') includeHistory?: string,
  ) {
    this.logger.log(`Getting character states for project ${projectId}`);
    const db = this.databaseService.getDb();

    // 构建查询
    let query = 'SELECT * FROM character_states WHERE project_id = ?';
    const params: any[] = [projectId];

    if (characterIds) {
      const ids = characterIds.split(',');
      const placeholders = ids.map(() => '?').join(',');
      query += ` AND character_id IN (${placeholders})`;
      params.push(...ids);
    }

    query += ' ORDER BY character_id, snapshot_order DESC';

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];

    // 格式化返回数据
    const characters = rows.map(row => ({
      characterId: row.character_id,
      projectId: row.project_id,
      snapshotId: row.id,
      chapterId: row.chapter_id,
      timestamp: row.timestamp,
      states: JSON.parse(row.states_json),
      changedDimensions: row.changed_dimensions ? JSON.parse(row.changed_dimensions) : [],
      changeSummary: row.change_summary,
      confidence: row.confidence,
      needsReview: row.needs_review === 1,
      manuallyModified: row.manually_modified === 1,
      modifiedFields: row.modified_fields ? JSON.parse(row.modified_fields) : [],
    }));

    // 如果需要历史，获取版本历史
    if (includeHistory === 'true') {
      for (const character of characters) {
        const historyStmt = db.prepare(`
          SELECT * FROM state_versions
          WHERE state_type = 'character' AND state_id = ?
          ORDER BY version ASC
        `);
        const history = historyStmt.all(character.characterId) as any[];
        (character as any).history = history.map(h => ({
          version: h.version,
          data: JSON.parse(h.data),
          source: h.source,
          createdAt: h.created_at,
          changeLog: h.change_log,
        }));
      }
    }

    return {
      success: true,
      characters,
    };
  }

  /**
   * GET /api/projects/:projectId/state/foreshadowing
   * 查询伏笔状态
   */
  @Get('foreshadowing')
  getForeshadowingStates(
    @Param('projectId') projectId: string,
  ) {
    this.logger.log(`Getting foreshadowing states for project ${projectId}`);
    const db = this.databaseService.getDb();

    const stmt = db.prepare('SELECT * FROM foreshadowing_states WHERE project_id = ?');
    const rows = stmt.all(projectId) as any[];

    const foreshadowings = rows.map(row => ({
      foreshadowingId: row.foreshadowing_id,
      projectId: row.project_id,
      status: row.status,
      plantedChapter: row.planted_chapter,
      recoveredChapter: row.recovered_chapter,
      recoveryMethod: row.recovery_method,
      activeChapters: row.active_chapters,
      tensionContribution: row.tension_contribution,
      relatedCharacters: JSON.parse(row.related_characters || '[]'),
      relatedChapters: JSON.parse(row.related_chapters || '[]'),
      detectedAutomatically: row.detected_automatically === 1,
      lastMentionedChapter: row.last_mentioned_chapter,
      mentionCount: row.mention_count,
      needsReview: row.needs_review === 1,
    }));

    return {
      success: true,
      foreshadowings,
    };
  }

  /**
   * GET /api/projects/:projectId/state/plot
   * 查询情节进展
   */
  @Get('plot')
  getPlotProgress(
    @Param('projectId') projectId: string,
    @Query('chapterIndex') chapterIndex?: string,
  ) {
    this.logger.log(`Getting plot progress for project ${projectId}`);
    const db = this.databaseService.getDb();

    let query = 'SELECT * FROM plot_progress WHERE project_id = ?';
    const params: any[] = [projectId];

    if (chapterIndex) {
      query += ' AND chapter_index = ?';
      params.push(parseInt(chapterIndex));
    }

    query += ' ORDER BY chapter_index ASC';

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];

    const plotProgress = rows.map(row => ({
      id: row.id,
      projectId: row.project_id,
      chapterIndex: row.chapter_index,
      activeConflicts: JSON.parse(row.active_conflicts || '[]'),
      resolvedConflicts: JSON.parse(row.resolved_conflicts || '[]'),
      mainGoalProgress: row.main_goal_progress,
      subGoalProgress: JSON.parse(row.sub_goal_progress || '{}'),
      emotionalBeat: row.emotional_beat,
      emotionalIntensity: row.emotional_intensity,
      pacingScore: row.pacing_score,
      turningPoints: JSON.parse(row.turning_points || '[]'),
      needsReview: row.needs_review === 1,
    }));

    return {
      success: true,
      plotProgress,
    };
  }

  /**
   * GET /api/projects/:projectId/state/consistency
   * 查询一致性检查结果
   */
  @Get('consistency')
  getConsistencyChecks(
    @Param('projectId') projectId: string,
    @Query('status') status?: 'pass' | 'warning' | 'error',
    @Query('chapterIndex') chapterIndex?: string,
  ) {
    this.logger.log(`Getting consistency checks for project ${projectId}`);
    const db = this.databaseService.getDb();

    let query = 'SELECT * FROM consistency_checks WHERE project_id = ?';
    const params: any[] = [projectId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (chapterIndex) {
      query += ' AND chapter_index = ?';
      params.push(parseInt(chapterIndex));
    }

    query += ' ORDER BY detected_at DESC';

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];

    const checks = rows.map(row => ({
      id: row.id,
      checkType: row.check_type,
      status: row.status,
      message: row.message,
      severity: row.severity,
      detectedAt: row.detected_at,
      chapterIndex: row.chapter_index,
      details: JSON.parse(row.details),
      resolved: row.resolved === 1,
    }));

    return {
      success: true,
      checks,
    };
  }

  // ═══════════════════════════════════════════
  // 3. 状态修改 API
  // ═══════════════════════════════════════════

  /**
   * PUT /api/projects/:projectId/state/character/:characterId
   * 修改人物状态
   */
  @Put('character/:characterId')
  async updateCharacterState(
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
    @Body() body: {
      states: Record<string, any>;
      lockFields?: string[];
    },
  ) {
    this.logger.log(`Updating character state for ${characterId}`);
    const db = this.databaseService.getDb();

    try {
      // 获取最新快照
      const latestStmt = db.prepare(`
        SELECT * FROM character_states
        WHERE character_id = ?
        ORDER BY snapshot_order DESC
        LIMIT 1
      `);
      const latestRow = latestStmt.get(characterId) as any;

      if (!latestRow) {
        return {
          success: false,
          error: 'Character state not found',
        };
      }

      // 更新状态
      const states = JSON.parse(latestRow.states_json);
      const modifiedFields: string[] = [];

      for (const [key, value] of Object.entries(body.states)) {
        if (states[key] !== value) {
          states[key] = value;
          modifiedFields.push(key);
        }
      }

      // 创建新快照
      const nextOrderStmt = db.prepare(`
        SELECT COALESCE(MAX(snapshot_order), 0) + 1 as next_order
        FROM character_states
        WHERE character_id = ?
      `);
      const nextOrder = (nextOrderStmt.get(characterId) as any).next_order;

      const newSnapshotId = this.generateId();
      const insertStmt = db.prepare(`
        INSERT INTO character_states (
          id, character_id, project_id, chapter_id, timestamp,
          snapshot_order, states_json, changed_dimensions,
          previous_snapshot_id, change_summary,
          confidence, needs_review, created_by,
          manually_modified, modified_fields
        ) VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        newSnapshotId,
        characterId,
        projectId,
        latestRow.chapter_id,
        nextOrder,
        JSON.stringify(states),
        JSON.stringify(modifiedFields),
        latestRow.id,
        `Manual update: ${modifiedFields.join(', ')}`,
        1.0,
        0,
        'manual',
        1,
        JSON.stringify(modifiedFields),
      );

      // 处理字段锁定
      if (body.lockFields && body.lockFields.length > 0) {
        for (const field of body.lockFields) {
          const lockStmt = db.prepare(`
            INSERT OR REPLACE INTO field_locks (
              id, project_id, state_type, state_id, field_path,
              locked, locked_at, locked_by
            ) VALUES (?, ?, ?, ?, ?, 1, datetime('now'), 'user')
          `);

          lockStmt.run(
            this.generateId(),
            projectId,
            'character',
            characterId,
            field,
          );
        }
      }

      return {
        success: true,
        character: {
          characterId,
          states,
          modifiedFields,
          snapshotId: newSnapshotId,
        },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to update character state: ${err.message}`);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  // ═══════════════════════════════════════════
  // 4. 一致性检查 API
  // ═══════════════════════════════════════════

  /**
   * POST /api/projects/:projectId/state/consistency/check
   * 触发一致性检查
   */
  @Post('consistency/check')
  async checkConsistency(
    @Param('projectId') projectId: string,
    @Body() body: {
      chapterIds?: number[];
      checkTypes?: ('character' | 'world_setting' | 'timeline' | 'plot_logic')[];
    },
  ) {
    this.logger.log(`Checking consistency for project ${projectId}`);

    try {
      const checks = await this.consistencyCheckService.checkConsistency(projectId, {
        chapterIds: body.chapterIds,
        checkTypes: body.checkTypes,
      });

      return {
        success: true,
        checks,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to check consistency: ${err.message}`);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  // ═══════════════════════════════════════════
  // 5. 版本历史 API
  // ═══════════════════════════════════════════

  /**
   * GET /api/projects/:projectId/state/character/:characterId/history
   * 获取人物状态版本历史
   */
  @Get('character/:characterId/history')
  getCharacterHistory(
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
  ) {
    this.logger.log(`Getting history for character ${characterId}`);
    const db = this.databaseService.getDb();

    const stmt = db.prepare(`
      SELECT * FROM state_versions
      WHERE state_type = 'character' AND state_id = ?
      ORDER BY version ASC
    `);
    const rows = stmt.all(characterId) as any[];

    const history = rows.map(row => ({
      version: row.version,
      data: JSON.parse(row.data),
      source: row.source,
      createdAt: row.created_at,
      createdBy: row.created_by,
      changeLog: row.change_log,
    }));

    return {
      success: true,
      history,
    };
  }

  /**
   * POST /api/projects/:projectId/state/character/:characterId/rollback
   * 回滚到指定版本
   */
  @Post('character/:characterId/rollback')
  async rollbackCharacterState(
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
    @Body() body: { version: number },
  ) {
    this.logger.log(`Rolling back character ${characterId} to version ${body.version}`);
    const db = this.databaseService.getDb();

    try {
      // 获取指定版本的数据
      const versionStmt = db.prepare(`
        SELECT * FROM state_versions
        WHERE state_type = 'character' AND state_id = ? AND version = ?
      `);
      const versionRow = versionStmt.get(characterId, body.version) as any;

      if (!versionRow) {
        return {
          success: false,
          error: 'Version not found',
        };
      }

      const versionData = JSON.parse(versionRow.data);

      // 创建新快照（基于旧版本）
      const nextOrderStmt = db.prepare(`
        SELECT COALESCE(MAX(snapshot_order), 0) + 1 as next_order
        FROM character_states
        WHERE character_id = ?
      `);
      const nextOrder = (nextOrderStmt.get(characterId) as any).next_order;

      const latestStmt = db.prepare(`
        SELECT id FROM character_states
        WHERE character_id = ?
        ORDER BY snapshot_order DESC
        LIMIT 1
      `);
      const latestRow = latestStmt.get(characterId) as any;

      const newSnapshotId = this.generateId();
      const insertStmt = db.prepare(`
        INSERT INTO character_states (
          id, character_id, project_id, chapter_id, timestamp,
          snapshot_order, states_json, changed_dimensions,
          previous_snapshot_id, change_summary,
          confidence, needs_review, created_by,
          manually_modified, modified_fields
        ) VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        newSnapshotId,
        characterId,
        projectId,
        null,
        nextOrder,
        JSON.stringify(versionData),
        JSON.stringify(Object.keys(versionData)),
        latestRow?.id || null,
        `Rollback to version ${body.version}`,
        1.0,
        1,
        'manual',
        1,
        JSON.stringify(Object.keys(versionData)),
      );

      return {
        success: true,
        message: `Rolled back to version ${body.version}`,
        snapshotId: newSnapshotId,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to rollback: ${err.message}`);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  // ═══════════════════════════════════════════
  // 6. 字段锁定 API
  // ═══════════════════════════════════════════

  /**
   * PUT /api/projects/:projectId/state/character/:characterId/lock
   * 锁定或解锁字段
   */
  @Put('character/:characterId/lock')
  async toggleFieldLock(
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
    @Body() body: { fieldPath: string; locked: boolean },
  ) {
    this.logger.log(`${body.locked ? 'Locking' : 'Unlocking'} field ${body.fieldPath} for character ${characterId}`);
    const db = this.databaseService.getDb();

    try {
      if (body.locked) {
        // 锁定字段
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO field_locks (
            id, project_id, state_type, state_id, field_path,
            locked, locked_at, locked_by
          ) VALUES (?, ?, ?, ?, ?, 1, datetime('now'), 'user')
        `);

        stmt.run(
          this.generateId(),
          projectId,
          'character',
          characterId,
          body.fieldPath,
        );
      } else {
        // 解锁字段
        const stmt = db.prepare(`
          DELETE FROM field_locks
          WHERE project_id = ? AND state_type = ? AND state_id = ? AND field_path = ?
        `);

        stmt.run(projectId, 'character', characterId, body.fieldPath);
      }

      return {
        success: true,
        message: `Field ${body.fieldPath} ${body.locked ? 'locked' : 'unlocked'}`,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to toggle field lock: ${err.message}`);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 生成 UUID
   */
  private createPendingConfirmations(
    projectId: string,
    sourceChapterId: string | undefined,
    extractedStates: Array<{ type: string; id: string; changes: number }>,
  ) {
    if (extractedStates.length === 0) return [];
    const db = this.databaseService.getDb();
    const now = new Date().toISOString();
    const existingStmt = db.prepare(`
      SELECT id FROM state_confirmations
      WHERE project_id = ?
        AND source_chapter_id IS ?
        AND target_type = ?
        AND target_id IS ?
        AND status = 'pending'
      LIMIT 1
    `);
    const insert = db.prepare(`
      INSERT INTO state_confirmations (
        id, project_id, source_chapter_id, target_type, target_id, target_label,
        summary, payload, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'auto_extract', ?, ?)
    `);

    const created: Array<{ id: string; targetType: string; targetId: string | null; summary: string }> = [];

    for (const state of extractedStates) {
      const targetType =
        state.type === 'plot' ? 'timeline_state' :
        state.type === 'foreshadowing' ? 'foreshadowing' :
        state.type;
      const targetId = state.id || null;
      const existing = existingStmt.get(projectId, sourceChapterId || null, targetType, targetId) as any;
      if (existing) continue;
      const labelMap: Record<string, string> = {
        character: '角色',
        foreshadowing: '伏笔',
        timeline_state: '时间线/状态',
        world_setting: '世界观',
        organization: '组织',
        outline: '大纲',
      };
      const id = this.generateId();
      const summary = `${labelMap[targetType] || targetType}状态有${state.changes || 1}项AI提取变更，等待作者确稿`;

      insert.run(
        id,
        projectId,
        sourceChapterId || null,
        targetType,
        targetId,
        labelMap[targetType] || targetType,
        summary,
        JSON.stringify({ extractedType: state.type, changes: state.changes }),
        now,
        now,
      );

      created.push({ id, targetType, targetId, summary });
    }

    return created;
  }

  private markReviewedTarget(projectId: string, row: any, actor: string) {
    if (!row.target_id) return;

    const db = this.databaseService.getDb();
    if (row.target_type === 'character') {
      db.prepare(`
        UPDATE character_states
        SET needs_review = 0, reviewed_by = ?, reviewed_at = datetime('now')
        WHERE project_id = ? AND character_id = ?
      `).run(actor, projectId, row.target_id);
    }

    if (row.target_type === 'timeline_state' || row.target_type === 'plot') {
      db.prepare(`
        UPDATE plot_progress
        SET needs_review = 0, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
        WHERE project_id = ? AND id = ?
      `).run(actor, projectId, row.target_id);
    }

    if (row.target_type === 'foreshadowing') {
      db.prepare(`
        UPDATE foreshadowing_states
        SET needs_review = 0, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
        WHERE project_id = ? AND foreshadowing_id = ?
      `).run(actor, projectId, row.target_id);
    }
  }

  private applyConfirmedStateChange(projectId: string, row: any, actor: string) {
    const db = this.databaseService.getDb();
    const payload = this.parseJson<Record<string, any>>(row.payload, {});
    const title = String(payload.title || row.target_label || '确稿变更').slice(0, 80);
    const summary = String(payload.summary || row.summary || '').trim();
    if (!summary) return { action: 'skipped', reason: 'empty_summary', targetType: row.target_type, targetId: row.target_id || null };

    const now = new Date().toISOString();
    const chapter = row.source_chapter_id
      ? db.prepare('SELECT chapter_index, volume_index FROM chapters WHERE id = ?').get(row.source_chapter_id) as any
      : null;
    const chapterIndex = Number(chapter?.chapter_index || 0);
    const volumeIndex = Number(chapter?.volume_index || 0);

    switch (row.target_type) {
      case 'character': {
        const arcPoint = { source: 'confirmed_archive', chapterId: row.source_chapter_id, chapterIndex, title, summary, confirmedBy: actor, confirmedAt: now };
        if (row.target_id) {
          const existing = db.prepare('SELECT id, arc, background FROM characters WHERE project_id = ? AND id = ?').get(projectId, row.target_id) as any;
          if (existing) {
            const arc = this.parseJson<any[]>(existing.arc, []);
            arc.push(arcPoint);
            const background = [existing.background, `【已确认章节变化】${summary}`].filter(Boolean).join('\n');
            db.prepare(`
              UPDATE characters
              SET arc = ?, background = ?, updated_at = ?
              WHERE project_id = ? AND id = ?
            `).run(JSON.stringify(arc), background, now, projectId, row.target_id);
            break;
          }
        }

        db.prepare(`
          INSERT INTO characters (
            id, project_id, name, aliases, age, gender, identity, appearance,
            background, personality, abilities, relationships, arc,
            dialogue_style, dialogue_patterns, is_pov_character, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          this.generateId(),
          projectId,
          title,
          '[]',
          null,
          null,
          'confirmed_archive',
          null,
          summary,
          '{}',
          '{}',
          '[]',
          JSON.stringify([arcPoint]),
          null,
          '[]',
          0,
          now,
          now,
        );
        break;
      }

      case 'world_setting': {
        const existing = db.prepare('SELECT id, constraints, rules, version FROM world_settings WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1').get(projectId) as any;
        if (existing) {
          const constraints = this.parseJson<any[]>(existing.constraints, []);
          const rules = this.parseJson<any[]>(existing.rules, []);
          constraints.push({ source: 'confirmed_archive', chapterId: row.source_chapter_id, title, summary, confirmedBy: actor, confirmedAt: now });
          rules.push(summary);
          db.prepare(`
            UPDATE world_settings
            SET constraints = ?, rules = ?, version = ?, updated_at = ?
            WHERE id = ?
          `).run(JSON.stringify(constraints), JSON.stringify(rules), Number(existing.version || 1) + 1, now, existing.id);
        } else {
          db.prepare(`
            INSERT INTO world_settings (id, project_id, name, rules, constraints, atmosphere, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            this.generateId(),
            projectId,
            title,
            JSON.stringify([summary]),
            JSON.stringify([{ source: 'confirmed_archive', chapterId: row.source_chapter_id, title, summary, confirmedBy: actor, confirmedAt: now }]),
            '',
            now,
            now,
          );
        }
        break;
      }

      case 'organization': {
        const existing = db.prepare(`
          SELECT id, description FROM organizations
          WHERE project_id = ? AND name = ?
          LIMIT 1
        `).get(projectId, title) as any;
        if (existing) {
          const description = [existing.description, summary].filter(Boolean).join('\n');
          db.prepare('UPDATE organizations SET description = ?, updated_at = ? WHERE id = ?').run(description, now, existing.id);
        } else {
          db.prepare(`
            INSERT INTO organizations (id, project_id, name, type, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(this.generateId(), projectId, title, 'confirmed_archive', summary, now, now);
        }
        break;
      }

      case 'outline': {
        if (row.target_id) {
          const existing = db.prepare('SELECT id, content, plot_points FROM outlines WHERE project_id = ? AND id = ?').get(projectId, row.target_id) as any;
          if (existing) {
            const plotPoints = this.parseJson<any[]>(existing.plot_points, []);
            plotPoints.push({ source: 'confirmed_archive', chapterIndex, title, summary, confirmedAt: now });
            const content = [existing.content, `【已确认章节变化】${summary}`].filter(Boolean).join('\n');
            db.prepare(`
              UPDATE outlines
              SET content = ?, plot_points = ?, updated_at = ?
              WHERE project_id = ? AND id = ?
            `).run(content, JSON.stringify(plotPoints), now, projectId, row.target_id);
            break;
          }
        }

        const maxOrder = db.prepare('SELECT COALESCE(MAX("order"), 0) as max_order FROM outlines WHERE project_id = ?').get(projectId) as any;
        db.prepare(`
          INSERT INTO outlines (
            id, project_id, level, parent_id, "order", title, content,
            chapter_function, goal_arc, target_words, actual_words,
            foreshadowing_ids, plot_points, status, character_ids,
            scenes, volumes, book_skeleton, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          this.generateId(),
          projectId,
          'note',
          null,
          Number(maxOrder?.max_order || 0) + 1,
          title,
          summary,
          'breathing',
          'crisis_resolve',
          0,
          0,
          '[]',
          JSON.stringify([{ source: 'confirmed_archive', chapterIndex, summary }]),
          'planned',
          '[]',
          null,
          null,
          null,
          now,
          now,
        );
        break;
      }

      case 'foreshadowing': {
        if (row.target_id) {
          const existing = db.prepare('SELECT id, content FROM foreshadowings WHERE project_id = ? AND id = ?').get(projectId, row.target_id) as any;
          if (existing) {
            const content = [existing.content, `【已确认章节变化】${summary}`].filter(Boolean).join('\n');
            db.prepare(`
              UPDATE foreshadowings
              SET content = ?, status = CASE WHEN status = 'pending' THEN 'buried' ELSE status END, updated_at = ?
              WHERE project_id = ? AND id = ?
            `).run(content, now, projectId, row.target_id);
            break;
          }
        }

        db.prepare(`
          INSERT INTO foreshadowings (
            id, project_id, content, status, type, importance, buried_at,
            buried_chapter_index, planned_recovery_at, planned_recovery_chapter_index,
            recovery_trigger, recovery_method, impact, related_character_ids,
            related_reversal_ids, overdue_threshold, scope, volume_index, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          this.generateId(),
          projectId,
          summary,
          'buried',
          'hint',
          2,
          now,
          chapterIndex || 0,
          null,
          null,
          null,
          null,
          null,
          '[]',
          '[]',
          5,
          volumeIndex ? 'volume' : 'chapter',
          volumeIndex,
          now,
          now,
        );
        break;
      }

      case 'timeline_state':
      case 'plot': {
        const existing = db.prepare('SELECT id, turning_points FROM plot_progress WHERE project_id = ? AND chapter_index = ?').get(projectId, chapterIndex || 0) as any;
        const point = { source: 'confirmed_archive', title, summary, confirmedAt: now };
        if (existing) {
          const turningPoints = this.parseJson<any[]>(existing.turning_points, []);
          turningPoints.push(point);
          db.prepare(`
            UPDATE plot_progress
            SET turning_points = ?, needs_review = 0, reviewed_by = ?, reviewed_at = ?, updated_at = ?
            WHERE id = ?
          `).run(JSON.stringify(turningPoints), actor, now, now, existing.id);
        } else {
          db.prepare(`
            INSERT INTO plot_progress (
              id, project_id, chapter_index, active_conflicts, resolved_conflicts,
              main_goal_progress, sub_goal_progress, emotional_beat, emotional_intensity,
              pacing_score, turning_points, needs_review, reviewed_by, reviewed_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            this.generateId(),
            projectId,
            chapterIndex || 0,
            '[]',
            '[]',
            0,
            '{}',
            'rising',
            5,
            5,
            JSON.stringify([point]),
            0,
            actor,
            now,
            now,
            now,
          );
        }
        break;
      }

      case 'plot_logic': {
        db.prepare(`
          INSERT INTO consistency_checks (
            id, project_id, check_type, status, message, severity,
            detected_at, chapter_index, details, resolved, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          this.generateId(),
          projectId,
          'plot_logic',
          'warning',
          summary,
          'medium',
          now,
          chapterIndex || null,
          JSON.stringify([{ field: title, expected: '与已确稿设定一致', actual: summary }]),
          0,
          now,
        );
        break;
      }
    }

    return {
      action: 'written',
      targetType: row.target_type,
      targetId: row.target_id || null,
      sourceChapterId: row.source_chapter_id || null,
      chapterIndex,
      title,
      summary,
    };
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
