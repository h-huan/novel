import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModuleStandardsService } from './module-standards.service';

describe('ModuleStandardsService paid-call boundaries', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not schedule model work during service startup', () => {
    vi.useFakeTimers();
    const generate = vi.fn();
    const service = new ModuleStandardsService({} as any, { generate } as any, {} as any);
    (service as any).recoverInterruptedRuns = vi.fn();
    service.ensureSeeded = vi.fn();
    service.loadToCache = vi.fn();

    service.onModuleInit();

    expect(vi.getTimerCount()).toBe(0);
    expect(generate).not.toHaveBeenCalled();
  });

  it('keeps status polling read-only and does not schedule model work', () => {
    vi.useFakeTimers();
    const generate = vi.fn();
    const all = vi.fn().mockReturnValue([]);
    const database = { prepare: vi.fn().mockReturnValue({ all }) };
    const service = new ModuleStandardsService(
      { getDb: () => database } as any,
      { generate } as any,
      {} as any,
    );

    const result = service.status();

    expect(result.dirtyCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(generate).not.toHaveBeenCalled();
  });
});
