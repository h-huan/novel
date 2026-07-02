/**
 * 004_story_dict - 创作字典表
 * 故事分类/基调/写作风格/平台自定义标签的统一管理
 */
import type { DatabaseSync } from 'node:sqlite';

const SEED_DATA: Array<{ type: string; parent: string | null; label: string; order: number }> = [
  // 故事分类（一级）
  { type: 'story_category', parent: null, label: '玄幻·奇幻', order: 1 },
  { type: 'story_category', parent: null, label: '武侠·仙侠', order: 2 },
  { type: 'story_category', parent: null, label: '都市·现实', order: 3 },
  { type: 'story_category', parent: null, label: '历史·军事', order: 4 },
  { type: 'story_category', parent: null, label: '悬疑·灵异', order: 5 },
  { type: 'story_category', parent: null, label: '科幻·末世', order: 6 },
  { type: 'story_category', parent: null, label: '游戏·竞技', order: 7 },
  { type: 'story_category', parent: null, label: '言情·情感', order: 8 },
  { type: 'story_category', parent: null, label: '轻小说·二次元', order: 9 },
  // 故事分类（二级 - 玄幻·奇幻）
  { type: 'story_subcategory', parent: '玄幻·奇幻', label: '玄幻', order: 1 },
  { type: 'story_subcategory', parent: '玄幻·奇幻', label: '奇幻', order: 2 },
  { type: 'story_subcategory', parent: '玄幻·奇幻', label: '异世大陆', order: 3 },
  { type: 'story_subcategory', parent: '玄幻·奇幻', label: '魔法幻想', order: 4 },
  { type: 'story_subcategory', parent: '玄幻·奇幻', label: '神魔', order: 5 },
  // 故事分类（二级 - 武侠·仙侠）
  { type: 'story_subcategory', parent: '武侠·仙侠', label: '武侠', order: 1 },
  { type: 'story_subcategory', parent: '武侠·仙侠', label: '仙侠', order: 2 },
  { type: 'story_subcategory', parent: '武侠·仙侠', label: '修真', order: 3 },
  { type: 'story_subcategory', parent: '武侠·仙侠', label: '古典仙侠', order: 4 },
  // 都市·现实
  { type: 'story_subcategory', parent: '都市·现实', label: '都市', order: 1 },
  { type: 'story_subcategory', parent: '都市·现实', label: '现实', order: 2 },
  { type: 'story_subcategory', parent: '都市·现实', label: '职场商战', order: 3 },
  { type: 'story_subcategory', parent: '都市·现实', label: '乡村', order: 4 },
  { type: 'story_subcategory', parent: '都市·现实', label: '校园', order: 5 },
  // 历史·军事
  { type: 'story_subcategory', parent: '历史·军事', label: '历史', order: 1 },
  { type: 'story_subcategory', parent: '历史·军事', label: '军事', order: 2 },
  { type: 'story_subcategory', parent: '历史·军事', label: '架空历史', order: 3 },
  { type: 'story_subcategory', parent: '历史·军事', label: '民国', order: 4 },
  { type: 'story_subcategory', parent: '历史·军事', label: '抗战', order: 5 },
  // 悬疑·灵异
  { type: 'story_subcategory', parent: '悬疑·灵异', label: '悬疑', order: 1 },
  { type: 'story_subcategory', parent: '悬疑·灵异', label: '灵异', order: 2 },
  { type: 'story_subcategory', parent: '悬疑·灵异', label: '侦探推理', order: 3 },
  { type: 'story_subcategory', parent: '悬疑·灵异', label: '规则怪谈', order: 4 },
  // 科幻·末世
  { type: 'story_subcategory', parent: '科幻·末世', label: '科幻', order: 1 },
  { type: 'story_subcategory', parent: '科幻·末世', label: '末世', order: 2 },
  { type: 'story_subcategory', parent: '科幻·末世', label: '星际', order: 3 },
  { type: 'story_subcategory', parent: '科幻·末世', label: '时空穿梭', order: 4 },
  // 游戏·竞技
  { type: 'story_subcategory', parent: '游戏·竞技', label: '游戏', order: 1 },
  { type: 'story_subcategory', parent: '游戏·竞技', label: '电竞', order: 2 },
  // 言情·情感
  { type: 'story_subcategory', parent: '言情·情感', label: '言情', order: 1 },
  { type: 'story_subcategory', parent: '言情·情感', label: '甜宠', order: 2 },
  { type: 'story_subcategory', parent: '言情·情感', label: '虐恋', order: 3 },
  // 轻小说·二次元
  { type: 'story_subcategory', parent: '轻小说·二次元', label: '轻小说', order: 1 },
  { type: 'story_subcategory', parent: '轻小说·二次元', label: '同人', order: 2 },
  { type: 'story_subcategory', parent: '轻小说·二次元', label: '日常', order: 3 },
  // 写作风格
  { type: 'writing_style', parent: null, label: '群像叙事', order: 1 },
  { type: 'writing_style', parent: null, label: '系统流', order: 2 },
  { type: 'writing_style', parent: null, label: '第一人称', order: 3 },
  { type: 'writing_style', parent: null, label: '第三人称', order: 4 },
  { type: 'writing_style', parent: null, label: '倒叙', order: 5 },
  { type: 'writing_style', parent: null, label: '多线叙事', order: 6 },
  { type: 'writing_style', parent: null, label: '日记体', order: 7 },
  { type: 'writing_style', parent: null, label: '对话体', order: 8 },
];

export function up(db: DatabaseSync): void {
  db.exec(`
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

  // 插入种子数据
  const insert = db.prepare(
    `INSERT OR IGNORE INTO story_dict (id, dict_type, parent_label, label, sort_order, is_custom, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  );
  const now = new Date().toISOString();
  const uuid = () => 'dict-' + Math.random().toString(36).substr(2, 9);

  for (const item of SEED_DATA) {
    insert.run(uuid(), item.type, item.parent, item.label, item.order, now, now);
  }

  console.log(`[Migration 004] Created story_dict table + ${SEED_DATA.length} seed entries.`);
}

export function down(db: DatabaseSync): void {
  db.exec(`DROP TABLE IF EXISTS story_dict`);
  console.log('[Migration 004] Dropped story_dict table.');
}
