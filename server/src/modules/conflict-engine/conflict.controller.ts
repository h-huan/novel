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

// 这里曾有四份只包含 outline_alignment 的冲突筛选 SQL，后果是数据库已有 6 条
// hardline.outline_alignment blocking 记录，但矛盾面板和统计都查不出来。
// 冲突类别条件只在这里定义一次，查询、统计、清理和自动处理共用。
const conflictIssuePredicate = (column: 'issue_type' | 'i.issue_type' = 'issue_type') =>
  `(${column} LIKE 'consistency.%' OR ${column} IN ('originality','outline_alignment','hardline.outline_alignment'))`;

// 同一 check_type（outline_alignment）由不同来源产出，严重度与处置方式完全不同：
// 缺事件/事实冲突要改正文，文风建议不用改，资料源冲突要改的是资料源而不是正文。
// 因此在前端行数据里补一个显式来源标签，避免列表里全部显示成「大纲矛盾」而误导作者。
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

  /**
   * 基于已确认设定对指定章节做确定性一致性校验。
   */
  @Post('detect')
  async runDetection(@Body() dto: { chapterIndex?: number; projectId?: string } = {}) {
    if (!dto.projectId) return { error: 'projectId required' };
    const result = await this.consistencyCheckService.checkConsistency(dto.projectId, {
      chapterIds: dto.chapterIndex ? [dto.chapterIndex] : undefined,
    });
    return { checked: result.length, conflicts: this.mapRows(this.queryRows(dto.projectId, dto.chapterIndex)) };
  }

  /**
   * 获取统一质量问题中的一致性问题。
   */
  @Get()
  getConflicts(@Query() query: { priority?: string; type?: string; status?: string; chapterIndex?: string; projectId?: string }) {
    const rows = this.queryRows(query.projectId, query.chapterIndex ? Number(query.chapterIndex) : undefined, query);
    return { conflicts: this.mapRows(rows) };
  }  /**
   * 获取单条冲突（真实）
   */
  @Get(':id')
  getConflict(@Param('id') id: string, @Query('projectId') projectId?: string) {
    const db = this.databaseService.getDb();
    const row = db.prepare(`SELECT i.*,c.chapter_index,c.status chapter_status FROM writing_quality_issues i
      LEFT JOIN chapters c ON c.id=i.chapter_id WHERE i.id=? AND i.project_id=?`).get(id, projectId || '') as any;
    if (!row) return { error: 'Conflict not found' };
    return this.mapRow(row);
  }

  /**
   * 解决统一质量问题。
   */
  @Post(':id/resolve')
  resolveConflict(@Param('id') id: string, @Query('projectId') projectId?: string, @Body() dto: { resolution?: string; note?: string } = {}) {
    const db = this.databaseService.getDb();
    const row = db.prepare('SELECT * FROM writing_quality_issues WHERE id = ? AND project_id = ?').get(id, projectId || '') as any;
    if (!row) return { error: 'Conflict not found' };
    db.prepare("UPDATE writing_quality_issues SET status='resolved',resolved_at=datetime('now'),resolved_by=?,updated_at=datetime('now') WHERE id=? AND project_id=?")
      .run(dto.note || dto.resolution || 'author', id, projectId || '');
    const updated = db.prepare(`SELECT i.*,c.chapter_index,c.status chapter_status FROM writing_quality_issues i
      LEFT JOIN chapters c ON c.id=i.chapter_id WHERE i.id=? AND i.project_id=?`).get(id, projectId || '') as any;
    return this.mapRow(updated);
  }

  /**
   * 自动解决（真实）：将 severity=low 的未解决项标记 resolved。
   */
  @Post('auto-resolve')
  autoResolve(@Query('projectId') projectId?: string) {
    const db = this.databaseService.getDb();
    const res = db.prepare(`UPDATE writing_quality_issues SET status='resolved',resolved_at=datetime('now'),
      resolved_by='auto',updated_at=datetime('now') WHERE project_id=? AND status='open' AND severity='low'
       AND ${conflictIssuePredicate()}`)
      .run(projectId || '');
    return { autoResolved: res.changes };
  }

  /**
   * 一键清理过期冲突（用户铁律：矛盾点非最新版本和当前正文的矛盾要删除）
   *
   * 删除「未解决」且「非 pass」的 conflict（status in ('warning','error') 且 status != 'resolved'），
   * 保留已解决（resolved）与已通过（pass）的历史记录。
   *
   * 可选参数：
   *   - projectId     必填
   *   - chapterIndex  可选；不传则清理整个项目的过期冲突；传了则只清理该章节。
   *
   * 返回：{ removed: number }
   */
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

  /**
   * 获取冲突统计（真实）
   */
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

  // ---------------- 内部辅助 ----------------

  private queryRows(projectId?: string, chapterIndex?: number, filter?: { priority?: string; type?: string; status?: string }) {
    if (!projectId) return [];
    const db = this.databaseService.getDb();
    // 这里曾漏掉状态条件，superseded 的旧验收问题仍被映射成 unresolved：
    // 面板 48 条、统计仅 15 条，用户无法辨认本轮真正的 6 条阻断硬线。
    const clauses = ['i.project_id = ?', conflictIssuePredicate('i.issue_type'), "i.status IN ('open','resolved')"];
    const params: any[] = [projectId];
    if (chapterIndex !== undefined && !Number.isNaN(chapterIndex)) {
      clauses.push('c.chapter_index = ?');
      params.push(chapterIndex);
    }
    if (filter?.status) {
      if (filter.status === 'resolved') {
        clauses.push("i.status = 'resolved'");
      } else if (filter.status === 'unresolved') {
        clauses.push("i.status = 'open'");
      }
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
    // 关联查询 chapter_id / chapter_status（按文档 R1 锁定正文优先级最高 P0）
    const chapterInfo = row.chapter_id ? { id: row.chapter_id, status: row.chapter_status || '' } : this.lookupChapter(row.project_id, row.chapter_index);
    const chapterId: string | null = chapterInfo?.id ?? null;
    const chapterStatus: string | null = chapterInfo?.status ?? null;
    // P0 优先级（按 R1 金字塔）：当 chapter 状态为 locked 时，所有与之相关的冲突都视为 P0 锁定正文冲突
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
      // 可执行动作（按文档 R1/R4 流程 + 来源/类型决定默认推荐动作）
      actions: this.buildActions({ checkType, source, level, chapterId, severity, status }),
    };
  }

  /**
   * 查 chapters 表得到 chapter_id 与 status（用于 P0 升级、动作跳转）。
   * chapter_index 在全项目内唯一（idx_ch_volume 联合索引覆盖）。
   */
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
   * 根据矛盾来源 / 类型 / 严重度 / 章节状态，生成可执行动作列表。
   * 文档依据：
   * - R1 金字塔：P0 锁定正文优先级最高，AI 不可改锁定正文
   * - R2 P2 基础设定：可根据正文优化补充，但不得超越世界观
   * - R4 流程：高优先级锁定 → 以高优先级为准自动修改低优先级；高优先级可改 → 评估 + 用户确认
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
    // 1) 跳到章节（最常用前置动作）
    if (input.chapterId) {
      actions.push({
        kind: 'view_chapter',
        label: '查看本章节',
        tone: 'secondary',
        reason: '打开本章节编辑器，便于对照大纲/设定核查',
      });
    }
    // 2) 按 checkType 给针对性动作
    if (input.checkType === 'outline_alignment') {
      // 来源分层：只有「缺事件 / 有证据的事实冲突」（alignment_verifier / _hardline）才值得整章重写。
      // 文风建议（advisory）是非阻断的措辞问题，给整章重写按钮会误导作者白烧 token；
      // 资料源冲突（source_conflict）要改的是资料源本身，正文按大纲执行即可，同样不该重写正文。
      const isAdvisory = input.source === 'alignment_verifier_advisory';
      const isSourceConflict = input.source === 'alignment_verifier_source_conflict';
      if (isSourceConflict) {
        actions.push({
          kind: 'open_outline_editor',
          label: '打开大纲编辑器确认权威源',
          tone: 'primary',
          reason: '资料源互相矛盾（世界档案/简介 vs 详细大纲）：正文按大纲执行即可，先确认哪一份写错，再修正那一份资料。',
        });
      } else if (!isAdvisory) {
        actions.push({
          kind: 'regenerate_aligned_body',
          label: 'AI 重写正文对齐大纲（推荐）',
          tone: 'primary',
          reason: '按文档 R2 规则，大纲（P2 基础设定）优先级高于未锁定正文（P3），以大纲为准让 AI 重新生成本章',
        });
        actions.push({
          kind: 'open_outline_editor',
          label: '打开大纲编辑器',
          tone: 'secondary',
          reason: '若你确认本章节内容好而大纲写错了，可在大纲中调整本章事件；但会同时影响后续章节生成（按 R2 提示）',
        });
      }
    } else if (input.checkType === 'world_setting') {
      actions.push({
        kind: 'edit_world_setting',
        label: '打开世界观设定',
        tone: 'primary',
        reason: '按 R2，世界观（P1）可改但需人工确认。修改后会列出受影响的章节。',
      });
      if (input.chapterId && input.level !== 'P0') {
        actions.push({
          kind: 'regenerate_aligned_body',
          label: 'AI 修订正文匹配世界观',
          tone: 'secondary',
          reason: '以 P1 世界观为准自动修订本章正文',
        });
      }
    } else if (input.checkType === 'character') {
      actions.push({
        kind: 'edit_character',
        label: '打开角色设定',
        tone: 'primary',
        reason: '修正角色性格反义词对冲突（一致性检测）',
      });
      if (input.chapterId && input.level !== 'P0') {
        actions.push({
          kind: 'regenerate_aligned_body',
          label: 'AI 修订正文匹配角色',
          tone: 'secondary',
          reason: '以确认的角色设定为准修订本章',
        });
      }
    } else if (input.checkType === 'timeline') {
      if (input.chapterId) {
        actions.push({
          kind: 'view_timeline',
          label: '查看时间线',
          tone: 'primary',
          reason: '跳到时间线页核查本章时间序号与衔接',
        });
      }
    } else if (input.checkType === 'plot_logic') {
      if (input.chapterId && input.level !== 'P0') {
        actions.push({
          kind: 'regenerate_aligned_body',
          label: 'AI 修订情节逻辑',
          tone: 'primary',
          reason: '以确认的伏笔/事件链为准重新生成',
        });
      }
    }
    // 3) 锁定正文警告：禁止 AI 改动
    if (input.level === 'P0') {
      // 把 AI 重写类动作的 tone 全部标 danger（更醒目），文案补一句
      for (const a of actions) {
        if (a.kind.startsWith('regenerate')) {
          a.tone = 'danger';
          a.reason = '⚠️ 本章已锁定（R1 锁定正文优先级最高）。若必须改，请先解锁该章节。';
        }
      }
    }
    // 4) 通用：标记已解决 + 重新检测
    actions.push({
      kind: 'mark_resolved',
      label: '标记为已解决',
      tone: 'secondary',
      reason: '若你已人工处理（改正文/改设定/确认有误报），可手动标记解决',
    });
    actions.push({
      kind: 'recheck',
      label: '🔄 重新检测本章',
      tone: 'secondary',
      reason: '基于最新设定重新跑确定性一致性检查',
    });
    return actions;
  }
}
