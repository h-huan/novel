import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { ModuleRef } from '@nestjs/core';
import { ChapterDerivedDataSyncService } from '../modules/chapter/chapter-derived-data-sync.service';
import { ChunkerService } from '../rag/chunker.service';
import { up as initSchema } from '../database/migrations/001_initial';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

describe('creation pipeline SQLite acceptance', () => {
  it('persists pending diagnostics, rebuilds volume then novel, and remains idempotent', async () => {
    const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=OFF;'); initSchema(db);
    db.prepare('INSERT INTO chapters (id,project_id,volume_index,chapter_index,title,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run('c1','p',1,1,'c1','body','t','t');
    expect(db.prepare('SELECT id FROM chapters WHERE project_id=? AND volume_index=?').all('p', 1)).toHaveLength(1);
    const llm = { isAvailable: vi.fn(async () => true), generate: vi.fn(async () => ({ content: 'aggregate' })) };
    const service = new ChapterDerivedDataSyncService({ getDb: () => db } as any, new ChunkerService(), {} as any, {} as any, { get: () => llm } as ModuleRef);
    const pending = await service.rebuildVolumeSummary('p',1); expect(pending.missingChapterIds).toEqual(['c1']); expect(pending.diagnosticReason).toBe('source_summary_missing_or_stale');
    const checksum = require('crypto').createHash('sha256').update('body').digest('hex'); db.prepare('INSERT INTO chapter_summaries VALUES (?,?,?,?,?,?,?,?,?)').run('s1','p','c1',checksum,'chapter summary','mock','current','now','now');
    await service.rebuildVolumeSummary('p',1); await service.rebuildNovelSummary('p'); const count = llm.generate.mock.calls.length;
    await service.rebuildVolumeSummary('p',1); await service.rebuildNovelSummary('p');
    expect(db.prepare("SELECT status,stale,diagnostics FROM aggregate_summary_states WHERE scope_key='novel'").get()).toMatchObject({ status:'current', stale:0, diagnostics:null }); expect(llm.generate).toHaveBeenCalledTimes(count);
  });
});
