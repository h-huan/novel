import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { Migrator } from '../database/migrator';
import { seedAcceptanceProject } from '../acceptance/test-project-fixture';
import { buildCanonPolicyDirective } from '../modules/canon/canon-policy';
import { ChainController } from './chain.controller';

let db: DatabaseSync;
let controller: any;
const review = (consistent: boolean, contradictions: string[] = []) => ({ data: { consistent, contradictions, unrelatedInventions: [] }, warnings: [] });
const patch = (replacement: string) => ({ data: { patches: [{ entityType: 'foreshadowing', entityId: 'clue', field: 'planned_recovery_chapter_index', match: '3', replacement }] }, warnings: [] });
const chapterValue = () => (db.prepare('SELECT planned_recovery_chapter_index AS value FROM foreshadowings WHERE id=?').get('clue') as any).value;
const run = () => controller.reviewCreationConsistency('p', { selectedIdea: {} }, '{}', '', [], vi.fn());

beforeEach(async () => {
  db = new DatabaseSync(':memory:');
  await new Migrator(db).runMigrations();
  seedAcceptanceProject(db, { id: 'p', type: 'short_story' });
  const now = new Date().toISOString();
  db.prepare('INSERT INTO world_settings(id,project_id,name,era,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('world', 'p', '冻结世界', '古代边镇', now, now);
  db.prepare('INSERT INTO world_system_profiles(id,project_id,world_setting_id,hierarchy_rules,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('profile', 'p', 'world', '边军不得越级调兵。\n' + buildCanonPolicyDirective(), now, now);
  for (let index = 0; index < 5; index++) {
    db.prepare('INSERT INTO outlines(id,project_id,level,"order",title,content,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .run('chapter' + index, 'p', 'chapter', index, '章节' + index, '第三章回收。' + '保留正文规划。'.repeat(600), now, now);
  }
  db.prepare('INSERT INTO foreshadowings(id,project_id,content,buried_chapter_index,planned_recovery_chapter_index,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('clue', 'p', '刀上的印记', 1, 3, now, now);
  controller = Object.create(ChainController.prototype);
  controller.db = { getDb: () => db };
  controller.logger = { warn: vi.fn(), error: vi.fn() };
  controller.llmCallWithRetry = vi.fn();
});
afterEach(() => db.close());

describe('production cross-module commit boundary with native SQLite', () => {
  it('discards failed candidate findings, retains live facts and commits only the reviewed integer', async () => {
    const originalPolicy = (db.prepare('SELECT hierarchy_rules FROM world_system_profiles WHERE id=?').get('profile') as any).hierarchy_rules;
    controller.llmCallWithRetry
      .mockImplementationOnce(async (_name: string, prompt: string) => {
        const generated = JSON.parse(prompt.split('【生成资料】')[1].split('\n')[0]);
        expect(generated.worldProfiles[0].hierarchy_rules).toBe('边军不得越级调兵。');
        expect(generated.chapters.map((chapter: any) => chapter.chapterIndex)).toEqual([1, 2, 3, 4, 5]);
        expect(generated.chapters[0]).not.toHaveProperty('order');
        expect(generated.foreshadowings[0].buried_chapter_index).toBe(1);
        expect(prompt).not.toContain('数据库order是从0开始的同级内部排序'); // Provider injects the active execution standard.
        return review(false, ['原始回收章节冲突']);
      })
      .mockResolvedValueOnce(patch('4'))
      .mockImplementationOnce(async () => { expect(chapterValue()).toBe(3); return review(false, ['只在失败候选中出现的问题']); })
      .mockImplementationOnce(async (_name: string, prompt: string) => {
        expect(prompt).toContain('原始回收章节冲突');
        expect(prompt).not.toContain('只在失败候选中出现的问题');
        expect(chapterValue()).toBe(3);
        return patch('5');
      })
      .mockImplementationOnce(async () => { expect(chapterValue()).toBe(3); return review(true); });
    await run();
    expect(chapterValue()).toBe(5);
    expect(typeof chapterValue()).toBe('number');
    expect((db.prepare('SELECT hierarchy_rules FROM world_system_profiles WHERE id=?').get('profile') as any).hierarchy_rules).toBe(originalPolicy);
  });

  it('blocks optimistic commit if live data changes during candidate review', async () => {
    controller.llmCallWithRetry.mockResolvedValueOnce(review(false, ['回收章节冲突'])).mockResolvedValueOnce(patch('5'))
      .mockImplementationOnce(async () => {
        db.prepare('UPDATE foreshadowings SET planned_recovery_chapter_index=4 WHERE id=?').run('clue');
        return review(true);
      });
    await expect(run()).rejects.toThrow('提交冲突');
    expect(chapterValue()).toBe(4);
  });

  it('preserves text beyond the audit preview when committing an anchored patch', async () => {
    const original = (db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content;
    controller.llmCallWithRetry.mockResolvedValueOnce(review(false, ['章纲回收章节冲突']))
      .mockResolvedValueOnce({ data: { patches: [{ entityType: 'chapter', entityId: 'chapter0', field: 'content', match: '第三章回收', replacement: '第五章回收' }] }, warnings: [] })
      .mockResolvedValueOnce(review(true));
    await run();
    expect((db.prepare('SELECT content FROM outlines WHERE id=?').get('chapter0') as any).content).toBe(original.replace('第三章回收', '第五章回收'));
  });
});
