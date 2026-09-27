import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GeneratedChapterCommitService } from './generated-chapter-commit.service';

type FixtureOptions = {
  runId?: string | null;
  current?: boolean;
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
  const metrics = { runIsCurrent: vi.fn(() => options.current ?? true) } as any;
  const chapters = { update: vi.fn(async (_id: string, dto: any) => ({ id: 'chapter-1', content: dto.content })) } as any;
  return {
    service: new GeneratedChapterCommitService(database, metrics, chapters),
    metrics,
    chapters,
  };
}

describe('GeneratedChapterCommitService', () => {
  it('rejects AI text that has no matching passed generation run', async () => {
    const { service, chapters } = fixture({ runId: null });
    await expect(service.commit('project-1', 'chapter-1', '正文')).rejects.toBeInstanceOf(BadRequestException);
    expect(chapters.update).not.toHaveBeenCalled();
  });

  it('rejects a passed run whose constitution/context is no longer current', async () => {
    const { service, chapters } = fixture({ current: false });
    await expect(service.commit('project-1', 'chapter-1', '正文')).rejects.toBeInstanceOf(ConflictException);
    expect(chapters.update).not.toHaveBeenCalled();
  });

  it('persists only after a matching passed current run is verified', async () => {
    const { service, metrics, chapters } = fixture();
    await expect(service.commit('project-1', 'chapter-1', '正文')).resolves.toMatchObject({ content: '正文' });
    expect(metrics.runIsCurrent).toHaveBeenCalledWith('run-passed', 'project-1');
    expect(chapters.update).toHaveBeenCalledWith('chapter-1', { content: '正文' });
  });
});
