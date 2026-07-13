import { describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { ModuleRef } from '@nestjs/core';
import { ChapterDerivedDataSyncService } from './chapter-derived-data-sync.service';
import { DatabaseService } from '../../database/database.service';
import { ChunkerService } from '../../rag/chunker.service';
import { VectorIndexService } from '../../rag/vector-index.service';
import { EmbeddingService } from '../../rag/embedding.service';
import { up } from '../../database/migrations/030_aggregate_summary_diagnostics';

function service(llm: any) {
  return new ChapterDerivedDataSyncService({ getDb: () => ({}) } as DatabaseService, new ChunkerService(), {} as VectorIndexService, {} as EmbeddingService, { get: () => llm } as ModuleRef);
}

describe('aggregate summary acceptance', () => {
  it('recursively reduces long input and never exceeds the complete prompt budget', async () => {
    const prompts: string[] = []; const llm = { generate: vi.fn(async (request: any) => { prompts.push(request.prompt); return { content: 'stage' }; }) };
    const result = await (service(llm) as any).reduceAggregateInputs(llm, Array.from({ length: 50 }, () => 'x'.repeat(5000)), 'volume', 'requirements');
    expect(result).toBe('stage'); expect(prompts.length).toBeGreaterThan(3); expect(prompts.every((prompt) => prompt.length <= 48000)).toBe(true);
  });
  it('does not silently truncate a single oversized summary', () => {
    const batches = (service({}) as any).summaryBatches(['a'.repeat(90000)]);
    expect(batches.flat().join('').length).toBe(90000); expect(batches.flat().every((part: string) => part.length <= 44000)).toBe(true);
  });
  it('migration 030 is idempotent', () => {
    const db = new DatabaseSync(':memory:'); db.exec('CREATE TABLE aggregate_summary_states (id TEXT)'); up(db); up(db);
    expect(() => db.prepare('SELECT diagnostics FROM aggregate_summary_states').all()).not.toThrow();
  });
});
