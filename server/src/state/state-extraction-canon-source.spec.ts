import { describe, expect, it, vi } from 'vitest';
import { StateExtractionService } from './state-extraction.service';

describe('StateExtractionService Canon source guard', () => {
  const createService = (run: { id: string } | undefined, guardImpl?: () => void) => {
    const db = {
      prepare: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue(run) }),
    };
    const guard = { assertCanCommit: vi.fn(guardImpl ?? (() => undefined)) };
    const service = new StateExtractionService(
      { getDb: () => db } as any,
      {} as any,
      {} as any,
      guard as any,
      undefined,
    ) as any;
    return { service, guard, db };
  };

  it('accepts an explicitly locked chapter without requiring an AI run', () => {
    const { service, guard, db } = createService(undefined);
    const accepted = service.isTrustedExtractionSource('p1', {
      id: 'c1', content: '作者已确认正文', status: 'locked', chapter_index: 1,
    });
    expect(accepted).toBe(true);
    expect(db.prepare).not.toHaveBeenCalled();
    expect(guard.assertCanCommit).not.toHaveBeenCalled();
  });

  it('rejects a mutable draft when it has no matching passed/current generation run', () => {
    const { service, guard } = createService(undefined);
    const accepted = service.isTrustedExtractionSource('p1', {
      id: 'c1', content: '尚未验收草稿', status: 'draft', chapter_index: 1,
    });
    expect(accepted).toBe(false);
    expect(guard.assertCanCommit).not.toHaveBeenCalled();
  });

  it('accepts an AI draft only when the existing Canon guard validates the exact run and body', () => {
    const { service, guard } = createService({ id: 'run-pass' });
    const accepted = service.isTrustedExtractionSource('p1', {
      id: 'c1', content: '最终通过 Gate 的正文', status: 'draft', chapter_index: 1,
    });
    expect(accepted).toBe(true);
    expect(guard.assertCanCommit).toHaveBeenCalledWith({
      projectId: 'p1',
      runId: 'run-pass',
      outputText: '最终通过 Gate 的正文',
      expectedStages: ['chapter'],
    });
  });

  it('rejects a matching historical run when the central Canon guard says it is stale', () => {
    const { service } = createService({ id: 'run-old' }, () => { throw new Error('stale'); });
    const accepted = service.isTrustedExtractionSource('p1', {
      id: 'c1', content: '旧正文', status: 'draft', chapter_index: 1,
    });
    expect(accepted).toBe(false);
  });
});
