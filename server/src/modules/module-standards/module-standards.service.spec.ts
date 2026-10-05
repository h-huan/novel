import { afterEach, describe, expect, it } from 'vitest';
import { ModuleStandardsService } from './module-standards.service';
import { standardDirectiveCache } from './standard-directive.cache';
import { SYSTEM_WORKFLOW_RULESET_VERSION } from './system-workflow-rules.registry';

describe('System Workflow Rule Registry projections', () => {
  afterEach(() => standardDirectiveCache.clear());

  it('loads active registry rules into the runtime prompt cache', () => {
    const service = new ModuleStandardsService();
    service.onModuleInit();
    const snapshot = standardDirectiveCache.snapshot('writing');
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.available).toBe(true);
    expect(snapshot.rulesetVersion).toBe(SYSTEM_WORKFLOW_RULESET_VERSION);
    expect(snapshot.ruleIds).toContain('ARCH-003');
    expect(snapshot.ruleIds).toContain('RPR-002');
    expect(snapshot.modules.every((item) => item.baseline === SYSTEM_WORKFLOW_RULESET_VERSION)).toBe(true);
  });

  it('uses a stable ruleset version while digest depends on rendered rules', () => {
    const service = new ModuleStandardsService();
    service.onModuleInit();
    const first = standardDirectiveCache.snapshot('writing');
    service.loadToCache();
    const second = standardDirectiveCache.snapshot('writing');
    expect(second.rulesetVersion).toBe(first.rulesetVersion);
    expect(second.digest).toBe(first.digest);
  });

  it('injects Rule IDs instead of module-owned public prose', () => {
    const service = new ModuleStandardsService();
    service.onModuleInit();
    const idea = standardDirectiveCache.get('idea_generate');
    expect(idea).toContain('QLT-006');
    expect(idea).toContain('QLT-007');
    expect(idea).toContain('GEN-002');
    expect(idea).not.toContain('至少 3 个有效信号');
  });

  it('exposes category/module views as registry projections only', () => {
    const service = new ModuleStandardsService();
    service.onModuleInit();
    const standards = service.list();
    const rules = service.listRules();
    const status = service.status();
    expect(rules.length).toBeGreaterThan(20);
    expect(standards.every((item) => item.source === 'system_workflow_rule_registry')).toBe(true);
    expect(status.standardSource).toBe('system_workflow_rule_registry');
    expect(status.rulesetVersion).toBe(SYSTEM_WORKFLOW_RULESET_VERSION);
  });

  it('provides dependency impact lookup for safe rule changes', () => {
    const service = new ModuleStandardsService();
    const impact = service.impact('AUTH-002');
    expect(impact).not.toBeNull();
    expect(impact!.dependents.map((item) => item.id)).toContain('CTX-001');
  });
});
