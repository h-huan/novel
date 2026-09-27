import { describe, expect, it, vi } from 'vitest';
import { ConflictController } from './conflict.controller';

describe('conflict dashboard hardline visibility', () => {
  it('queries persisted blocking hardlines and marks them as blocking in the panel response', () => {
    const sql: string[] = [];
    const db = {
      prepare: vi.fn((statement: string) => {
        sql.push(statement);
        return { all: () => [{
          id: 'hardline-1', project_id: 'project-1', chapter_id: 'chapter-1',
          chapter_index: 1, chapter_status: 'draft', issue_type: 'hardline.outline_alignment',
          severity: 'blocking', status: 'open', summary: '【硬红线·确定性扫描·35】标点平板',
          payload: JSON.stringify({ qualityIssue: { source: 'alignment_verifier_hardline' } }),
        }] };
      }),
    };
    const controller = new ConflictController({ getDb: () => db } as any, {} as any);
    const response = controller.getConflicts({ projectId: 'project-1', chapterIndex: '1' });

    expect(sql[0]).toContain("i.issue_type IN ('originality','outline_alignment','hardline.outline_alignment')");
    expect(sql[0]).toContain("i.status IN ('open','resolved')");
    expect(response.conflicts).toEqual([expect.objectContaining({
      type: '正文硬红线', sourceLabel: '语言与内容规范', blocking: true,
      description: expect.stringContaining('标点平板'),
    })]);
  });
});
