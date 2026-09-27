/**
 * StoryDictService - 创作字典管理
 * 故事分类、基调、文风的增删改查
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DatabaseService } from '../../database/database.service';
import { GLOBAL_STORY_CATEGORIES, NARRATIVE_POV_SEED_LABELS, PLOT_TAG_SEED_LABELS, STORY_TONE_SEED_LABELS, WRITING_STYLE_SEED_LABELS } from '../../../shared/src';

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

/**
 * 字典执行标准的种子版本号。
 *
 * 用途只是「记账 + 事后核对」：seedDefaults() 每次启动都会做确定性同步，
 * 所以正确性不依赖这里的数字被手动 bump（这正是历史上「改了 seed 却不生效」的根因）。
 * 但每次改动 seed 内容时仍应递增，便于在 _migrations 里核对某次同步到底跑没跑。
 */
export const STORY_DICT_SEED_VERSION = 23;

/**
 * 执行标准种子（唯一事实源）。
 *
 * 原先这段数组写在 seedDefaults() 内部，守卫测试无法直接校验它的不变量。
 * 提升到模块级后，spec 可以直接断言「同一维度内 label 不重复」等标准约束。
 */
export const STORY_DICT_SEEDS: Array<{ type: string; parent: string | null; label: string; order: number }> = [
      // 9 大类的名字只有一份事实源（@novel/shared 的 GLOBAL_STORY_CATEGORIES），这里派生而不是再写一遍：
      // 改名只改共享常量，字典与平台分类归位（globalCategory）不会各走各的。
      ...GLOBAL_STORY_CATEGORIES.map((label, i) => ({ type: 'story_category', parent: null, label, order: i + 1 })),
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '玄幻', order: 1 },
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '奇幻', order: 2 },
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '异世大陆', order: 3 },
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '魔法', order: 4 },
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '神魔', order: 5 },
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '进化变异', order: 6 },
      { type: 'story_subcategory', parent: '玄幻·奇幻', label: '领主种田', order: 7 },
      { type: 'story_subcategory', parent: '武侠·仙侠', label: '武侠', order: 1 },
      { type: 'story_subcategory', parent: '武侠·仙侠', label: '仙侠', order: 2 },
      { type: 'story_subcategory', parent: '武侠·仙侠', label: '修真', order: 3 },
      { type: 'story_subcategory', parent: '武侠·仙侠', label: '古典仙侠', order: 4 },
      { type: 'story_subcategory', parent: '都市·现实', label: '都市', order: 1 },
      { type: 'story_subcategory', parent: '都市·现实', label: '现实', order: 2 },
      { type: 'story_subcategory', parent: '都市·现实', label: '职场', order: 3 },
      { type: 'story_subcategory', parent: '都市·现实', label: '乡村', order: 4 },
      { type: 'story_subcategory', parent: '都市·现实', label: '校园', order: 5 },
      { type: 'story_subcategory', parent: '都市·现实', label: '赘婿逆袭', order: 6 },
      { type: 'story_subcategory', parent: '都市·现实', label: '战神归来', order: 7 },
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
      { type: 'story_subcategory', parent: '言情·情感', label: '娱乐圈', order: 4 },
      { type: 'story_subcategory', parent: '言情·情感', label: '宫斗', order: 5 },
      { type: 'story_subcategory', parent: '言情·情感', label: '宅斗', order: 6 },
      { type: 'story_subcategory', parent: '言情·情感', label: '甜宠', order: 7 },
      { type: 'story_subcategory', parent: '言情·情感', label: '虐恋', order: 8 },
      { type: 'story_subcategory', parent: '言情·情感', label: '先婚后爱', order: 9 },
      { type: 'story_subcategory', parent: '轻小说·二次元', label: '轻小说', order: 1 },
      { type: 'story_subcategory', parent: '轻小说·二次元', label: '同人', order: 2 },
      { type: 'story_subcategory', parent: '轻小说·二次元', label: '日常', order: 3 },
      { type: 'story_subcategory', parent: '轻小说·二次元', label: '校园青春', order: 4 },
      // 文风（真正的叙事手法/文字风格，不是题材流派）
      // 取值集合只有一份事实源（@novel/shared 的 WRITING_STYLE_SEED_LABELS），这里派生而不是再写一遍：
      // 操作定义（STYLE_GUIDES）与硬线扫描器的阈值分化都按同一份 key 取值，改名只改共享常量。
      ...WRITING_STYLE_SEED_LABELS.map((label, i) => ({ type: 'writing_style', parent: null, label, order: i + 1 })),
      // 网文流派（题材/设定流派，不是文风）
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
      // 叙事视角（结构性叙述约束：决定人称与信息范围，直接约束正文能写什么，不是文风标签）
      // 取值集合只有一份事实源（@novel/shared 的 NARRATIVE_POV_SEED_LABELS），这里派生而不是再写一遍：
      // 前端视角下拉的兜底用的就是同一份，改名只改共享常量，字典与控件不会再各走各的。
      ...NARRATIVE_POV_SEED_LABELS.map((label, i) => ({ type: 'narrative_pov', parent: null, label, order: i + 1 })),
      // 故事基调（情绪/氛围，不是题材）
      // 同上：取值集合唯一事实源是 @novel/shared 的 STORY_TONE_SEED_LABELS，操作定义见 TONE_GUIDES。
      ...STORY_TONE_SEED_LABELS.map((label, i) => ({ type: 'tone_tag', parent: null, label, order: i + 1 })),
      // 这里曾只在两个前端表单定义情节取向候选，后果是字典页无法管理，修改一处还会造成发现与创建不同步。
      ...PLOT_TAG_SEED_LABELS.map((label, i) => ({ type: 'plot_tag', parent: null, label, order: i + 1 })),
    ];

/**
 * 字典行身份键：同一维度内只有 label 是身份，parent_label 只是「可改挂属性」。
 * upsert 以 (dict_type, label) 为冲突键，所以 seed 里同维度同名 label 会被后一条静默改挂父级。
 */
export function storyDictKey(type: string, label: string): string {
  return type + '\u0000' + label;
}

/**
 * 校验执行标准种子：同一维度内 label 必须唯一。
 * 返回冲突项列表（空数组 = 合法）；供 seedDefaults() 启动时阻断，也供 spec 直接断言。
 */
export function findDuplicateSeedLabels(
  seeds: ReadonlyArray<{ type: string; label: string }>,
): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const seed of seeds) {
    const key = storyDictKey(seed.type, seed.label);
    if (seen.has(key)) duplicates.push('[' + seed.type + '] ' + seed.label);
    seen.add(key);
  }
  return duplicates;
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
      this.logger.error(`字典初始化失败，执行标准未生效，必须修复后再继续生成: ${err}`);
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
      -- 字典自己的元数据（当前只有 seed_version）。
      -- 为什么不写进 _migrations：那张表是 Migrator 的迁移台账，
      -- alignSquashedBaseline() 会把非迁移记录当作旧版结构记录清掉（详见 recordSeedVersion 注释）。
      CREATE TABLE IF NOT EXISTS story_dict_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
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
    // 执行标准种子（唯一事实源）已提升为模块级 STORY_DICT_SEEDS
    const seeds = STORY_DICT_SEEDS;

    // 同一维度内 label 必须唯一：下面的 upsert 以 (dict_type, label) 为冲突键，
    // 重复 label 会让后一条把前一条「静默改挂」到另一个父级
    //（历史事故：娱乐圈 同时定义在 都市·现实 与 言情·情感，结果 都市·现实 少一项、留空位）。
    // 这类歧义必须暴露并阻断，绝不能靠 seed 数组顺序决定归属。
    const duplicateSeedLabels = findDuplicateSeedLabels(STORY_DICT_SEEDS);
    if (duplicateSeedLabels.length > 0) {
      throw new Error(
        '字典标准定义冲突：同一维度内 label 重复 -> ' + duplicateSeedLabels.join('、'),
      );
    }

    const now = new Date().toISOString();
    // 执行标准必须「始终最新」：INSERT OR IGNORE 只会补缺、永不更新，
    // 改了 seed 文案后库内旧值会一直留着（历史事故：同一份标准两处长期不一致）。
    // 这里改成确定性同步 —— 非自定义行一律对齐当前 seed（更新 / 补齐 / 清理已废弃项），
    // 用户自建项（is_custom=1）一律不动；同步结果记账，便于核对是否真跑过。
    const upsert = this.getDb().prepare(
      `INSERT INTO story_dict (id, dict_type, parent_label, label, sort_order, is_custom, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(dict_type, label) DO UPDATE SET
         parent_label = excluded.parent_label,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at
       WHERE story_dict.is_custom = 0`
    );
    const findExisting = this.getDb().prepare(
      'SELECT parent_label, sort_order, is_custom FROM story_dict WHERE dict_type = ? AND label = ?'
    );
    let inserted = 0;
    let updated = 0;
    let shadowed = 0;
    const keep = new Set<string>();
    // 清理范围只限【种子自己覆盖的字典类型】：seed 不认识的字典类型不归它管，
    // 否则将来别的标准类型（is_custom=0）会被这里整片删掉，且没有任何地方报错。
    const seededTypes = new Set(seeds.map(s => s.type));
    for (const item of seeds) {
      keep.add(storyDictKey(item.type, item.label));
      const before = findExisting.get(item.type, item.label) as any;
      const id = 'seed-' + Math.random().toString(36).substr(2, 9);
      upsert.run(id, item.type, item.parent, item.label, item.order, now, now);
      if (!before) inserted++;
      else if (before.is_custom === 1) shadowed++;
      else if (before.parent_label !== item.parent || before.sort_order !== item.order) updated++;
    }
    const staleRows = (this.getDb().prepare('SELECT id, dict_type, label FROM story_dict WHERE is_custom = 0').all() as any[])
      .filter(r => seededTypes.has(r.dict_type))
      .filter(r => !keep.has(storyDictKey(r.dict_type, r.label)));
    for (const row of staleRows) {
      this.getDb().prepare('DELETE FROM story_dict WHERE id = ?').run(row.id);
      this.logger.warn(`字典清理已废弃标准项: [${row.dict_type}] ${row.label}`);
    }
    if (shadowed > 0) this.logger.warn(`有 ${shadowed} 条自建字典项与执行标准同名，按自建项优先保留（标准未落地，请核对）`);
    this.recordSeedVersion();
    this.logger.log(`字典标准同步 v${STORY_DICT_SEED_VERSION}: 新增 ${inserted} / 更新 ${updated} / 清理 ${staleRows.length}`);
    return inserted + updated + staleRows.length;
  }

  /**
   * 记录本次字典标准同步（写入 story_dict_meta，可核对同步真的跑过）。
   *
   * 为什么不写 _migrations（历史事故，实测）：那张表是 Migrator 的迁移台账，语义是「已执行的迁移 id」。
   * Migrator.alignSquashedBaseline() 会把 id>1 且不在当前迁移文件里的记录判为旧版结构记录，
   * 于是重跑 001 基线并 `DELETE FROM _migrations` —— 写进去的种子版本会在下一次启动被无声抹掉
   *（实测：story_dict_seed_v20 在第二次重启后消失，_migrations 只剩 initial），记账等于没记。
   * 结论：字典的元数据由字典自己维护，不借用迁移台账。
   */
  private recordSeedVersion(): void {
    try {
      this.getDb().prepare(
        `INSERT INTO story_dict_meta (key, value, updated_at) VALUES ('seed_version', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).run(String(STORY_DICT_SEED_VERSION), new Date().toISOString());
    } catch (err) {
      this.logger.error(`字典标准版本记账失败（无法核对执行标准是否已生效）: ${err}`);
    }
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
