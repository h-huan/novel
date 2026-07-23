/**
 * 状态提取服务 (State Extraction Service)
 *
 * 核心功能：
 * 1. 从章节内容中自动提取人物状态、伏笔状态、情节进展
 * 2. 使用 LLM 进行智能提取（根据子衿规范中的 Prompt 模板）
 * 3. 支持增量提取、批量提取、置信度过滤
 * 4. 与现有 StateEngineService 集成
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { StateEngineService, CharacterStateSnapshot, StateChange } from './state-engine.service';
import { CharacterStateRepository } from '../database/repositories/character-state.repository';
import type { CharacterStateRow } from '../database/repositories/character-state.repository';
import { RealLLMService } from '../chain/real-llm.service';

@Injectable()
export class StateExtractionService {
  private readonly logger = new Logger(StateExtractionService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly stateEngine: StateEngineService,
    private readonly characterStateRepo: CharacterStateRepository,
    @Optional() private readonly realLLM?: RealLLMService,
  ) {}

  /**
   * 提取章节中的人物状态
   * 对应规范 3.2.1 人物状态提取 Prompt
   */
  async extractCharacterStates(
    projectId: string,
    chapterId: string,
    chapterContent: string,
    characterProfiles: Array<{ id: string; name: string; traits: string[] }>,
  ): Promise<CharacterStateSnapshot[]> {
    this.logger.log(`Extracting character states from chapter ${chapterId}`);

    const snapshots: CharacterStateSnapshot[] = [];
    const db = this.databaseService.getDb();

    // 获取章节索引
    const chapterStmt = db.prepare('SELECT chapter_index FROM chapters WHERE id = ?');
    const chapter = chapterStmt.get(chapterId) as { chapter_index: number } | undefined;
    const chapterIndex = chapter?.chapter_index ?? 0;

    // 获取总章节数
    const totalChaptersStmt = db.prepare('SELECT COUNT(*) as count FROM chapters WHERE project_id = ?');
    const totalResult = totalChaptersStmt.get(projectId) as { count: number };
    const totalChapters = totalResult.count;

    for (const profile of characterProfiles) {
      // 获取上一快照
      const previousRow = this.characterStateRepo.getLatestState(profile.id);
      const previousSnapshot: CharacterStateSnapshot = previousRow
        ? this.rowToSnapshot(previousRow)
        : this.stateEngine.createInitialSnapshot(profile.id, chapterId);

      // 使用 StateEngine 检测变化
      const changes = this.stateEngine.detectChanges(
        profile.id,
        profile.name,
        chapterContent,
        previousSnapshot,
        chapterIndex,
        totalChapters,
      );

      // 人物状态采用确定性 StateEngine 增量提取；伏笔与情节语义在下方独立使用 LLM 提取，避免重复写入人物快照。

      // 应用变化
      if (changes.length > 0) {
        const newSnapshot = this.stateEngine.applyChanges(
          previousSnapshot,
          changes,
          chapterId,
        );

        // 保存到数据库
        const row = this.snapshotToRow(newSnapshot, projectId);
        this.characterStateRepo.insert(row);

        // 保存版本历史
        await this.saveVersionHistory('character', profile.id, newSnapshot);

        snapshots.push(newSnapshot);
      }
    }

    return snapshots;
  }

  /**
   * 提取章节中的伏笔状态
   * 对应规范 3.2.2 伏笔状态提取 Prompt
   */
  async extractForeshadowingStates(
    projectId: string,
    chapterId: string,
    chapterContent: string,
    existingForeshadowings: Array<{ id: string; description: string; type: string }>,
  ): Promise<any[]> {
    this.logger.log(`Extracting foreshadowing states from chapter ${chapterId}`);

    const results: any[] = [];
    const db = this.databaseService.getDb();
    const chapterStmt = db.prepare('SELECT chapter_index FROM chapters WHERE id = ?');
    const chapter = chapterStmt.get(chapterId) as { chapter_index: number } | undefined;
    const chapterIndex = chapter?.chapter_index ?? 0;

    const llmMentions = await this.extractForeshadowingWithLLM(chapterContent, existingForeshadowings);

    for (const fs of existingForeshadowings) {
      const llmMention = llmMentions.find(item => item.id === fs.id);
      const mentioned = Boolean(llmMention) || chapterContent.includes(fs.description.slice(0, 20));
      
      if (mentioned) {
        // 更新提及次数
        const stmt = db.prepare(`
          UPDATE foreshadowing_states 
          SET mention_count = mention_count + 1,
              last_mentioned_chapter = ?,
              status = CASE WHEN ? != '' THEN ? ELSE status END,
              recovered_chapter = CASE WHEN ? = 'recovered' THEN ? ELSE recovered_chapter END,
              recovery_method = CASE WHEN ? != '' THEN ? ELSE recovery_method END,
              detected_automatically = 1,
              needs_review = 1,
              reviewed_by = NULL,
              reviewed_at = NULL,
              updated_at = datetime('now')
          WHERE foreshadowing_id = ?
        `);
        const nextStatus = llmMention?.status || '';
        const recoveryMethod = llmMention?.recoveryMethod || '';
        stmt.run(
          chapterIndex,
          nextStatus,
          nextStatus,
          nextStatus,
          chapterIndex,
          recoveryMethod,
          recoveryMethod,
          fs.id,
        );

        results.push({
          id: (db.prepare('SELECT id FROM foreshadowing_states WHERE project_id = ? AND foreshadowing_id = ?').get(projectId, fs.id) as any)?.id,
          foreshadowingId: fs.id,
          mentioned: true,
          status: nextStatus || undefined,
          reason: llmMention?.reason,
        });
      }
    }

    return results;
  }

  /**
   * 提取章节中的情节进展
   * 对应规范 3.2.3 情节进展提取 Prompt
   */
  async extractPlotProgress(
    projectId: string,
    chapterId: string,
    chapterContent: string,
    previousSummary?: string,
  ): Promise<any> {
    this.logger.log(`Extracting plot progress from chapter ${chapterId}`);

    const db = this.databaseService.getDb();

    // 获取章节索引
    const chapterStmt = db.prepare('SELECT chapter_index FROM chapters WHERE id = ?');
    const chapter = chapterStmt.get(chapterId) as { chapter_index: number } | undefined;
    const chapterIndex = chapter?.chapter_index ?? 0;

    const extracted = await this.extractPlotWithLLM(chapterContent, previousSummary);
    const plotProgress = {
      id: this.generateId(),
      project_id: projectId,
      chapter_index: chapterIndex,
      active_conflicts: JSON.stringify(extracted.activeConflicts),
      resolved_conflicts: JSON.stringify(extracted.resolvedConflicts),
      main_goal_progress: extracted.mainGoalProgress,
      sub_goal_progress: JSON.stringify(extracted.subGoalProgress),
      emotional_beat: extracted.emotionalBeat,
      emotional_intensity: extracted.emotionalIntensity,
      pacing_score: extracted.pacingScore,
      turning_points: JSON.stringify(extracted.turningPoints),
    };

    // 保存到数据库
    const stmt = db.prepare(`
      INSERT INTO plot_progress (
        id, project_id, chapter_index, active_conflicts, resolved_conflicts,
        main_goal_progress, sub_goal_progress, emotional_beat,
        emotional_intensity, pacing_score, turning_points, needs_review
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    try {
      stmt.run(
        plotProgress.id,
        plotProgress.project_id,
        plotProgress.chapter_index,
        plotProgress.active_conflicts,
        plotProgress.resolved_conflicts,
        plotProgress.main_goal_progress,
        plotProgress.sub_goal_progress,
        plotProgress.emotional_beat,
        plotProgress.emotional_intensity,
        plotProgress.pacing_score,
        plotProgress.turning_points,
        1,
      );
    } catch (error) {
      // 如果已存在则更新
      const updateStmt = db.prepare(`
        UPDATE plot_progress SET
          active_conflicts = ?,
          resolved_conflicts = ?,
          main_goal_progress = ?,
          sub_goal_progress = ?,
          emotional_beat = ?,
          emotional_intensity = ?,
          pacing_score = ?,
          turning_points = ?,
          needs_review = 1,
          reviewed_by = NULL,
          reviewed_at = NULL,
          updated_at = datetime('now')
        WHERE project_id = ? AND chapter_index = ?
      `);
      updateStmt.run(
        plotProgress.active_conflicts,
        plotProgress.resolved_conflicts,
        plotProgress.main_goal_progress,
        plotProgress.sub_goal_progress,
        plotProgress.emotional_beat,
        plotProgress.emotional_intensity,
        plotProgress.pacing_score,
        plotProgress.turning_points,
        projectId,
        chapterIndex,
      );
      const existing = db.prepare('SELECT id FROM plot_progress WHERE project_id = ? AND chapter_index = ?').get(projectId, chapterIndex) as any;
      plotProgress.id = existing?.id || plotProgress.id;
    }

    return plotProgress;
  }

  /**
   * 批量提取（规范 3.4 提取优化策略）
   */
  async batchExtract(
    projectId: string,
    options: {
      chapterIds?: string[];
      stateTypes?: ('character' | 'foreshadowing' | 'plot')[];
      force?: boolean;
    } = {},
  ): Promise<{
    extractedStates: Array<{ type: string; id: string; changes: number }>;
  }> {
    this.logger.log(`Batch extracting states for project ${projectId}`);

    const extractedStates: Array<{ type: string; id: string; changes: number; legacyReviewTarget?: { entityType: string; targetId: string } }> = [];
    const db = this.databaseService.getDb();

    // 获取要处理的章节
    let chapters: Array<{ id: string; content: string }>;
    if (options.chapterIds && options.chapterIds.length > 0) {
      const placeholders = options.chapterIds.map(() => '?').join(',');
      const stmt = db.prepare(`SELECT id, content FROM chapters WHERE id IN (${placeholders})`);
      chapters = stmt.all(...options.chapterIds) as Array<{ id: string; content: string }>;
    } else {
      const stmt = db.prepare('SELECT id, content FROM chapters WHERE project_id = ? ORDER BY chapter_index');
      chapters = stmt.all(projectId) as Array<{ id: string; content: string }>;
    }

    // 获取人物档案
    const charactersStmt = db.prepare(`
      SELECT id, name, identity, background, personality, abilities, relationships
      FROM characters
      WHERE project_id = ?
    `);
    const characterProfiles = charactersStmt.all(projectId) as Array<{
      id: string;
      name: string;
      identity?: string;
      background?: string;
      personality?: string;
      abilities?: string;
      relationships?: string;
    }>;

    // 获取现有伏笔
    const foreshadowingsStmt = db.prepare('SELECT id, content as description, type FROM foreshadowings WHERE project_id = ?');
    const foreshadowings = foreshadowingsStmt.all(projectId) as Array<{ id: string; description: string; type: string }>;

    // 逐章提取
    for (const chapter of chapters) {
      const stateTypes = options.stateTypes || ['character', 'foreshadowing', 'plot'];

      if (stateTypes.includes('character')) {
        const snapshots = await this.extractCharacterStates(
          projectId,
          chapter.id,
          chapter.content,
          characterProfiles.map(c => ({
            id: c.id,
            name: c.name,
            traits: this.buildCharacterTraits(c),
          })),
        );
        
        for (const snapshot of snapshots) {
          extractedStates.push({
            type: 'character',
            id: snapshot.snapshotId,
            changes: snapshot.changedDimensions.length,
            legacyReviewTarget: { entityType: 'character_state', targetId: snapshot.snapshotId },
          });
        }
      }

      if (stateTypes.includes('foreshadowing')) {
        const results = await this.extractForeshadowingStates(
          projectId,
          chapter.id,
          chapter.content,
          foreshadowings,
        );
        
        for (const result of results) {
          if (!result.id) continue;
          extractedStates.push({
            type: 'foreshadowing',
            id: result.id,
            changes: 1,
            legacyReviewTarget: { entityType: 'foreshadowing_state', targetId: result.id },
          });
        }
      }

      if (stateTypes.includes('plot')) {
        const progress = await this.extractPlotProgress(
          projectId,
          chapter.id,
          chapter.content,
        );
        
        extractedStates.push({
          type: 'plot',
          id: progress.id,
          changes: 1,
          legacyReviewTarget: { entityType: 'plot_progress', targetId: progress.id },
        });
      }
    }

    return { extractedStates };
  }

  private buildCharacterTraits(character: {
    identity?: string;
    background?: string;
    personality?: string;
    abilities?: string;
    relationships?: string;
  }): string[] {
    const traits = new Set<string>();
    if (character.identity) traits.add(character.identity);
    if (character.background) traits.add(character.background);

    const collectValues = (raw?: string) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        const visit = (value: any) => {
          if (typeof value === 'string' && value.trim()) traits.add(value.trim());
          else if (Array.isArray(value)) value.forEach(visit);
          else if (value && typeof value === 'object') Object.values(value).forEach(visit);
        };
        visit(parsed);
      } catch {
        traits.add(raw);
      }
    };

    collectValues(character.personality);
    collectValues(character.abilities);
    collectValues(character.relationships);

    return Array.from(traits).slice(0, 20);
  }

  /**
   * 保存版本历史（规范 4.3 版本历史）
   */
  private async saveVersionHistory(
    stateType: string,
    stateId: string,
    snapshot: CharacterStateSnapshot,
  ): Promise<void> {
    const db = this.databaseService.getDb();

    // 获取下一个版本号
    const versionStmt = db.prepare(`
      SELECT COALESCE(MAX(version), 0) as max_version
      FROM state_versions
      WHERE state_type = ? AND state_id = ?
    `);
    const result = versionStmt.get(stateType, stateId) as { max_version: number };
    const nextVersion = result.max_version + 1;

    // 保存版本
    const stmt = db.prepare(`
      INSERT INTO state_versions (
        id, state_type, state_id, version, data, source, created_by, change_log
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      this.generateId(),
      stateType,
      stateId,
      nextVersion,
      JSON.stringify(snapshot.states),
      snapshot.createdBy,
      'system',
      snapshot.changeSummary || '',
    );
  }

  private async extractForeshadowingWithLLM(
    chapterContent: string,
    existingForeshadowings: Array<{ id: string; description: string; type: string }>,
  ): Promise<Array<{ id: string; status?: string; reason?: string; recoveryMethod?: string }>> {
    if (!this.realLLM || existingForeshadowings.length === 0 || !chapterContent.trim()) return [];

    const candidates = existingForeshadowings.map(item => ({
      id: item.id,
      description: item.description,
      type: item.type,
    }));
    const prompt = `请从章节正文中判断哪些已有伏笔被提及、激活或回收。

已有伏笔:
${JSON.stringify(candidates, null, 2)}

章节正文:
${chapterContent.slice(-5000)}

只输出严格JSON，不要Markdown:
{
  "mentions": [
    {
      "id": "伏笔ID",
      "status": "planted|active|recovered",
      "reason": "正文中的依据",
      "recoveryMethod": "如已回收，说明回收方式；否则为空"
    }
  ]
}`;

    try {
      const response = await this.realLLM.generate({
        prompt,
        temperature: 0.2,
        scenario: 'state_extraction',
      } as any);
      const parsed = this.parseJson<{ mentions?: Array<{ id?: string; status?: string; reason?: string; recoveryMethod?: string }> }>(response.content, {});
      if (!Array.isArray(parsed.mentions)) {
        throw new Error('伏笔状态提取结果缺少 mentions 数组');
      }
      const validIds = new Set(existingForeshadowings.map(item => item.id));
      return (parsed.mentions || [])
        .filter(item => item.id && validIds.has(item.id))
        .map(item => ({
          id: String(item.id),
          status: ['planted', 'active', 'recovered'].includes(String(item.status)) ? String(item.status) : 'active',
          reason: String(item.reason || '').slice(0, 300),
          recoveryMethod: String(item.recoveryMethod || '').slice(0, 200),
        }));
    } catch (error) {
      throw new Error(`伏笔状态提取失败，未使用关键词结果降级：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async extractPlotWithLLM(
    chapterContent: string,
    previousSummary?: string,
  ): Promise<{
    activeConflicts: string[];
    resolvedConflicts: string[];
    mainGoalProgress: number;
    subGoalProgress: Record<string, unknown>;
    emotionalBeat: string;
    emotionalIntensity: number;
    pacingScore: number;
    turningPoints: string[];
  }> {
    const fallback = {
      activeConflicts: [] as string[],
      resolvedConflicts: [] as string[],
      mainGoalProgress: 0,
      subGoalProgress: {},
      emotionalBeat: 'calm',
      emotionalIntensity: 5,
      pacingScore: 5,
      turningPoints: [] as string[],
    };
    if (!this.realLLM || !chapterContent.trim()) {
      throw new Error('情节状态提取缺少模型服务或章节正文，未写入默认状态');
    }

    const prompt = `请从章节正文中提取长篇连载所需的情节/时间线状态。

前文概要:
${previousSummary || '无'}

章节正文:
${chapterContent.slice(-6000)}

只输出严格JSON，不要Markdown:
{
  "activeConflicts": ["仍未解决的主要冲突"],
  "resolvedConflicts": ["本章解决的冲突"],
  "mainGoalProgress": 0,
  "subGoalProgress": {"目标名": "进展说明"},
  "emotionalBeat": "calm|rising|crisis|release|hook",
  "emotionalIntensity": 1,
  "pacingScore": 1,
  "turningPoints": ["本章关键转折/时间线变化"]
}

数值字段范围为0-100或1-10。只提取正文明确发生的内容，不要补写设定。`;

    try {
      const response = await this.realLLM.generate({
        prompt,
        temperature: 0.2,
        scenario: 'state_extraction',
      } as any);
      const parsed = this.parseJson<Record<string, any>>(response.content, {});
      if (
        !Array.isArray(parsed.activeConflicts) ||
        !Array.isArray(parsed.resolvedConflicts) ||
        !Array.isArray(parsed.turningPoints) ||
        !['calm', 'rising', 'crisis', 'release', 'hook'].includes(String(parsed.emotionalBeat)) ||
        !Number.isFinite(Number(parsed.mainGoalProgress)) ||
        !Number.isFinite(Number(parsed.emotionalIntensity)) ||
        !Number.isFinite(Number(parsed.pacingScore))
      ) {
        throw new Error('情节状态提取结果结构不完整');
      }
      return {
        activeConflicts: this.normalizeStringArray(parsed.activeConflicts, 8),
        resolvedConflicts: this.normalizeStringArray(parsed.resolvedConflicts, 8),
        mainGoalProgress: this.clampNumber(parsed.mainGoalProgress, 0, 100, 0),
        subGoalProgress: parsed.subGoalProgress && typeof parsed.subGoalProgress === 'object' && !Array.isArray(parsed.subGoalProgress)
          ? parsed.subGoalProgress
          : {},
        emotionalBeat: String(parsed.emotionalBeat),
        emotionalIntensity: this.clampNumber(parsed.emotionalIntensity, 1, 10, 5),
        pacingScore: this.clampNumber(parsed.pacingScore, 1, 10, 5),
        turningPoints: this.normalizeStringArray(parsed.turningPoints, 10),
      };
    } catch (error) {
      throw new Error(`情节状态提取失败，未写入默认状态：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private parseJson<T>(content: string | null | undefined, fallback: T): T {
    if (!content) return fallback;
    const clean = content.replace(/```json\n?|```\n?/g, '').trim();
    try {
      return JSON.parse(clean) as T;
    } catch {
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(clean.slice(start, end + 1)) as T;
        } catch {
          return fallback;
        }
      }
      return fallback;
    }
  }

  private normalizeStringArray(value: unknown, limit: number): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .slice(0, limit);
  }

  private clampNumber(value: unknown, min: number, max: number, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  /**
   * 将数据库行转换为快照对象
   */
  private rowToSnapshot(row: CharacterStateRow): CharacterStateSnapshot {
    return {
      snapshotId: row.id,
      characterId: row.character_id,
      chapterId: row.chapter_id || '',
      timestamp: new Date(row.timestamp),
      states: JSON.parse(row.states_json),
      changedDimensions: row.changed_dimensions ? JSON.parse(row.changed_dimensions) : [],
      previousSnapshotId: row.previous_snapshot_id || undefined,
      createdBy: row.created_by as any,
      notes: row.change_summary || undefined,
      changeSummary: row.change_summary || undefined,
    };
  }

  /**
   * 将快照对象转换为数据库行
   */
  private snapshotToRow(snapshot: CharacterStateSnapshot, projectId: string): any {
    return {
      id: snapshot.snapshotId,
      character_id: snapshot.characterId,
      project_id: projectId,
      chapter_id: snapshot.chapterId,
      timestamp: snapshot.timestamp.toISOString(),
      states_json: JSON.stringify(snapshot.states),
      changed_dimensions: JSON.stringify(snapshot.changedDimensions),
      previous_snapshot_id: snapshot.previousSnapshotId || null,
      change_summary: snapshot.changeSummary || null,
      confidence: 0.85,
      needs_review: snapshot.createdBy === 'auto_detect' ? 1 : 0,
      reviewed_by: null,
      reviewed_at: null,
      created_by: snapshot.createdBy,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * 生成 UUID
   */
  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
