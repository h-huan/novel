/**
 * 冲突检测 Controller
 * API: 检测 / 报告列表 / 解决冲突 / 统计
 *
 * 数据来源为统一 QualityIssue；这里只保留面向“前后矛盾”页面的查询视图。
 */
import { Controller, Get, Post, Body, Param, Query, Inject, Delete } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../../database/database.service';
import { ConsistencyCheckService } from '../../state/consistency-check.service';

const CHECK_TYPE_LABEL: Record<string, string> = {
  character: '人物OOC',
  world_setting: '设定矛盾',
  timeline: '时间线冲突',
  plot_logic: '情节逻辑',
  outline_alignment: '大纲矛盾',
  'hardline.outline_alignment': '正文硬红线',
};

const conflictIssuePredicate = (column: 'issue_type' | 'i.issue_type' = 'issue_type') =>
  `(${column} LIKE 'consistency.%' OR ${column} IN ('originality','outline_alignment','hardline.outline_alignment'))`;

const SOURCE_LABEL: Record<string, string> = {
  deterministic: '叙事逻辑',
  alignment_verifier: '大纲一致性',
  alignment_verifier_hardline: '语言与内容规范',
  alignment_verifier_advisory: '局部措辞建议（非阻断）',
  alignment_verifier_source_conflict: '资料源冲突',
};

@ApiTags('conflict')
@Controller('conflicts')
export class ConflictController {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(ConsistencyCheckService) private readonly consistencyCheckService: ConsistencyCheckService,
  ) {}

  @Post('detect')
  async runDetection(@Body() dto: { chapterIndex?: number; projectId?: string } = {}) {
    if (!dto.projectId) return { error: 'projectId required' };
    const result = await this.consistencyCheckService.checkConsistency(dto.projectId, {
      chapterIds: dto.chapterIndex ? [dto.chapterIndex] : undefined,
    });
    return { checked: result.length, conflicts: this.mapRows(this.queryRows(dto.projectId, dto.chapterIndex)) };
  }

  @Get()
  getConflicts(@Query() query: { priority?: string; type?: string; status?: string; chapterIndex?: string; projectId?: string }) {
    const rows = this.queryRows(query.projectId, query.chapterIndex ? Number(query.chapterIndex) : undefined, query);
    return { conflicts: this.mapRows(rows) };
  }

  @Get(':id')
  getConflict(@Param('id') id: string, @Query('projectId') projectId?: string) {
    const db = this.databaseService.getDb();
    const row = db.prepare(`SELECT i.*,c.chapter_index,c.status chapter_status FROM writing_quality_issues i
      LEFT JOIN chapters c ON c.id=i.chapter_id WHERE i.id=? AND i.project_id=?`).get(id, projectId || '') as any;
    if (!row) return { error: 'Conflict not found' };
    return this.mapRow(row);
  }

  /**
   * 标记解决后必须基于最新 Canon 重新校验。标记只是“作者已处理”的操作记录，
   * 不能代替一致性事实；若问题仍存在，检测器会重新写回 open issue。
   */
  @Post(':id/resolve')
  async resolveConflict(@Param('id') id: string, @Query('projectId') projectId?: string, @Body() dto: { resolution?: string; note?: string } = {}) {
    if (!projectId) return { error: 'projectId required' };
    const db = this.databaseService.getDb();
    const row = db.prepare('SELECT * FROM writing_quality_issues WHERE id = ? AND project_id = ?').get(id, projectId) as any;
    if (!row) return { error: 'Conflict not found' };
    db.prepare("UPDATE writing_quality_issues SET status='resolved',resolved_at=datetime('now'),resolved_by=?,updated_at=datetime('now') WHERE id=? AND project_id=?")
      .run(dto.note || dto.resolution || 'author', id, projectId);
    const updated = db.prepare(`SELECT i.*,c.chapter_index,c.status chapter_status FROM writing_quality_issues i
      LEFT JOIN chapters c ON c.id=i.chapter_id WHERE i.id=? AND i.project_id=?`).get(id, projectId) as any;
    const consistency = await this.recheckAfterMutation(projectId);
    return { ...this.mapRow(updated), consistency };
  }

  /**
   * 低严重度自动标记后同样立即复检；仍真实存在的问题会重新出现，禁止“批量已解决”掩盖矛盾。
   */
  @Post('auto-resolve')
  async autoResolve(@Query('projectId') projectId?: string) {
    if (!projectId) return { error: 'projectId required', autoResolved: 0 };
    const db = this.databaseService.getDb();
    const res = db.prepare(`UPDATE writing_quality_issues SET status='resolved',resolved_at=datetime('now'),
      resolved_by='auto',updated_at=datetime('now') WHERE project_id=? AND status='open' AND severity='low'
       AND ${conflictIssuePredicate()}`)
      .run(projectId);
    const consistency = await this.recheckAfterMutation(projectId);
    return { autoResolved: res.changes, consistency };
  }

  @Delete('stale')
  cleanupStaleConflicts(
    @Query('projectId') projectId?: string,
    @Query('chapterIndex') chapterIndex?: string,
  ) {
    if (!projectId) return { error: 'projectId required', removed: 0 };
    const db = this.databaseService.getDb();
    const idx = chapterIndex != null && chapterIndex !== '' && !Number.isNaN(Number(chapterIndex))
      ? Number(chapterIndex)
      : null;
    const removed = idx != null
      ? db.prepare(`DELETE FROM writing_quality_issues WHERE project_id=? AND chapter_id IN
          (SELECT id FROM chapters WHERE project_id=? AND chapter_index=?) AND status IN ('open','superseded')
           AND ${conflictIssuePredicate()}`)
        .run(projectId, projectId, idx).changes
      : db.prepare(`DELETE FROM writing_quality_issues WHERE project_id=? AND status IN ('open','superseded')
           AND ${conflictIssuePredicate()}`)
        .run(projectId).changes;
    return { removed: Number(removed || 0) };
  }

  @Get('stats')
  getStats(@Query('projectId') projectId?: string) {
    const db = this.databaseService.getDb();
    const category = conflictIssuePredicate();
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM writing_quality_issues WHERE project_id=? AND ${category} AND status IN ('open','resolved')`).get(projectId || '') as any).c;
    const resolved = (db.prepare(`SELECT COUNT(*) AS c FROM writing_quality_issues WHERE project_id=? AND ${category} AND status='resolved'`).get(projectId || '') as any).c;
    const p0 = (db.prepare(`SELECT COUNT(*) AS c FROM writing_quality_issues WHERE project_id=? AND ${category} AND severity='blocking' AND status='open'`).get(projectId || '') as any).c;
    return {
      total,
      resolved,
      resolveRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
      unresolved: total - resolved,
      p0Pending: p0,
    };
  }

  private async recheckAfterMutation(projectId: string) {
    const checks = await this.consistencyCheckService.checkConsistency(projectId);
    const openRows = this.queryRows(projectId, undefined, { status: 'unresolved' });
    const blocking = openRows.filter((row: any) => row.severity === 'blocking' || row.severity === 'high').length;
    return {
      checked: checks.length,
      consistent: openRows.length === 0,
      openConflicts: openRows.length,
      blockingConflicts: blocking,
      message: openRows.length === 0 ? '保存后复检通过' : '保存后仍存在冲突，请继续处理后再次复检',
    };
  }

  private queryRows(projectId?: string, chapterIndex?: number, filter?: { priority?: string; type?: string; status?: string }) {
    if (!projectId) return [];
    const db = this.databaseService.getDb();
    const clauses = ['i.project_id = ?', conflictIssuePredicate('i.issue_type'), "i.status IN ('open','resolved')"];
    const params: any[] = [projectId];
    if (chapterIndex !== undefined && !Number.isNaN(chapterIndex)) {
      clauses.push('c.chapter_index = ?');
      params.push(chapterIndex);
    }
    if (filter?.status) {
      if (filter.status === 'resolved') clauses.push("i.status = 'resolved'");
      else if (filter.status === 'unresolved') clauses.push("i.status = 'open'");
    }
    if (filter?.priority) {
      const severity = { critical: 'high', high: 'high', medium: 'medium', low: 'low' }[filter.priority] || filter.priority;
      clauses.push('i.severity = ?');
      params.push(severity);
    }
    if (filter?.type) {
      const raw = CHECK_TYPE_LABEL[filter.type] ? filter.type : Object.keys(CHECK_TYPE_LABEL).find(k => CHECK_TYPE_LABEL[k] === filter.type) || filter.type;
      clauses.push('i.issue_type = ?');
      params.push(['outline_alignment', 'originality'].includes(raw) || raw.startsWith('hardline.')
        ? raw : raw.startsWith('consistency.') ? raw : `consistency.${raw}`);
    }
    const sql = `SELECT i.*,c.chapter_index,c.status chapter_status FROM writing_quality_issues i
      LEFT JOIN chapters c ON c.id=i.chapter_id WHERE ${clauses.join(' AND ')}
      ORDER BY i.created_at DESC,c.chapter_index ASC`;
    return db.prepare(sql).all(...params) as any[];
  }

  private mapRows(rows: any[]): any[] {
    return rows.map(row => this.mapRow(row));
  }

  private mapRow(row: any): any {
    const severity: 'high' | 'medium' | 'low' = ['blocking','high'].includes(row.severity) ? 'high' : row.severity === 'low' ? 'low' : 'medium';
    const status = row.status === 'resolved' ? 'resolved' : 'unresolved';
    let details: any[] = [];
    try { details = JSON.parse(row.payload || '{}')?.details?.items || []; } catch { details = []; }
    const chapterInfo = row.chapter_id ? { id: row.chapter_id, status: row.chapter_status || '' } : this.lookupChapter(row.project_id, row.chapter_index);
    const chapterId: string | null = chapterInfo?.id ?? null;
    const chapterStatus: string | null = chapterInfo?.status ?? null;
    // level 只表达“编辑保护/处理紧急度”，不再充当事实权威排序。
    // locked=P0 的含义只有一个：自动系统不得改这段正文；若它与上层 Canon 冲突必须人工决定。
    const level: 'P0' | 'P1' | 'P2' | 'P3' = chapterStatus === 'locked'
      ? 'P0'
      : severity === 'high' ? 'P1'
      : severity === 'low' ? 'P3'
      : 'P2';
    const checkType = String(row.issue_type || '').replace(/^consistency\./, '');
    let source = 'quality_issue';
    try { source = JSON.parse(row.payload || '{}')?.qualityIssue?.source || source; } catch { /* keep canonical source */ }
    return {
      id: row.id,
      type: CHECK_TYPE_LABEL[checkType] || checkType,
      description: row.summary || row.title,
      priority: severity,
      status,
      level,
      location: row.chapter_index != null ? `第${row.chapter_index}章` : '全局',
      suggestion: details?.[0]?.suggestion || '',
      chapterIndex: row.chapter_index,
      chapterId,
      chapterStatus,
      checkType,
      source,
      sourceLabel: SOURCE_LABEL[source] || '确定性一致性检测',
      blocking: row.severity === 'blocking',
      editProtection: chapterStatus === 'locked' ? 'locked_body_no_auto_edit' : 'normal',
      authorityPolicy: '上层 Canon 约束下层；锁定正文是编辑保护而非反向覆盖上层事实；冲突时优先修改最低权威且未锁定、影响范围最小的依赖项',
      actions: this.buildActions({ checkType, source, level, chapterId, severity, status }),
    };
  }

  private lookupChapter(projectId: string | undefined, chapterIndex: number | null | undefined): { id: string; status: string } | null {
    if (!projectId || chapterIndex == null) return null;
    try {
      const db = this.databaseService.getDb();
      const row = db.prepare(
        'SELECT id, status FROM chapters WHERE project_id = ? AND chapter_index = ? ORDER BY created_at DESC LIMIT 1'
      ).get(projectId, chapterIndex) as any;
      return row ? { id: row.id, status: row.status } : null;
    } catch {
      return null;
    }
  }

  /**
   * 动作遵循两条独立规则：
   * 1) 事实权威：上层 Canon 约束下层，优先修改最低权威、影响范围最小的未锁定依赖项；
   * 2) 编辑保护：锁定正文禁止自动修改。锁定正文与世界观/宪法冲突时不能判正文“赢”，必须人工选择并重新校验。
   */
  private buildActions(input: {
    checkType: string;
    source: string;
    level: 'P0' | 'P1' | 'P2' | 'P3';
    chapterId: string | null;
    severity: 'high' | 'medium' | 'low';
    status: string;
  }): Array<{ kind: string; label: string; tone: 'primary' | 'secondary' | 'danger'; reason: string; }> {
    if (input.status === 'resolved') return [];
    const actions: Array<{ kind: string; label: string; tone: 'primary' | 'secondary' | 'danger'; reason: string; }> = [];
    if (input.chapterId) {
      actions.push({ kind: 'view_chapter', label: '查看本章节', tone: 'secondary', reason: '打开本章节编辑器，对照上层 Canon 与本章事实核查' });
    }

    if (input.checkType === 'outline_alignment') {
      const isAdvisory = input.source === 'alignment_verifier_advisory';
      const isSourceConflict = input.source === 'alignment_verifier_source_conflict';
      if (isSourceConflict) {
        actions.push({
          kind: 'open_outline_editor',
          label: '确认冲突资料源',
          tone: 'primary',
          reason: '资料源互相矛盾时禁止模型自行选边。先确认上层 Canon，随后只修改较低权威且影响范围更小的未锁定资料。',
        });
      } else if (!isAdvisory && input.level !== 'P0') {
        actions.push({
          kind: 'regenerate_aligned_body',
          label: 'AI 局部修订正文对齐章纲',
          tone: 'primary',
          reason: '详细章纲约束未锁定正文；只修有证据的局部冲突，不允许整章重写。',
        });
        actions.push({
          kind: 'open_outline_editor',
          label: '打开大纲编辑器',
          tone: 'secondary',
          reason: '只有确认章纲自身错误时才改章纲，并重新校验其下游影响。',
        });
      }
    } else if (input.checkType === 'world_setting') {
      actions.push({
        kind: 'edit_world_setting',
        label: '人工查看世界观',
        tone: input.level === 'P0' ? 'danger' : 'secondary',
        reason: '世界观属于高权威 Canon，项目创建后只能由作者明确修改；如果世界观正确，应修改较低层未锁定内容。',
      });
      if (input.chapterId && input.level !== 'P0') {
        actions.push({ kind: 'regenerate_aligned_body', label: 'AI 局部修订正文匹配世界观', tone: 'primary', reason: '世界观正确时，只修改较低权威的未锁定正文冲突片段。' });
      }
    } else if (input.checkType === 'character') {
      actions.push({ kind: 'edit_character', label: '打开角色设定', tone: 'secondary', reason: '先确认角色 Canon 是否正确；若正确，优先修较低层未锁定正文。' });
      if (input.chapterId && input.level !== 'P0') {
        actions.push({ kind: 'regenerate_aligned_body', label: 'AI 局部修订正文匹配角色', tone: 'primary', reason: '以已确认角色状态为准做最小范围修订。' });
      }
    } else if (input.checkType === 'timeline') {
      if (input.chapterId) actions.push({ kind: 'view_timeline', label: '查看时间线', tone: 'primary', reason: '核查时间线与本章事件顺序；优先修低权威且影响范围小的一侧。' });
    } else if (input.checkType === 'plot_logic') {
      if (input.chapterId && input.level !== 'P0') {
        actions.push({ kind: 'regenerate_aligned_body', label: 'AI 局部修订情节逻辑', tone: 'primary', reason: '以已确认事件链/伏笔为准做最小范围局部修订。' });
      }
    }

    if (input.level === 'P0') {
      actions.push({
        kind: 'manual_authority_decision',
        label: '人工确认冲突处理',
        tone: 'danger',
        reason: '本章正文已锁定，禁止自动修改；锁定不代表正文高于世界观/宪法。若双方冲突，必须由作者明确决定改哪一侧，再重新校验。',
      });
    }

    actions.push({ kind: 'mark_resolved', label: '标记为已处理并复检', tone: 'secondary', reason: '保存后系统会立即重新检测；真实仍存在的冲突会重新打开。' });
    actions.push({ kind: 'recheck', label: '重新检测', tone: 'secondary', reason: '基于最新 Canon 重新跑一致性检查。' });
    return actions;
  }
}