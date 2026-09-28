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

  it('injects story-specific title requirements into idea generation', () => {
    const service = new ModuleStandardsService();
    service.onModuleInit();

    const directive = standardDirectiveCache.get('idea_generate');
    expect(directive).toContain('书名必须从本故事的具体人物关系、处境、规则、代价、异常事实或信息差中提取至少一个可识别钩子');
    expect(directive).toContain('同批候选的书名必须体现不同故事身份');
    expect(directive).toContain('不得在标题直接泄露终局反转');
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
