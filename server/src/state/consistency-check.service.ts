/**
 * 一致性检查服务 (Consistency Check Service)
 *
 * 核心功能：
 * 1. 检查人物性格、能力、外貌是否与设定一致
 * 2. 检查世界观规则是否被违反
 * 3. 检查时间线是否合理
 * 4. 检查情节逻辑是否连贯
 * 5. 根据子衿规范 3.2.4 的 Prompt 设计实现
 */
import { Injectable, Logger, Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ConsistencyCheckService {
  private readonly logger = new Logger(ConsistencyCheckService.name);

  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  /**
   * 执行一致性检查
   * 对应规范 3.2.4 一致性检查 Prompt
   */
  async checkConsistency(
    projectId: string,
    options: {
      chapterIds?: number[];
      checkTypes?: ('character' | 'world_setting' | 'timeline' | 'plot_logic')[];
    } = {},
  ): Promise<Array<{
    checkType: string;
    status: 'pass' | 'warning' | 'error';
    message: string;
    severity: 'low' | 'medium' | 'high';
    chapterIndex?: number;
    details: Array<{
      field: string;
      expected: string;
      actual: string;
      suggestion?: string;
    }>;
  }>> {
    this.logger.log(`Checking consistency for project ${projectId}`);
    const checks: Array<any> = [];
    const db = this.databaseService.getDb();

    const checkTypes = options.checkTypes || ['character', 'world_setting', 'timeline', 'plot_logic'];

    // 获取要检查的章节
    let chapters: Array<{ id: string; index: number; content: string }>;
    if (options.chapterIds && options.chapterIds.length > 0) {
      const placeholders = options.chapterIds.map(() => '?').join(',');
      const stmt = db.prepare(`SELECT id, chapter_index AS \`index\`, content FROM chapters WHERE project_id = ? AND chapter_index IN (${placeholders})`);
      chapters = stmt.all(projectId, ...options.chapterIds) as Array<{ id: string; index: number; content: string }>;
    } else {
      const stmt = db.prepare('SELECT id, chapter_index AS `index`, content FROM chapters WHERE project_id = ? ORDER BY chapter_index');
      chapters = stmt.all(projectId) as Array<{ id: string; index: number; content: string }>;
    }

    // 获取世界观设定
    const worldSettingStmt = db.prepare('SELECT * FROM world_settings WHERE project_id = ? LIMIT 1');
    const worldSetting = worldSettingStmt.get(projectId) as any;

    // 获取人物档案
    const charactersStmt = db.prepare('SELECT id, name, personality AS traits, background AS description FROM characters WHERE project_id = ?');
    const characters = charactersStmt.all(projectId) as Array<{ id: string; name: string; traits: string; description: string }>;

    // 逐章检查
    for (const chapter of chapters) {
      if (checkTypes.includes('character')) {
        const characterChecks = await this.checkCharacterConsistency(
          chapter,
          characters,
          db,
        );
        checks.push(...characterChecks);
      }

      if (checkTypes.includes('world_setting') && worldSetting) {
        const worldChecks = await this.checkWorldSettingConsistency(
          chapter,
          worldSetting,
        );
        checks.push(...worldChecks);
      }

      if (checkTypes.includes('timeline')) {
        const timelineChecks = await this.checkTimelineConsistency(
          chapter,
          chapters,
        );
        checks.push(...timelineChecks);
      }

      if (checkTypes.includes('plot_logic')) {
        const plotChecks = await this.checkPlotLogicConsistency(
          chapter,
          db,
        );
        checks.push(...plotChecks);
      }
    }

    // 保存检查结果到数据库
    await this.saveChecks(projectId, checks);

    return checks;
  }

  /**
   * 检查人物一致性
   */
  private async checkCharacterConsistency(
    chapter: { id: string; index: number; content: string },
    characters: Array<{ id: string; name: string; traits: string; description: string }>,
    db: any,
  ): Promise<Array<any>> {
    const checks: Array<any> = [];

    for (const character of characters) {
      const parsedTraits = this.safeJson(character.traits, []);
      const traits = Array.isArray(parsedTraits)
        ? parsedTraits.map(String)
        : Object.entries(parsedTraits || {})
          .filter(([, value]) => typeof value === 'string' || (typeof value === 'number' && value >= 0.6))
          .map(([key, value]) => typeof value === 'string' ? value : key);

      // 检查人物性格是否一致
      // 规则层负责可解释的确定性冲突；正文语义复查由写作质量与连续性门禁处理。
      const characterContent = this.extractCharacterContent(chapter.content, character.name);

      if (characterContent) {
        // 检查是否有性格反转
        const hasPersonalityConflict = this.detectPersonalityConflict(traits, characterContent);

        if (hasPersonalityConflict) {
          checks.push({
            checkType: 'character',
            status: 'warning',
            message: `人物 ${character.name} 的性格可能与设定不一致`,
            severity: 'medium',
            chapterIndex: chapter.index,
            details: [{
              field: `${character.name}.性格标签`,
              expected: traits.join('、'),
              actual: '本章表现出不一致的性格特征',
              suggestion: '建议修改正文或更新人物设定',
            }],
          });
        }
      }
    }

    return checks;
  }

  /**
   * 检查世界观设定一致性
   */
  private async checkWorldSettingConsistency(
    chapter: { id: string; index: number; content: string },
    worldSetting: any,
  ): Promise<Array<any>> {
    const checks: Array<any> = [];
    const rules = this.toRuleList(this.safeJson(worldSetting.rules, []));

    for (const rule of rules) {
      const forbidden = rule.forbiddenWriting || rule.forbidden || rule.prohibitedContent || [];
      const terms = (Array.isArray(forbidden) ? forbidden.map(String) : String(forbidden || '').split(/[、，,；;]/))
        .map(item => item.trim()).filter(Boolean);
      const hits = terms.filter(item => chapter.content.includes(item));
      if (hits.length === 0) continue;
      const isBlocking = rule.severity === 'high' || Boolean(rule.locked);
      checks.push({
        checkType: 'world_setting',
        status: isBlocking ? 'error' : 'warning',
        message: `第${chapter.index}章命中世界观禁写约束：${hits.join('、')}`,
        severity: isBlocking ? 'high' : 'medium',
        chapterIndex: chapter.index,
        details: [{
          field: rule.name || rule.title || '世界观规则',
          expected: rule.content || rule.rule || `不得出现：${terms.join('、')}`,
          actual: hits.join('、'),
          suggestion: '修改正文，或由作者先更新并确认世界观规则后再复查。',
        }],
      });
    }

    return checks;
  }
  /**
   * 检查时间线一致性
   */
  private async checkTimelineConsistency(
    chapter: { id: string; index: number; content: string },
    allChapters: Array<{ id: string; index: number; content: string }>,
  ): Promise<Array<any>> {
    const checks: Array<any> = [];
    const ordered = [...new Set(allChapters.map(item => item.index))].sort((a, b) => a - b);
    const position = ordered.indexOf(chapter.index);

    if (position > 0 && ordered[position - 1] !== chapter.index - 1) {
      checks.push({
        checkType: 'timeline',
        status: 'warning',
        severity: 'medium',
        chapterIndex: chapter.index,
        message: `章节时间线存在序号缺口：第${ordered[position - 1]}章后直接到第${chapter.index}章`,
        details: [{
          field: 'chapter_index',
          expected: String(ordered[position - 1] + 1),
          actual: String(chapter.index),
          suggestion: '确认是有意跳章，或补齐/重新排序章节。',
        }],
      });
    }

    return checks;
  }
  /**
   * 检查情节逻辑一致性
   */
  private async checkPlotLogicConsistency(
    chapter: { id: string; index: number; content: string },
    db: any,
  ): Promise<Array<any>> {
    const checks: Array<any> = [];
    const row = db.prepare('SELECT project_id, outline_id FROM chapters WHERE id = ?').get(chapter.id) as any;

    if (!row?.outline_id) {
      checks.push({
        checkType: 'plot_logic',
        status: 'error',
        severity: 'high',
        chapterIndex: chapter.index,
        message: `第${chapter.index}章正文没有关联章节大纲`,
        details: [{
          field: 'outline_id',
          expected: '关联已确认的章节大纲',
          actual: '未关联',
          suggestion: '先创建或绑定章节大纲，再继续正文创作。',
        }],
      });
    }

    const overdue = db.prepare(`SELECT content, planned_recovery_chapter_index FROM foreshadowings
      WHERE project_id = ? AND status IN ('buried','active','reminder')
        AND planned_recovery_chapter_index IS NOT NULL AND planned_recovery_chapter_index < ?`
    ).all(row?.project_id || '', chapter.index) as any[];
    for (const item of overdue) {
      checks.push({
        checkType: 'plot_logic',
        status: 'warning',
        severity: 'medium',
        chapterIndex: chapter.index,
        message: `伏笔已超过计划回收章节：${item.content}`,
        details: [{
          field: 'foreshadowing',
          expected: `第${item.planned_recovery_chapter_index}章前回收或重新排期`,
          actual: `检查到第${chapter.index}章仍未回收`,
          suggestion: '回收、取消，或由作者明确调整回收窗口。',
        }],
      });
    }

    return checks;
  }
  /**
   * 保存检查结果到数据库
   */
  private async saveChecks(projectId: string, checks: Array<any>): Promise<void> {
    const db = this.databaseService.getDb();

    for (const check of checks) {
      const stmt = db.prepare(`
        INSERT INTO consistency_checks (
          id, project_id, check_type, status, message, severity,
          detected_at, chapter_index, details
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
      `);

      stmt.run(
        this.generateId(),
        projectId,
        check.checkType,
        check.status,
        check.message,
        check.severity,
        check.chapterIndex || null,
        JSON.stringify(check.details),
      );
    }
  }

  /**
   * 从章节内容中提取特定人物的相关内容
   */
  private extractCharacterContent(chapterContent: string, characterName: string): string | null {
    const nameIndex = chapterContent.indexOf(characterName);
    if (nameIndex === -1) return null;

    // 返回人物名称周围的内容（前后200字）
    const start = Math.max(0, nameIndex - 200);
    const end = Math.min(chapterContent.length, nameIndex + characterName.length + 200);
    return chapterContent.slice(start, end);
  }

  /**
   * 检测性格冲突
   */
  private detectPersonalityConflict(traits: string[], characterContent: string): boolean {
    // 简化版：检查是否有相反的性格描述
    const conflictPairs = [
      ['勇敢', '胆小'],
      ['正直', '狡诈'],
      ['善良', '邪恶'],
      ['乐观', '悲观'],
    ];

    for (const [trait1, trait2] of conflictPairs) {
      if (traits.includes(trait1) && characterContent.includes(trait2)) {
        return true;
      }
    }

    return false;
  }

  private safeJson(value: unknown, fallback: any): any {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  private toRuleList(value: unknown): Array<Record<string, any>> {
    if (Array.isArray(value)) {
      return value.map(item => typeof item === 'string' ? { content: item } : item).filter(Boolean);
    }
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).map(([name, item]) =>
        typeof item === 'string' ? { name, content: item } : { name, ...(item as Record<string, unknown>) },
      );
    }
    return [];
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
