import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { VectorIndexService } from '../rag/vector-index.service';

export interface GenerationRecoveryAudit {
  projectId: string;
  status: string;
  targetWords: number;
  counts: Record<string, number>;
  invalidChapterTargets: number;
  plannedChapterWords: number;
  outlineBodyMappingValid: boolean;
  protectedHumanWork: boolean;
  protectionReasons: string[];
  missingModules: string[];
  consistencyIssues: string[];
  indexCounts: Record<string, number>;
  canResume: boolean;
  running: boolean;
  recommendedAction: string;
}

export interface GenerationRecoverySnapshot {
  projectId: string;
  status: string;
  tables: Record<string, Record<string, unknown>[]>;
  vectors: Record<string, Array<{ id: string; vector: number[]; metadata: Record<string, unknown> }>>;
}

@Injectable()
export class GenerationRecoveryService {
  private readonly runningProjects = new Set<string>();

  constructor(
    private readonly database: DatabaseService,
    private readonly vectorIndex: VectorIndexService,
  ) {}

  isRunning(projectId: string): boolean {
    return this.runningProjects.has(projectId);
  }

  acquire(projectId: string): void {
    if (this.runningProjects.has(projectId)) {
      throw new ConflictException('该项目正在恢复生成，请勿重复启动。');
    }
    this.runningProjects.add(projectId);
  }

  release(projectId: string): void {
    this.runningProjects.delete(projectId);
  }

  async audit(projectId: string): Promise<GenerationRecoveryAudit> {
    const db = this.database.getDb();
    const project = db.prepare(
      'SELECT id,type,status,target_words,confirmed_idea,idea_seed FROM projects WHERE id=?',
    ).get(projectId) as any;
    if (!project) throw new NotFoundException('项目不存在');

    const scalar = (sql: string, ...params: any[]) =>
      Number((db.prepare(sql).get(...params) as any)?.count || 0);
    const counts = {
      outlines: scalar('SELECT COUNT(*) count FROM outlines WHERE project_id=?', projectId),
      outlineChapters: scalar("SELECT COUNT(*) count FROM outlines WHERE project_id=? AND level='chapter'", projectId),
      chapters: scalar('SELECT COUNT(*) count FROM chapters WHERE project_id=?', projectId),
      characters: scalar('SELECT COUNT(*) count FROM characters WHERE project_id=?', projectId),
      worldSettings: scalar('SELECT COUNT(*) count FROM world_settings WHERE project_id=?', projectId),
      organizations: scalar('SELECT COUNT(*) count FROM organizations WHERE project_id=?', projectId),
      mapPoints: scalar('SELECT COUNT(*) count FROM map_points WHERE project_id=?', projectId),
      foreshadowings: scalar('SELECT COUNT(*) count FROM foreshadowings WHERE project_id=?', projectId),
      timelines: scalar('SELECT COUNT(*) count FROM timelines WHERE project_id=?', projectId),
      timelineEvents: scalar(
        'SELECT COUNT(*) count FROM timeline_events e JOIN timelines t ON t.id=e.timeline_id WHERE t.project_id=?',
        projectId,
      ),
    };

    const chapterPlan = db.prepare(`SELECT COUNT(*) count,
      SUM(CASE WHEN target_words < 3200 OR target_words > 4000 THEN 1 ELSE 0 END) invalid,
      COALESCE(SUM(target_words),0) planned
      FROM outlines WHERE project_id=? AND level='chapter'`).get(projectId) as any;
    const mappingProblems = scalar(`SELECT COUNT(*) count FROM outlines o
      LEFT JOIN chapters c ON c.outline_id=o.id AND c.project_id=o.project_id
      WHERE o.project_id=? AND o.level='chapter' AND c.id IS NULL`, projectId)
      + scalar(`SELECT COUNT(*) count FROM chapters c
      LEFT JOIN outlines o ON o.id=c.outline_id AND o.project_id=c.project_id
      WHERE c.project_id=? AND o.id IS NULL`, projectId);

    const protectionReasons: string[] = [];
    if (scalar(`SELECT COUNT(*) count FROM chapters WHERE project_id=? AND
      (length(trim(COALESCE(content,'')))>0 OR locked_at IS NOT NULL OR status IN ('reviewing','locked','completed'))`, projectId) > 0) {
      // Existing body text must never be overwritten during recovery, but text
      // alone is not proof that the author wrote it. Manual provenance is
      // reported separately from version history below.
      protectionReasons.push('已有正文、已提交或已锁定正文');
    }
    if (scalar("SELECT COUNT(*) count FROM outlines WHERE project_id=? AND status='locked'", projectId) > 0) {
      protectionReasons.push('已有锁定大纲');
    }
    const manuallyVersioned = scalar(`SELECT COUNT(*) count FROM version_history v
      WHERE lower(COALESCE(v.created_by,'')) IN ('author','manual','manual_edit','manual-version-restore')
      AND v.entity_id IN (
        SELECT id FROM chapters WHERE project_id=? UNION SELECT id FROM outlines WHERE project_id=?
        UNION SELECT id FROM characters WHERE project_id=? UNION SELECT id FROM world_settings WHERE project_id=?
        UNION SELECT id FROM organizations WHERE project_id=? UNION SELECT id FROM map_points WHERE project_id=?
        UNION SELECT id FROM foreshadowings WHERE project_id=?
      )`, projectId, projectId, projectId, projectId, projectId, projectId, projectId);
    if (manuallyVersioned > 0) protectionReasons.push('已有作者手动修改并留存版本的创作资料');

    const missingModules: string[] = [];
    if (!counts.worldSettings) missingModules.push('世界观');
    if (!counts.characters) missingModules.push('人物');
    if (!counts.outlineChapters) missingModules.push('章节大纲');
    if (!counts.chapters) missingModules.push('正文空壳');
    // 组织、地点和伏笔是按故事实际内容建立的事实类型，不是固定数量门槛。
    // 某些短篇没有独立组织或可单列伏笔；强制非空只会诱导模型编造无关资料。
    if (!counts.timelines || !counts.timelineEvents) missingModules.push('时间线');

    const consistencyIssues: string[] = [];
    const invalidChapterTargets = Number(chapterPlan?.invalid || 0);
    const plannedChapterWords = Number(chapterPlan?.planned || 0);
    if (invalidChapterTargets) consistencyIssues.push(`${invalidChapterTargets}章目标字数不在3200-4000`);
    if (counts.outlineChapters && plannedChapterWords !== Number(project.target_words)) {
      consistencyIssues.push(`章节目标合计${plannedChapterWords}字，与项目目标${project.target_words}字不一致`);
    }
    if (mappingProblems || counts.outlineChapters !== counts.chapters) {
      consistencyIssues.push('章节大纲与正文空壳不是一一对应');
    }
    const invalidForeshadowRefs = counts.outlineChapters
      ? scalar(`SELECT COUNT(*) count FROM foreshadowings WHERE project_id=? AND
        (buried_chapter_index < 1 OR buried_chapter_index > ? OR
        (planned_recovery_chapter_index IS NOT NULL AND
        (planned_recovery_chapter_index < buried_chapter_index OR planned_recovery_chapter_index > ?)))`,
        projectId, counts.outlineChapters, counts.outlineChapters)
      : 0;
    if (invalidForeshadowRefs) consistencyIssues.push(`${invalidForeshadowRefs}条伏笔章节引用无效`);

    const indexCounts: Record<string, number> = { characters: 0, outlines: 0, foreshadowings: 0 };
    try {
      indexCounts.characters = (await this.vectorIndex.getChunksByMetadata(
        VectorIndexService.COLLECTIONS.CHARACTERS, { projectId },
      )).length;
      indexCounts.outlines = (await this.vectorIndex.getChunksByMetadata(
        VectorIndexService.COLLECTIONS.CHAPTERS_ROLLING, { projectId },
      )).length;
      indexCounts.foreshadowings = (await this.vectorIndex.getChunksByMetadata(
        VectorIndexService.COLLECTIONS.FORESHADOWINGS, { projectId },
      )).length;
    } catch {
      consistencyIssues.push('RAG索引不可读取');
    }
    if (indexCounts.characters < counts.characters) consistencyIssues.push('人物RAG索引不完整');
    if (indexCounts.outlines < counts.outlineChapters) consistencyIssues.push('大纲RAG索引不完整');
    if (indexCounts.foreshadowings < counts.foreshadowings) consistencyIssues.push('伏笔RAG索引不完整');

    const hasConfirmedSource = Boolean(String(project.confirmed_idea || project.idea_seed || '').trim());
    if (!hasConfirmedSource) consistencyIssues.push('缺少确认灵感/项目种子，无法按原配置恢复');
    const protectedHumanWork = protectionReasons.length > 0;
    const running = this.isRunning(projectId);
    const resumableStatus = ['generation_failed', 'creating'].includes(String(project.status));
    const canResume = resumableStatus && !protectedHumanWork && hasConfirmedSource && !running;

    return {
      projectId,
      status: String(project.status),
      targetWords: Number(project.target_words),
      counts,
      invalidChapterTargets,
      plannedChapterWords,
      outlineBodyMappingValid: mappingProblems === 0 && counts.outlineChapters === counts.chapters,
      protectedHumanWork,
      protectionReasons,
      missingModules,
      consistencyIssues,
      indexCounts,
      canResume,
      running,
      recommendedAction: running
        ? '等待当前恢复任务完成'
        : protectedHumanWork
          ? '先处理人工资料影响报告，不能自动覆盖'
          : canResume
            ? '继续生成并修复'
            : project.status === 'active'
              ? '项目已激活，无需恢复'
              : '补齐确认灵感后再恢复',
    };
  }

  async clearFailedGeneratedAssets(projectId: string): Promise<void> {
    const audit = await this.audit(projectId);
    if (!['generation_failed', 'creating'].includes(audit.status)) {
      throw new ConflictException('只有创建失败或创建中的项目可以恢复。');
    }
    if (audit.protectedHumanWork) {
      throw new ConflictException(`检测到受保护资料：${audit.protectionReasons.join('；')}。已停止自动覆盖。`);
    }

    await this.deleteProjectVectors(projectId);

    const db = this.database.getDb();
    db.exec('BEGIN IMMEDIATE');
    try {
      this.deleteProjectRows(projectId);
      db.prepare("UPDATE projects SET status='creating',updated_at=? WHERE id=?")
        .run(new Date().toISOString(), projectId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async captureSnapshot(projectId: string): Promise<GenerationRecoverySnapshot> {
    const db = this.database.getDb();
    const project = db.prepare('SELECT status FROM projects WHERE id=?').get(projectId) as any;
    if (!project) throw new NotFoundException('项目不存在');
    const tables: Record<string, Record<string, unknown>[]> = {
      world_settings: db.prepare('SELECT * FROM world_settings WHERE project_id=?').all(projectId) as any[],
      characters: db.prepare('SELECT * FROM characters WHERE project_id=?').all(projectId) as any[],
      organizations: db.prepare('SELECT * FROM organizations WHERE project_id=? ORDER BY id').all(projectId) as any[],
      map_points: db.prepare('SELECT * FROM map_points WHERE project_id=? ORDER BY id').all(projectId) as any[],
      outlines: db.prepare(`SELECT * FROM outlines WHERE project_id=? ORDER BY
        CASE level WHEN 'book' THEN 0 WHEN 'volume' THEN 1 WHEN 'chapter' THEN 2 ELSE 3 END,"order",id`).all(projectId) as any[],
      chapters: db.prepare('SELECT * FROM chapters WHERE project_id=?').all(projectId) as any[],
      foreshadowings: db.prepare('SELECT * FROM foreshadowings WHERE project_id=?').all(projectId) as any[],
      timelines: db.prepare('SELECT * FROM timelines WHERE project_id=?').all(projectId) as any[],
      timeline_events: db.prepare(`SELECT e.* FROM timeline_events e
        JOIN timelines t ON t.id=e.timeline_id WHERE t.project_id=? ORDER BY e.id`).all(projectId) as any[],
    };
    const vectors: GenerationRecoverySnapshot['vectors'] = {};
    for (const collection of this.recoveryCollections()) {
      vectors[collection] = await this.vectorIndex.getChunksByMetadata(collection, { projectId });
    }
    return { projectId, status: String(project.status), tables, vectors };
  }

  async restoreSnapshot(snapshot: GenerationRecoverySnapshot): Promise<void> {
    await this.deleteProjectVectors(snapshot.projectId);
    const db = this.database.getDb();
    db.exec('BEGIN IMMEDIATE');
    try {
      this.deleteProjectRows(snapshot.projectId);
      for (const table of [
        'world_settings', 'characters', 'organizations', 'map_points', 'outlines',
        'chapters', 'foreshadowings', 'timelines', 'timeline_events',
      ]) {
        this.insertRows(table, snapshot.tables[table] || []);
      }
      db.prepare('UPDATE projects SET status=?,updated_at=? WHERE id=?')
        .run(snapshot.status, new Date().toISOString(), snapshot.projectId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    for (const collection of this.recoveryCollections()) {
      const chunks = snapshot.vectors[collection] || [];
      if (chunks.length) await this.vectorIndex.upsertChunksStrict(collection, chunks);
    }
  }

  private recoveryCollections(): string[] {
    return [
      VectorIndexService.COLLECTIONS.CHARACTERS,
      VectorIndexService.COLLECTIONS.CHAPTERS_ROLLING,
      VectorIndexService.COLLECTIONS.FORESHADOWINGS,
    ];
  }

  private async deleteProjectVectors(projectId: string): Promise<void> {
    for (const collection of this.recoveryCollections()) {
      const chunks = await this.vectorIndex.getChunksByMetadata(collection, { projectId });
      if (chunks.length) {
        await this.vectorIndex.deleteChunksStrict(collection, chunks.map(chunk => chunk.id));
      }
    }
  }

  private deleteProjectRows(projectId: string): void {
    const db = this.database.getDb();
    db.prepare('DELETE FROM timeline_events WHERE timeline_id IN (SELECT id FROM timelines WHERE project_id=?)').run(projectId);
    db.prepare('DELETE FROM timelines WHERE project_id=?').run(projectId);
    db.prepare('DELETE FROM chapters WHERE project_id=?').run(projectId);
    db.prepare('DELETE FROM outlines WHERE project_id=?').run(projectId);
    db.prepare('DELETE FROM foreshadowings WHERE project_id=?').run(projectId);
    db.prepare('DELETE FROM map_points WHERE project_id=?').run(projectId);
    db.prepare('DELETE FROM organizations WHERE project_id=?').run(projectId);
    db.prepare('DELETE FROM characters WHERE project_id=?').run(projectId);
    db.prepare('DELETE FROM world_settings WHERE project_id=?').run(projectId);
  }

  private insertRows(table: string, rows: Record<string, unknown>[]): void {
    if (!rows.length) return;
    const db = this.database.getDb();
    for (const row of rows) {
      const columns = Object.keys(row);
      const quotedColumns = columns.map(column => `"${column.replace(/"/g, '""')}"`).join(',');
      const placeholders = columns.map(() => '?').join(',');
      db.prepare(`INSERT INTO "${table}" (${quotedColumns}) VALUES (${placeholders})`)
        .run(...columns.map(column => row[column] as any));
    }
  }

  async assertActivationReady(projectId: string): Promise<GenerationRecoveryAudit> {
    const audit = await this.audit(projectId);
    const issues = [...audit.missingModules, ...audit.consistencyIssues];
    if (issues.length) {
      throw new ConflictException(`激活前完整性校验未通过：${[...new Set(issues)].join('；')}`);
    }
    return audit;
  }
}
