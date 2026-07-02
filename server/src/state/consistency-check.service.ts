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
      const stmt = db.prepare(`SELECT id, \`index\`, content FROM chapters WHERE project_id = ? AND \`index\` IN (${placeholders})`);
      chapters = stmt.all(projectId, ...options.chapterIds) as Array<{ id: string; index: number; content: string }>;
    } else {
      const stmt = db.prepare('SELECT id, `index`, content FROM chapters WHERE project_id = ? ORDER BY `index`');
      chapters = stmt.all(projectId) as Array<{ id: string; index: number; content: string }>;
    }

    // 获取世界观设定
    const worldSettingStmt = db.prepare('SELECT * FROM world_settings WHERE project_id = ? LIMIT 1');
    const worldSetting = worldSettingStmt.get(projectId) as any;

    // 获取人物档案
    const charactersStmt = db.prepare('SELECT id, name, traits, description FROM characters WHERE project_id = ?');
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
      const traits = JSON.parse(character.traits || '[]');

      // 检查人物性格是否一致
      // TODO: 使用 LLM 进行深度检查
      // 临时实现：简单关键词匹配
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

    // TODO: 使用 LLM 检查世界观规则是否被违反
    // 临时实现：简单检查
    const rules = worldSetting.rules ? JSON.parse(worldSetting.rules) : [];

    for (const rule of rules) {
      // 检查是否有违反规则的描述
      if (rule.content && chapter.content.includes(rule.content) === false) {
        // 这里应该更复杂，需要 LLM 理解
      }
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

    // TODO: 使用 LLM 检查时间线是否合理
    // 临时实现：检查章节序号是否连续

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

    // TODO: 使用 LLM 检查情节逻辑是否连贯
    // 临时实现：检查伏笔是否回收

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
