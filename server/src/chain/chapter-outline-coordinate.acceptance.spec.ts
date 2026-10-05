import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { findChapterOutline, readOrderedChapterOutlines } from './chapter-outline-coordinate';
import { chapterNumberFromOrder } from '../../shared/src';

describe('shared story chapter coordinates', () => {
  it('never guesses that the next zero-based sibling is the current story chapter', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE outlines(id TEXT,project_id TEXT,parent_id TEXT,level TEXT,"order" INTEGER,title TEXT); CREATE TABLE chapters(id TEXT,project_id TEXT,outline_id TEXT,chapter_index INTEGER)');
      for (const project of ['short', 'another']) for (let i=0;i<3;i++)
        db.prepare('INSERT INTO outlines VALUES(?,?,NULL,?,?,?)').run(project+i,project,'chapter',i,'第'+(i+1)+'章');
      expect(findChapterOutline(db,'short',1).id).toBe('short0');
      expect(findChapterOutline(db,'short',2).id).toBe('short1');
      expect(findChapterOutline(db,'another',3).id).toBe('another2');
      expect(findChapterOutline(db,'short',0)).toBeUndefined();
      expect([0,1,2].map(chapterNumberFromOrder)).toEqual([1,2,3]);
    } finally { db.close(); }
  });

  it('uses global volume order and persisted outline binding when sibling orders repeat', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE outlines(id TEXT,project_id TEXT,parent_id TEXT,level TEXT,"order" INTEGER,title TEXT); CREATE TABLE chapters(id TEXT,project_id TEXT,outline_id TEXT,chapter_index INTEGER)');
      for(let volume=0;volume<2;volume++) {
        db.prepare('INSERT INTO outlines VALUES(?,?,NULL,?,?,?)').run('v'+volume,'long','volume',volume,'卷');
        for(let chapter=0;chapter<2;chapter++)
          db.prepare('INSERT INTO outlines VALUES(?,?,?,?,?,?)').run('v'+volume+'c'+chapter,'long','v'+volume,'chapter',chapter,'章');
      }
      expect(readOrderedChapterOutlines(db,'long').map(r=>r.id)).toEqual(['v0c0','v0c1','v1c0','v1c1']);
      expect(findChapterOutline(db,'long',3).id).toBe('v1c0');
      db.prepare('INSERT INTO chapters VALUES(?,?,?,?)').run('bound','long','v1c1',3);
      expect(findChapterOutline(db,'long',3).id).toBe('v1c1');
      expect(findChapterOutline(db,'long',1,'bound').id).toBe('v1c1');
      expect(()=>findChapterOutline(db,'long',1,'unknown')).toThrow('禁止按排序猜测另一章');
    } finally { db.close(); }
  });
});
