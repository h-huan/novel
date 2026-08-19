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
  // 写作风格（真正的叙事手法/文字风格，不是题材流派）
  { type: 'writing_style', parent: null, label: '白描/朴素', order: 1 },
  { type: 'writing_style', parent: null, label: '爽文', order: 2 },
  { type: 'writing_style', parent: null, label: '悬疑', order: 3 },
  { type: 'writing_style', parent: null, label: '情感', order: 4 },
  { type: 'writing_style', parent: null, label: '宏大叙事', order: 5 },
  { type: 'writing_style', parent: null, label: '群像叙事', order: 6 },
  { type: 'writing_style', parent: null, label: '第一人称', order: 7 },
  { type: 'writing_style', parent: null, label: '第三人称', order: 8 },
  { type: 'writing_style', parent: null, label: '倒叙', order: 9 },
  { type: 'writing_style', parent: null, label: '多线叙事', order: 10 },
  { type: 'writing_style', parent: null, label: '日记体', order: 11 },
  { type: 'writing_style', parent: null, label: '对话体', order: 12 },
  // 网文流派（题材/设定流派，不是写作风格）
  { type: 'web_novel_genre', parent: null, label: '系统流', order: 1 },
  { type: 'web_novel_genre', parent: null, label: '重生', order: 2 },
  { type: 'web_novel_genre', parent: null, label: '穿越', order: 3 },
  { type: 'web_novel_genre', parent: null, label: '种田', order: 4 },
  { type: 'web_novel_genre', parent: null, label: '无限流', order: 5 },
  { type: 'web_novel_genre', parent: null, label: '无敌流', order: 6 },
  { type: 'web_novel_genre', parent: null, label: '凡人流', order: 7 },
  { type: 'web_novel_genre', parent: null, label: '扮猪吃虎', order: 8 },
  { type: 'web_novel_genre', parent: null, label: '诸天流', order: 9 },
  { type: 'web_novel_genre', parent: null, label: '退婚流', order: 10 },
  { type: 'web_novel_genre', parent: null, label: '废材流', order: 11 },
  { type: 'web_novel_genre', parent: null, label: '快穿', order: 12 },
  { type: 'web_novel_genre', parent: null, label: '马甲流', order: 13 },
  { type: 'web_novel_genre', parent: null, label: '科技流', order: 14 },
  { type: 'web_novel_genre', parent: null, label: '幕后流', order: 15 },
  { type: 'web_novel_genre', parent: null, label: '直播流', order: 16 },
  { type: 'web_novel_genre', parent: null, label: 'DND', order: 17 },
  // 故事基调（情绪/氛围，不是题材）
  { type: 'tone_tag', parent: null, label: '热血', order: 1 },
  { type: 'tone_tag', parent: null, label: '爽文', order: 2 },
  { type: 'tone_tag', parent: null, label: '搞笑', order: 3 },
  { type: 'tone_tag', parent: null, label: '悬疑', order: 4 },
  { type: 'tone_tag', parent: null, label: '甜宠', order: 5 },
  { type: 'tone_tag', parent: null, label: '虐恋', order: 6 },
  { type: 'tone_tag', parent: null, label: '权谋', order: 7 },
  { type: 'tone_tag', parent: null, label: '爆笑', order: 8 },
  { type: 'tone_tag', parent: null, label: '烧脑', order: 9 },
  { type: 'tone_tag', parent: null, label: '无敌', order: 10 },
  { type: 'tone_tag', parent: null, label: '逆袭', order: 11 },
  { type: 'tone_tag', parent: null, label: '刀人', order: 12 },
  { type: 'tone_tag', parent: null, label: '治愈', order: 13 },
  { type: 'tone_tag', parent: null, label: '女强', order: 14 },
  { type: 'tone_tag', parent: null, label: '轻松', order: 15 },
  { type: 'tone_tag', parent: null, label: '压抑', order: 16 },
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
