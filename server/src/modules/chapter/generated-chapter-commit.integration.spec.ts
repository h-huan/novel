import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeneratedChapterCommitService } from './generated-chapter-commit.service';
import { GeneratedCanonGuardService } from '../generation-metrics/generated-canon-guard.service';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

describe('GeneratedChapterCommitService database boundary', () => {
  let db: InstanceType<typeof DatabaseSync> | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('selects the later final Gate PASS run when the first draft has the same body text', async () => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE chapters (
        id TEXT PRIMARY KEY, project_id TEXT, chapter_index INTEGER, status TEXT
      );
      CREATE TABLE generation_runs (
        id TEXT PRIMARY KEY, project_id TEXT, chapter_index INTEGER, stage TEXT,
        scenario TEXT, status TEXT, gate_status TEXT, output_text TEXT, started_at TEXT
      );
    `);
    const exactOutput = '\n第一章正文\n';
    db.prepare('INSERT INTO chapters VALUES (?,?,?,?)').run('chapter-1', 'project-1', 1, 'draft');
    db.prepare('INSERT INTO generation_runs VALUES (?,?,?,?,?,?,?,?,?)').run(
      'run-first-draft', 'project-1', 1, 'chapter', 'writing',
      'success', 'not_evaluated', exactOutput, '2026-09-27T10:00:00.000Z',
    );
    db.prepare('INSERT INTO generation_runs VALUES (?,?,?,?,?,?,?,?,?)').run(
      'run-final-gate', 'project-1', 1, 'chapter', 'writing',
      'success', 'passed', exactOutput, '2026-09-27T10:01:00.000Z',
    );

    const database = { getDb: () => db } as any;
    const metrics = { runIsCurrent: vi.fn(() => true) } as any;
    const guard = new GeneratedCanonGuardService(database, metrics);
    const chapters = {
      update: vi.fn(async (_id: string, dto: { content: string }) => ({ id: 'chapter-1', content: dto.content })),
    } as any;
    const service = new GeneratedChapterCommitService(database, guard, chapters);

    await expect(service.commit('project-1', 'chapter-1', exactOutput))
      .resolves.toMatchObject({ content: exactOutput });
    expect(metrics.runIsCurrent).toHaveBeenCalledWith('run-final-gate', 'project-1');
    expect(chapters.update).toHaveBeenCalledWith('chapter-1', { content: exactOutput });
  });
});
