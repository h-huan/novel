import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GeneratedChapterCommitService } from './generated-chapter-commit.service';

type FixtureOptions = {
  runId?: string | null;
  guardError?: Error | null;
  chapterStatus?: string;
};

function fixture(options: FixtureOptions = {}) {
  const runId = options.runId === undefined ? 'run-passed' : options.runId;
  const chapter = {
    id: 'chapter-1', project_id: 'project-1', chapter_index: 1,
    status: options.chapterStatus || 'draft',
  };
  const get = vi.fn((...args: unknown[]) => {
    if (args[0] === 'chapter-1' && args[1] === 'project-1') return chapter;
    if (args[0] === 'project-1' && args[1] === 1) return runId ? { id: runId } : undefined;
    return undefined;
  });
  const prepare = vi.fn((sql: string) => {
    if (sql.includes('FROM chapters')) return { get };
    if (sql.includes('FROM generation_runs')) return { get };
    throw new Error(`unexpected sql: ${sql}`);
  });
  const database = { getDb: () => ({ prepare }) } as any;
  const generatedCanonGuard = {
    assertCanCommit: vi.fn(() => {
      if (options.guardError) throw options.guardError;
      return {
        runId: runId || '', projectId: 'project-1', stage: 'chapter', scenario: 'writing', outputText: '正文',
      };
    }),
  } as any;
  const chapters = { update: vi.fn(async (_id: string, dto: any) => ({ id: 'chapter-1', content: dto.content })) } as any;
  return {
    service: new GeneratedChapterCommitService(database, generatedCanonGuard, chapters),
    generatedCanonGuard,
    chapters,
  };
}

describe('GeneratedChapterCommitService', () => {
  it('rejects AI text that has no matching generation run', async () => {
    const { service, generatedCanonGuard, chapters } = fixture({ runId: null });
    await expect(service.commit('project-1', 'chapter-1', '正文')).rejects.toBeInstanceOf(BadRequestException);
    expect(generatedCanonGuard.assertCanCommit).not.toHaveBeenCalled();
    expect(chapters.update).not.toHaveBeenCalled();
  });

  it('propagates a stale-run conflict from the single canonical guard', async () => {
    const { service, chapters } = fixture({ guardError: new ConflictException('stale') });
    await expect(service.commit('project-1', 'chapter-1', '正文')).rejects.toBeInstanceOf(ConflictException);
    expect(chapters.update).not.toHaveBeenCalled();
  });

  it('persists only after the shared canonical guard verifies the matching run', async () => {
    const { service, generatedCanonGuard, chapters } = fixture();
    await expect(service.commit('project-1', 'chapter-1', '正文')).resolves.toMatchObject({ content: '正文' });
    expect(generatedCanonGuard.assertCanCommit).toHaveBeenCalledWith({
      projectId: 'project-1',
      runId: 'run-passed',
      outputText: '正文',
      expectedStages: ['chapter'],
    });
    expect(chapters.update).toHaveBeenCalledWith('chapter-1', { content: '正文' });
  });
});
