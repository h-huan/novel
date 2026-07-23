import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import { up as initialUp } from '../../database/migrations/001_initial';
import { up as timelineUp } from '../../database/migrations/014_timeline';
import { up as writingQualityUp } from '../../database/migrations/018_writing_quality_engine';
import { up as creativeCoreUp } from '../../database/migrations/019_phase_6_9_creative_core';
import { OutlineRepository } from '../../database/repositories/outline.repository';
import { OutlineService } from './outline.service';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const databases: Array<InstanceType<typeof DatabaseSync>> = [];

function fixture() {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  db.exec('PRAGMA foreign_keys = ON');
  initialUp(db);
  timelineUp(db);
  writingQualityUp(db);
  creativeCoreUp(db);
  db.prepare(`INSERT INTO projects (id,type,title,status,target_words,current_words,settings,created_at,updated_at)
    VALUES ('p','long_novel','结构同步','active',2000000,0,'{"chapterWordRange":{"min":3200,"max":4000},"structurePlanning":"dynamic_by_story_rhythm"}','2000-01-01','2000-01-01')`).run();
  const database = {
    getDb: () => db,
    transaction: (fn: () => unknown) => {
      db.exec('BEGIN');
      try { const result = fn(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  const service = new OutlineService(new OutlineRepository(database as any), database as any);
  const volume = service.create('p', { title: '第一卷', level: 'volume', order: 0 });
  const first = service.create('p', { title: '第一章', level: 'chapter', parentId: volume.id, order: 0, content: '第一章详细大纲', targetWords: 3400 });
  const second = service.create('p', { title: '第二章', level: 'chapter', parentId: volume.id, order: 1, content: '第二章详细大纲', targetWords: 3900 });
  db.prepare(`INSERT INTO foreshadowings (id,project_id,content,buried_chapter_index,planned_recovery_chapter_index,created_at,updated_at)
    VALUES ('fs','p','第二章线索',2,2,'2000-01-01','2000-01-01')`).run();
  return { db, service, first, second };
}

afterEach(() => { while (databases.length) databases.pop()!.close(); });

describe('outline structure and body synchronization', () => {
  it('splits a blank chapter, keeps bodies blank, and shifts legacy chapter references atomically', () => {
    const { db, service, first } = fixture();

    const result = service.split(first.id, { newTitle: '新第二章', splitPoint: 4, originalTargetWords: 3300, newTargetWords: 3500 });
    const chapters = db.prepare('SELECT chapter_index, outline_id, content, status FROM chapters WHERE project_id = ? ORDER BY chapter_index').all('p') as any[];
    const foreshadowing = db.prepare(`SELECT buried_chapter_index, planned_recovery_chapter_index FROM foreshadowings WHERE id='fs'`).get() as any;

    expect(result.new.title).toBe('新第二章');
    expect(chapters.map(chapter => chapter.chapter_index)).toEqual([1, 2, 3]);
    expect(chapters.every(chapter => chapter.content === '' && chapter.status === 'draft')).toBe(true);
    expect(chapters[1].outline_id).toBe(result.new.id);
    expect(foreshadowing).toMatchObject({ buried_chapter_index: 3, planned_recovery_chapter_index: 3 });
  });

  it('keeps an existing body linked to its outline and renumbers it when an earlier outline chapter is inserted', () => {
    const { db, service, first, second } = fixture();
    const third = service.create('p', { title: '第三章', level: 'chapter', parentId: first.parentId, order: 2, content: '第三章详细大纲', targetWords: 3400 });
    db.prepare('UPDATE chapters SET content = ?, word_count = ? WHERE outline_id = ?').run('written chapter three', 21, third.id);
    const inserted = service.insertAdjacent(first.id, { position: 'after', targetWords: 3700 });
    const chapters = db.prepare(`SELECT chapter_index, outline_id, content FROM chapters WHERE project_id='p' ORDER BY chapter_index`).all() as any[];
    const foreshadowing = db.prepare(`SELECT buried_chapter_index, planned_recovery_chapter_index FROM foreshadowings WHERE id='fs'`).get() as any;
    expect(chapters.map(chapter => chapter.chapter_index)).toEqual([1, 2, 3, 4]);
    expect(chapters.find(chapter => chapter.outline_id === inserted.id)?.chapter_index).toBe(2);
    expect(chapters.find(chapter => chapter.outline_id === third.id)).toMatchObject({ chapter_index: 4, content: 'written chapter three' });
    expect(chapters.find(chapter => chapter.outline_id === second.id)?.chapter_index).toBe(3);
    expect(foreshadowing).toMatchObject({ buried_chapter_index: 3, planned_recovery_chapter_index: 3 });
    /* Legacy assertion for the former blocking behavior:
    db.prepare(`UPDATE chapters SET content='已写正文', word_count=4 WHERE outline_id=?`).run(second.id);

    expect(() => service.insertAdjacent(first.id, { position: 'after', title: '禁止插入', targetWords: 3700 })).toThrow('已有正文');
    expect((db.prepare(`SELECT COUNT(*) AS count FROM outlines WHERE project_id='p' AND level='chapter'`).get() as any).count).toBe(2);
    expect((db.prepare(`SELECT COUNT(*) AS count FROM chapters WHERE project_id='p'`).get() as any).count).toBe(2);
    */
  });

  it('uses the updated outline order as the sole source for body chapter indexes', () => {
    const { db, service, first, second } = fixture();
    db.prepare('UPDATE chapters SET content = ?, word_count = ? WHERE outline_id = ?').run('first body', 10, first.id);
    db.prepare('UPDATE chapters SET content = ?, word_count = ? WHERE outline_id = ?').run('second body', 11, second.id);

    service.move(second.id, { newParentId: first.parentId || undefined, newOrder: 0 });

    const chapters = db.prepare(`SELECT chapter_index, outline_id, content FROM chapters WHERE project_id = 'p' ORDER BY chapter_index`).all() as any[];
    expect(chapters).toEqual([
      expect.objectContaining({ chapter_index: 1, outline_id: second.id, content: 'second body' }),
      expect.objectContaining({ chapter_index: 2, outline_id: first.id, content: 'first body' }),
    ]);
  });
});
