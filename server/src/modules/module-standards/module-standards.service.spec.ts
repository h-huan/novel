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

  it('projects narrative restraint into outline, writing, review and repair without changing gate severity', () => {
    const service = new ModuleStandardsService();
    service.onModuleInit();
    const rule = service.getRule('QLT-003')!;
    expect(rule.level).toBe('P2');
    expect(rule.blocking).toBe(false);
    for (const scene of ['outline', 'writing', 'review', 'quality_refine']) {
      const prompt = standardDirectiveCache.get(scene);
      expect(prompt).toContain('未到期伏笔');
      expect(prompt).toContain('不按解释句数量扣分');
      expect(prompt).toContain('全知视角按已选视角判断');
      expect(prompt).toContain('未知标签定义不得编造');
      expect(standardDirectiveCache.snapshot(scene).ruleIds).toContain('QLT-003');
    }
    expect(standardDirectiveCache.get('writing')).toContain(rule.directives!.generation);
    expect(standardDirectiveCache.get('review')).toContain(rule.directives!.review);
    expect(standardDirectiveCache.get('quality_refine')).toContain(rule.directives!.repair);
  });

  it('provides dependency impact lookup for safe rule changes', () => {
    const service = new ModuleStandardsService();
    const impact = service.impact('AUTH-002');
    expect(impact).not.toBeNull();
    expect(impact!.dependents.map((item) => item.id)).toContain('CTX-001');
  });
});

it('projects source rules for first-draft execution and verified learning without relaxing gates', () => {
  const service=new ModuleStandardsService(); service.onModuleInit();
  const writer=standardDirectiveCache.get('writing');
  const repair=standardDirectiveCache.get('refinement');
  expect(writer).toContain('避免把关键交流全部改为旁白');
  expect(writer).toContain('不为达比例捏造对话');
  expect(writer).toContain('中间局部改善');
  expect(writer).toContain('不得修改 Rule ID');
  expect(repair).toContain('字符预算与计费口径');
});


it('publishes generalization governance without leaking engineering instructions into prose', () => {
  const service=new ModuleStandardsService(); service.onModuleInit();
  const rule=service.getRule('GOV-004')!;
  expect(rule.summary).toContain('每项需求调整与问题修复');
  expect(rule.details!.join('')).toContain('已检查、已修复、未验证或不适用');
  expect(service.listRules().filter(r=>r.id==='GOV-004')).toHaveLength(1);
  expect(service.impact('GOV-003')!.dependents.map(r=>r.id)).toContain('GOV-004');
  expect(standardDirectiveCache.get('writing')).not.toContain(rule.summary);
});
