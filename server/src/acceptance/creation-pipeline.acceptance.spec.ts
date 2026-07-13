import { describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { ModuleRef } from '@nestjs/core';
import { ChapterDerivedDataSyncService } from '../modules/chapter/chapter-derived-data-sync.service';
import { ChunkerService } from '../rag/chunker.service';
import { up as derivedUp } from '../database/migrations/026_chapter_derived_data_sync';
import { up as aggregateUp } from '../database/migrations/029_aggregate_summary_content';
import { up as diagnosticsUp } from '../database/migrations/030_aggregate_summary_diagnostics';

describe('creation pipeline SQLite acceptance', () => {
  it('persists pending diagnostics, rebuilds volume then novel, and remains idempotent', async () => {
    const db = new DatabaseSync(':memory:'); db.exec('CREATE TABLE chapters (id TEXT PRIMARY KEY, project_id TEXT, volume_index INTEGER, chapter_index INTEGER, content TEXT)'); derivedUp(db); aggregateUp(db); diagnosticsUp(db);
    db.prepare('INSERT INTO chapters VALUES (?,?,?,?,?)').run('c1','p',1,1,'body');
    const llm = { isAvailable: vi.fn(async () => true), generate: vi.fn(async () => ({ content: 'aggregate' })) };
    const service = new ChapterDerivedDataSyncService({ getDb: () => db } as any, new ChunkerService(), {} as any, {} as any, { get: () => llm } as ModuleRef);
    const pending = await service.rebuildVolumeSummary('p',1); expect(pending.missingChapterIds).toEqual(['c1']); expect(pending.diagnosticReason).toBe('source_summary_missing_or_stale');
    const checksum = require('crypto').createHash('sha256').update('body').digest('hex'); db.prepare('INSERT INTO chapter_summaries VALUES (?,?,?,?,?,?,?,?,?)').run('s1','p','c1',checksum,'chapter summary','mock','current','now','now');
    await service.rebuildVolumeSummary('p',1); await service.rebuildNovelSummary('p'); const count = llm.generate.mock.calls.length;
    await service.rebuildVolumeSummary('p',1); await service.rebuildNovelSummary('p');
    expect(db.prepare("SELECT status,stale,diagnostics FROM aggregate_summary_states WHERE scope_key='novel'").get()).toMatchObject({ status:'current', stale:0, diagnostics:null }); expect(llm.generate).toHaveBeenCalledTimes(count);
  });
});
