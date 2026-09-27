import { it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { Logger } from '@nestjs/common';
import {
  StoryDictService,
  STORY_DICT_SEEDS,
  STORY_DICT_SEED_VERSION,
  storyDictKey,
} from '../modules/story-dict/story-dict.service';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

/**
 * 执行标准「始终最新」的机器证明（启动即确定性同步）。
 *
 * 为什么必须有这条：历史上 seed 走的是 INSERT OR IGNORE —— 只补缺、永不更新，
 * 于是「改了 seed 文案（或改了维度定义）但库内旧值一直留着」长期存在，
 * 同一份标准在代码与库里各说各话，而启动日志看不出任何异常。
 * 现在的口径是：每次启动，非自定义行一律对齐当前 seed（更新 / 补齐 / 清理废弃项），
 * 用户自建项（is_custom=1）一律不动。这条测试把该口径钉死：任何退回「只补不更」的实现都会失败。
 *
 * 运行：cd server; npx vitest run src/acceptance/story-dict-seed-sync.acceptance.spec.ts
 */
const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
afterEach(() => { logSpy.mockClear(); warnSpy.mockClear(); errorSpy.mockClear(); });

function makeService(db: any): StoryDictService {
  return new StoryDictService({ getDb: () => db } as any);
}

it('启动同步把库内旧值拉平到当前 seed：更新旧值 / 清理废弃项 / 不动用户自建项', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const service = makeService(db);
    const seededTypes = new Set(STORY_DICT_SEEDS.map(s => s.type));

    // 1) 首次同步：库内等于 seed
    service.seedDefaults();
    const afterFirst = db.prepare('SELECT dict_type, label, parent_label, sort_order, is_custom FROM story_dict').all() as any[];
    expect(afterFirst.length).toBe(STORY_DICT_SEEDS.length);
    expect(db.prepare("SELECT COUNT(*) c FROM story_dict WHERE dict_type='narrative_pov'").get()!.c).toBe(4);

    // 2) 制造三类漂移
    //    ① 旧值漂移：把一条种子行的 parent / sort_order 改成旧库里的错值
    db.prepare("UPDATE story_dict SET parent_label = NULL, sort_order = 99 WHERE dict_type='story_subcategory' AND label='玄幻'").run();
    //    ② 废弃残留：种子里已删除的项仍留在库里（is_custom=0）
    db.prepare("INSERT INTO story_dict (id, dict_type, parent_label, label, sort_order, is_custom, created_at, updated_at) VALUES ('stale-1','tone_tag',NULL,'已废弃基调',98,0,'2000-01-01T00:00:00.000Z','2000-01-01T00:00:00.000Z')").run();
    //    ③ 用户自建项：非种子类型，绝不能被同步碰掉
    db.prepare("INSERT INTO story_dict (id, dict_type, parent_label, label, sort_order, is_custom, created_at, updated_at) VALUES ('custom-1','my_own_type',NULL,'我的自建项',1,1,'2000-01-01T00:00:00.000Z','2000-01-01T00:00:00.000Z')").run();
    //    ④ 用户自建项与种子同名（shadowed）：唯一键 (dict_type,label) 决定了这只可能发生在
    //       「用户先建了同名项、种子后补上同名标准」的顺序里 —— 先把种子行删掉再建自建项来复现。
    db.prepare("DELETE FROM story_dict WHERE dict_type='tone_tag' AND label='热血'").run();
    db.prepare("INSERT INTO story_dict (id, dict_type, parent_label, label, sort_order, is_custom, created_at, updated_at) VALUES ('custom-2','tone_tag',NULL,'热血',77,1,'2000-01-01T00:00:00.000Z','2000-01-01T00:00:00.000Z')").run();
    expect(db.prepare('SELECT COUNT(*) c FROM story_dict').get()!.c).toBe(STORY_DICT_SEEDS.length + 2);

    // 3) 再同步（= 下一次启动）
    const changed = service.seedDefaults();
    expect(changed).toBeGreaterThan(0); // 确定性同步：这条断言在「只补不更」的旧实现下必然失败

    // ① 旧值被拉回 seed
    const fixed = db.prepare("SELECT parent_label, sort_order, is_custom FROM story_dict WHERE dict_type='story_subcategory' AND label='玄幻'").get() as any;
    const seedRow = STORY_DICT_SEEDS.find(s => s.type === 'story_subcategory' && s.label === '玄幻')!;
    expect(fixed.parent_label).toBe(seedRow.parent);
    expect(fixed.sort_order).toBe(seedRow.order);
    expect(fixed.is_custom).toBe(0);

    // ② 废弃残留被清理（且只清种子自己覆盖的字典类型）
    expect(db.prepare("SELECT COUNT(*) c FROM story_dict WHERE label='已废弃基调'").get()!.c).toBe(0);
    expect(warnSpy).toHaveBeenCalled();

    // ③ 非种子类型的自建项完好
    expect(db.prepare("SELECT COUNT(*) c FROM story_dict WHERE id='custom-1'").get()!.c).toBe(1);
    // ④ 与种子同名的自建项未被覆盖（用户改过的行优先）
    const shadow = db.prepare("SELECT sort_order, is_custom FROM story_dict WHERE dict_type='tone_tag' AND label='热血'").get() as any;
    expect(shadow.is_custom).toBe(1);
    expect(shadow.sort_order).toBe(77);

    // 4) 收敛后：非自建行恰好等于「seed 减去被同名自建项遮蔽的那一项」，且记账已更新
    const rows = db.prepare('SELECT dict_type, label FROM story_dict WHERE is_custom = 0').all() as any[];
    expect(rows.length).toBe(STORY_DICT_SEEDS.length - 1); // 热血 被同名自建项遮蔽
    for (const row of rows) expect(seededTypes.has(row.dict_type)).toBe(true);
    const keys = rows.map(r => storyDictKey(r.dict_type, r.label));
    expect(new Set(keys).size).toBe(keys.length);
    const missing = STORY_DICT_SEEDS
      .map(s => storyDictKey(s.type, s.label))
      .filter(k => !keys.includes(k));
    expect(missing).toEqual([storyDictKey('tone_tag', '热血')]);
    // 遮蔽必须留痕，不许静默：标准项没落地时要能在日志里看见
    expect(warnSpy.mock.calls.some(c => String(c[0]).includes('同名'))).toBe(true);
    const meta = db.prepare("SELECT value FROM story_dict_meta WHERE key='seed_version'").get() as any;
    expect(meta.value).toBe(String(STORY_DICT_SEED_VERSION));
  } finally {
    db.close();
  }
});
