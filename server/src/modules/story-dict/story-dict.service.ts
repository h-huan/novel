/**
 * StoryDictService - 创作字典管理
 * 故事分类、基调、写作风格的增删改查
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DatabaseService } from '../../database/database.service';

export interface DictItem {
  id: string;
  dictType: string;
  parentLabel?: string;
  label: string;
  sortOrder: number;
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class StoryDictService implements OnModuleInit {
  private readonly logger = new Logger(StoryDictService.name);

  constructor(private readonly db: DatabaseService) {}

  onModuleInit() {
    try {
      this.ensureTable();
      const inserted = this.seedDefaults();
      this.logger.log(`字典初始化完成: 新增 ${inserted} 条`);
    } catch (err) {
      this.logger.error(`字典初始化失败: ${err}`);
    }
  }

  private getDb() {
    return this.db.getDb();
  }

  /** 按类型获取字典项 */
  getByType(dictType: string): DictItem[] {
    try {
      this.ensureTable();
      const rows = this.getDb()
        .prepare('SELECT * FROM story_dict WHERE dict_type = ? ORDER BY sort_order ASC, label ASC')
        .all(dictType) as any[];
      return rows.map(this.mapRow);
    } catch { return []; }
  }

  /** 获取所有分类（含子分类） */
  getCategories(): Array<{ category: DictItem; subcategories: DictItem[] }> {
    try {
      this.ensureTable();
      const all = this.getDb()
        .prepare('SELECT * FROM story_dict ORDER BY sort_order ASC')
        .all() as any[];
      const mapped = all.map(this.mapRow);
      const parents = mapped.filter(d => d.dictType === 'story_category');
      const children = mapped.filter(d => d.dictType === 'story_subcategory');

      return parents.map(p => ({
        category: p,
        subcategories: children.filter(c => c.parentLabel === p.label),
      }));
    } catch { return []; }
  }

  /** 获取所有字典类型列表 */
  getTypes(): string[] {
    try {
      this.ensureTable();
      const rows = this.getDb()
        .prepare("SELECT DISTINCT dict_type FROM story_dict WHERE dict_type != 'story_subcategory' ORDER BY dict_type")
        .all() as any[];
      return rows.map(r => r.dict_type);
    } catch { return []; }
  }

  /** 确保表存在 */
  private ensureTable(): void {
    this.getDb().exec(`
      CREATE TABLE IF NOT EXISTS story_dict (
        id TEXT PRIMARY KEY,
        dict_type TEXT NOT NULL,
        parent_label TEXT,
        label TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        is_custom INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(dict_type, label)
      );
      CREATE INDEX IF NOT EXISTS idx_dict_type ON story_dict(dict_type);
      CREATE INDEX IF NOT EXISTS idx_dict_parent ON story_dict(parent_label);
    `);
  }

  /** 新增字典项 */
  create(dto: { dictType: string; label: string; parentLabel?: string; sortOrder?: number }): DictItem | null {
    try {
      const now = new Date().toISOString();
      const id = uuid();
      this.getDb()
        .prepare(`INSERT INTO story_dict (id, dict_type, parent_label, label, sort_order, is_custom, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
        .run(id, dto.dictType, dto.parentLabel || null, dto.label, dto.sortOrder || 0, now, now);
      this.logger.log(`新增字典项: [${dto.dictType}] ${dto.label}`);
      return this.getById(id);
    } catch (err) {
      this.logger.error(`新增字典项失败: ${err}`);
      return null;
    }
  }

  /** 更新字典项 */
  update(id: string, dto: { label?: string; parentLabel?: string; sortOrder?: number }): DictItem | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const updates: string[] = [];
    const params: any[] = [];
    if (dto.label !== undefined) { updates.push('label = ?'); params.push(dto.label); }
    if (dto.parentLabel !== undefined) { updates.push('parent_label = ?'); params.push(dto.parentLabel); }
    if (dto.sortOrder !== undefined) { updates.push('sort_order = ?'); params.push(dto.sortOrder); }
    updates.push('updated_at = ?');
    params.push(now);
    params.push(id);
    this.getDb().prepare(`UPDATE story_dict SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.getById(id);
  }

  /** 删除字典项 */
  delete(id: string): boolean {
    const item = this.getById(id);
    if (!item) return false;
    this.getDb().prepare('DELETE FROM story_dict WHERE id = ?').run(id);
    this.logger.log(`删除字典项: [${item.dictType}] ${item.label}`);
    return true;
  }

  /** 按 ID 获取 */
  getById(id: string): DictItem | null {
    const row = this.getDb().prepare('SELECT * FROM story_dict WHERE id = ?').get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  /** 填充默认种子数据（表空时调用） */
  seedDefaults(): number {
    this.ensureTable();
    // 从迁移文件复制种子数据
    const seeds: Array<{ type: string; parent: string | null; label: string; order: number }> = [
      { type: 'story_category', parent: null, label: '玄幻·奇幻', order: 1 },
      { type: 'story_category', parent: null, label: '武侠·仙侠', order: 2 },
      { type: 'story_category', parent: null, label: '都市·现实', order: 3 },
      { type: 'story_category', parent: null, label: '历史·军事', order: 4 },
      { type: 'story_category', parent: null, label: '悬疑·灵异', order: 5 },
      { type: 'story_category', parent: null, label: '科幻·末世', order: 6 },
      { type: 'story_category', parent: null, label: '游戏·竞技', order: 7 },
      { type: 'story_category', parent: null, label: '言情·情感', order: 8 },
      { type: 'story_category', parent: null, label: '轻小说·二次元', order: 9 },
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '玄幻', order: 1 },
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '奇幻', order: 2 },
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '异世大陆', order: 3 },
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '魔法', order: 4 },
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '神魔', order: 5 },
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '进化变异', order: 6 },
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '领主种田', order: 7 },
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '无敌流', order: 8 },
      { type: 'story_subcategory', parent: '武侠·仙侠', label: '武侠', order: 1 },
      { type: 'story_subcategory', parent: '武侠·仙侠', label: '仙侠', order: 2 },
      { type: 'story_subcategory', parent: '武侠·仙侠', label: '修真', order: 3 },
      { type: 'story_subcategory', parent: '武侠·仙侠', label: '古典仙侠', order: 4 },
      { type: 'story_subcategory', parent: '武侠·仙侠', label: '凡人流', order: 5 },
      { type: 'story_subcategory', parent: '都市·现实', label: '都市', order: 1 },
      { type: 'story_subcategory', parent: '都市·现实', label: '现实', order: 2 },
      { type: 'story_subcategory', parent: '都市·现实', label: '职场', order: 3 },
      { type: 'story_subcategory', parent: '都市·现实', label: '乡村', order: 4 },
      { type: 'story_subcategory', parent: '都市·现实', label: '校园', order: 5 },
      { type: 'story_subcategory', parent: '都市·现实', label: '重生', order: 6 },
      { type: 'story_subcategory', parent: '都市·现实', label: '娱乐圈', order: 7 },
      { type: 'story_subcategory', parent: '都市·现实', label: '赘婿逆袭', order: 8 },
      { type: 'story_subcategory', parent: '都市·现实', label: '战神归来', order: 9 },
      { type: 'story_subcategory', parent: '历史·军事', label: '历史', order: 1 },
      { type: 'story_subcategory', parent: '历史·军事', label: '军事', order: 2 },
      { type: 'story_subcategory', parent: '历史·军事', label: '架空历史', order: 3 },
      { type: 'story_subcategory', parent: '历史·军事', label: '民国', order: 4 },
      { type: 'story_subcategory', parent: '历史·军事', label: '古代', order: 5 },
      { type: 'story_subcategory', parent: '历史·军事', label: '三国', order: 6 },
      { type: 'story_subcategory', parent: '悬疑·灵异', label: '悬疑', order: 1 },
      { type: 'story_subcategory', parent: '悬疑·灵异', label: '灵异', order: 2 },
      { type: 'story_subcategory', parent: '悬疑·灵异', label: '侦探推理', order: 3 },
      { type: 'story_subcategory', parent: '悬疑·灵异', label: '规则怪谈', order: 4 },
      { type: 'story_subcategory', parent: '悬疑·灵异', label: '民俗志怪', order: 5 },
      { type: 'story_subcategory', parent: '科幻·末世', label: '科幻', order: 1 },
      { type: 'story_subcategory', parent: '科幻·末世', label: '末世', order: 2 },
      { type: 'story_subcategory', parent: '科幻·末世', label: '星际', order: 3 },
      { type: 'story_subcategory', parent: '科幻·末世', label: '时空穿梭', order: 4 },
      { type: 'story_subcategory', parent: '科幻·末世', label: '人工智能', order: 5 },
      { type: 'story_subcategory', parent: '游戏·竞技', label: '游戏', order: 1 },
      { type: 'story_subcategory', parent: '游戏·竞技', label: '电竞', order: 2 },
      { type: 'story_subcategory', parent: '游戏·竞技', label: '虚拟现实', order: 3 },
      { type: 'story_subcategory', parent: '言情·情感', label: '言情', order: 1 },
      { type: 'story_subcategory', parent: '言情·情感', label: '总裁', order: 2 },
      { type: 'story_subcategory', parent: '言情·情感', label: '古言', order: 3 },
      { type: 'story_subcategory', parent: '言情·情感', label: '穿越', order: 4 },
      { type: 'story_subcategory', parent: '言情·情感', label: '重生', order: 5 },
      { type: 'story_subcategory', parent: '言情·情感', label: '娱乐圈', order: 6 },
      { type: 'story_subcategory', parent: '言情·情感', label: '宫斗', order: 7 },
      { type: 'story_subcategory', parent: '言情·情感', label: '宅斗', order: 8 },
      { type: 'story_subcategory', parent: '言情·情感', label: '甜宠', order: 9 },
      { type: 'story_subcategory', parent: '言情·情感', label: '虐恋', order: 10 },
      { type: 'story_subcategory', parent: '言情·情感', label: '先婚后爱', order: 11 },
      { type: 'story_subcategory', parent: '轻小说·二次元', label: '轻小说', order: 1 },
      { type: 'story_subcategory', parent: '轻小说·二次元', label: '同人', order: 2 },
      { type: 'story_subcategory', parent: '轻小说·二次元', label: '日常', order: 3 },
      { type: 'story_subcategory', parent: '轻小说·二次元', label: '校园青春', order: 4 },
      { type: 'writing_style', parent: null, label: '系统流', order: 1 },
      { type: 'writing_style', parent: null, label: '群像', order: 2 },
      { type: 'writing_style', parent: null, label: '重生', order: 3 },
      { type: 'writing_style', parent: null, label: '穿越', order: 4 },
      { type: 'writing_style', parent: null, label: '种田', order: 5 },
      { type: 'writing_style', parent: null, label: '无限流', order: 6 },
      { type: 'writing_style', parent: null, label: '无敌流', order: 7 },
      { type: 'writing_style', parent: null, label: '凡人流', order: 8 },
      { type: 'writing_style', parent: null, label: '扮猪吃虎', order: 9 },
      { type: 'writing_style', parent: null, label: '诸天流', order: 10 },
      { type: 'writing_style', parent: null, label: '退婚流', order: 11 },
      { type: 'writing_style', parent: null, label: '废材流', order: 12 },
      { type: 'writing_style', parent: null, label: '快穿', order: 13 },
      { type: 'writing_style', parent: null, label: '马甲流', order: 14 },
      { type: 'writing_style', parent: null, label: '科技流', order: 15 },
      { type: 'writing_style', parent: null, label: '幕后流', order: 16 },
      { type: 'writing_style', parent: null, label: '直播流', order: 17 },
      { type: 'writing_style', parent: null, label: 'DND', order: 18 },
      // 故事基调（参考番茄小说标签体系）
      { type: 'tone_tag', parent: null, label: '热血', order: 1 },
      { type: 'tone_tag', parent: null, label: '爽文', order: 2 },
      { type: 'tone_tag', parent: null, label: '搞笑', order: 3 },
      { type: 'tone_tag', parent: null, label: '悬疑', order: 4 },
      { type: 'tone_tag', parent: null, label: '甜宠', order: 5 },
      { type: 'tone_tag', parent: null, label: '虐恋', order: 6 },
      { type: 'tone_tag', parent: null, label: '重生', order: 7 },
      { type: 'tone_tag', parent: null, label: '穿越', order: 8 },
      { type: 'tone_tag', parent: null, label: '系统', order: 9 },
      { type: 'tone_tag', parent: null, label: '种田', order: 10 },
      { type: 'tone_tag', parent: null, label: '权谋', order: 11 },
      { type: 'tone_tag', parent: null, label: '爆笑', order: 12 },
      { type: 'tone_tag', parent: null, label: '烧脑', order: 13 },
      { type: 'tone_tag', parent: null, label: '快穿', order: 14 },
      { type: 'tone_tag', parent: null, label: '无敌', order: 15 },
      { type: 'tone_tag', parent: null, label: '逆袭', order: 16 },
      { type: 'tone_tag', parent: null, label: '刀人', order: 17 },
      { type: 'tone_tag', parent: null, label: '治愈', order: 18 },
      { type: 'tone_tag', parent: null, label: '女强', order: 19 },
      { type: 'tone_tag', parent: null, label: '历史', order: 20 },
      { type: 'tone_tag', parent: null, label: '科幻', order: 21 },
      { type: 'tone_tag', parent: null, label: '谍战', order: 22 },
    ];

    const now = new Date().toISOString();
    const insert = this.getDb().prepare(
      `INSERT OR IGNORE INTO story_dict (id, dict_type, parent_label, label, sort_order, is_custom, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
    );
    let count = 0;
    for (const item of seeds) {
      const id = 'seed-' + Math.random().toString(36).substr(2, 9);
      const result = insert.run(id, item.type, item.parent, item.label, item.order, now, now);
      if (result.changes > 0) count++;
    }
    this.logger.log(`种子数据已填充: ${count} 条`);
    return count;
  }

  private mapRow(row: any): DictItem {
    return {
      id: row.id,
      dictType: row.dict_type,
      parentLabel: row.parent_label || undefined,
      label: row.label,
      sortOrder: row.sort_order,
      isCustom: row.is_custom === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
