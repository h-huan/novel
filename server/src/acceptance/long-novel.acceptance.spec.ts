import { describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { ModuleRef } from '@nestjs/core';
import { ChapterDerivedDataSyncService } from '../modules/chapter/chapter-derived-data-sync.service';
import { ChunkerService } from '../rag/chunker.service';
import { up as derivedUp } from '../database/migrations/026_chapter_derived_data_sync';
import { up as aggregateUp } from '../database/migrations/029_aggregate_summary_content';
import { up as diagnosticsUp } from '../database/migrations/030_aggregate_summary_diagnostics';

describe('300 chapter aggregate acceptance', () => {
  it('builds dynamically distributed volume summaries and one novel summary from summaries only, idempotently', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE chapters (id TEXT PRIMARY KEY, project_id TEXT, volume_index INTEGER, chapter_index INTEGER, content TEXT)'); derivedUp(db); aggregateUp(db); diagnosticsUp(db);
    const volumeSizes = [17, 23, 31, 19, 28, 22, 35, 16, 27, 24, 30, 28];
    expect(volumeSizes.reduce((sum, size) => sum + size, 0)).toBe(300);
    for (const [offset, chapterCount] of volumeSizes.entries()) for (let chapter = 1; chapter <= chapterCount; chapter++) {
      const volume = [1, 3, 5, 8, 12, 13, 21, 34, 35, 55, 56, 89][offset];
      const id = `v${volume}c${chapter}`; const content = `body-${id}`;
      db.prepare('INSERT INTO chapters VALUES (?,?,?,?,?)').run(id, 'p', volume, chapter, content);
      db.prepare('INSERT INTO chapter_summaries VALUES (?,?,?,?,?,?,?,?,?)').run(`s-${id}`, 'p', id, require('crypto').createHash('sha256').update(content).digest('hex'), `summary-${id}-${'x'.repeat(2500)}`, 'mock', 'current', 'now', 'now');
    }
    const prompts: string[] = []; const llm = { isAvailable: vi.fn(async () => true), generate: vi.fn(async (r: any) => { prompts.push(r.prompt); return { content: `aggregate-${prompts.length}` }; }) };
    const service = new ChapterDerivedDataSyncService({ getDb: () => db } as any, new ChunkerService(), {} as any, {} as any, { get: () => llm } as ModuleRef);
    const volumeIndexes = (db.prepare('SELECT DISTINCT volume_index FROM chapters WHERE project_id=? ORDER BY volume_index').all('p') as any[]).map((row) => row.volume_index);
    for (const volume of volumeIndexes) await service.rebuildVolumeSummary('p', volume);
    await service.rebuildNovelSummary('p'); const calls = llm.generate.mock.calls.length;
    const before = db.prepare('SELECT scope_key,source_fingerprint FROM aggregate_summary_states WHERE project_id=? ORDER BY scope_key').all('p');
    for (const volume of volumeIndexes) await service.rebuildVolumeSummary('p', volume); await service.rebuildNovelSummary('p');
    expect(db.prepare("SELECT COUNT(*) count FROM aggregate_summary_states WHERE scope='volume'").get()).toEqual({ count: volumeIndexes.length });
    expect(db.prepare("SELECT COUNT(*) count FROM aggregate_summary_states WHERE scope='novel'").get()).toEqual({ count: 1 });
    expect(volumeIndexes).toEqual([1, 3, 5, 8, 12, 13, 21, 34, 35, 55, 56, 89]);
    expect(prompts.every((prompt) => prompt.length <= 48000 && !prompt.includes('body-v'))).toBe(true);
    expect(prompts.some((prompt) => prompt.includes('summary-v1c1'))).toBe(true);
    expect(prompts.some((prompt) => prompt.includes('aggregate-'))).toBe(true);
    expect(llm.generate).toHaveBeenCalledTimes(calls); expect(calls).toBeGreaterThan(volumeIndexes.length);
    expect(db.prepare('SELECT project_id,scope_key,COUNT(*) count FROM aggregate_summary_states GROUP BY project_id,scope_key HAVING COUNT(*) > 1').all()).toEqual([]);
    expect(db.prepare('SELECT scope_key,source_fingerprint FROM aggregate_summary_states WHERE project_id=? ORDER BY scope_key').all('p')).toEqual(before);
  });
});
