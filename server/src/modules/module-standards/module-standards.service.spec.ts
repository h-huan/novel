import { afterEach, describe, expect, it } from 'vitest';
import { ModuleStandardsService } from './module-standards.service';
import { SEED_BASELINE_VERSION } from './module-standards.seed';
import { standardDirectiveCache } from './standard-directive.cache';

describe('ModuleStandardsService read-only execution standard', () => {
  afterEach(() => standardDirectiveCache.clear());

  it('loads the code seed into the runtime directive cache without external dependencies', () => {
    const service = new ModuleStandardsService();
    service.onModuleInit();

    const snapshot = standardDirectiveCache.snapshot('writing');
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.available).toBe(true);
    expect(snapshot.modules.length).toBeGreaterThan(0);
    expect(snapshot.modules.every((item) => item.baseline === SEED_BASELINE_VERSION)).toBe(true);
  });

  it('exposes only the deterministic code seed and no self-induction state', () => {
    const service = new ModuleStandardsService();
    service.onModuleInit();

    const standards = service.list();
    const status = service.status();

    expect(standards.length).toBeGreaterThan(0);
    expect(standards.every((item) => item.source === 'code_seed')).toBe(true);
    expect(standards.every((item) => item.seedBaselineVersion === SEED_BASELINE_VERSION)).toBe(true);
    expect(status.running).toEqual([]);
    expect(status.recent).toEqual([]);
    expect(status.dirtyCount).toBe(0);
    expect(status.standardSource).toBe('code_seed');
    expect((service as any).summarizeModule).toBeUndefined();
  });
});
