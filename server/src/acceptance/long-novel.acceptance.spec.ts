import { describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { ModuleRef } from '@nestjs/core';
import { ChapterDerivedDataSyncService } from '../modules/chapter/chapter-derived-data-sync.service';
import { ChunkerService } from '../rag/chunker.service';
import { up as derivedUp } from '../database/migrations/026_chapter_derived_data_sync';
import { up as aggregateUp } from '../database/migrations/029_aggregate_summary_content';
import { up as diagnosticsUp } from '../database/migrations/030_aggregate_summary_diagnostics';

describe.skip('300 chapter aggregate acceptance', () => {
  it('builds ten volume summaries and one novel summary from summaries only, idempotently', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE chapters (id TEXT PRIMARY KEY, project_id TEXT, volume_index INTEGER, chapter_index INTEGER, content TEXT)'); derivedUp(db); aggregateUp(db); diagnosticsUp(db);
    for (let volume = 1; volume <= 10; volume++) for (let chapter = 1; chapter <= 30; chapter++) {
      const id = `v${volume}c${chapter}`; const content = `body-${id}`;
      db.prepare('INSERT INTO chapters VALUES (?,?,?,?,?)').run(id, 'p', volume, chapter, content);
      db.prepare('INSERT INTO chapter_summaries VALUES (?,?,?,?,?,?,?,?,?)').run(`s-${id}`, 'p', id, require('crypto').createHash('sha256').update(content).digest('hex'), `summary-${id}-${'x'.repeat(2500)}`, 'mock', 'current', 'now', 'now');
    }
    const prompts: string[] = []; const llm = { isAvailable: vi.fn(async () => true), generate: vi.fn(async (r: any) => { prompts.push(r.prompt); return { content: `aggregate-${prompts.length}` }; }) };
    const service = new ChapterDerivedDataSyncService({ getDb: () => db } as any, new ChunkerService(), {} as any, {} as any, { get: () => llm } as ModuleRef);
    for (let volume = 1; volume <= 10; volume++) await service.rebuildVolumeSummary('p', volume);
    await service.rebuildNovelSummary('p'); const calls = llm.generate.mock.calls.length;
    for (let volume = 1; volume <= 10; volume++) await service.rebuildVolumeSummary('p', volume); await service.rebuildNovelSummary('p');
    expect(db.prepare("SELECT COUNT(*) count FROM aggregate_summary_states WHERE scope='volume'").get()).toEqual({ count: 10 });
    expect(db.prepare("SELECT COUNT(*) count FROM aggregate_summary_states WHERE scope='novel'").get()).toEqual({ count: 1 });
    expect(prompts.every((prompt) => prompt.length <= 48000)).toBe(true); expect(llm.generate).toHaveBeenCalledTimes(calls);
  });
});
