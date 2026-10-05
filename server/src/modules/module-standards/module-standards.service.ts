/** Read-only projections of the System Workflow Rule Registry. */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { SEED_MODULE_STANDARDS } from './module-standards.seed';
import { standardDirectiveCache } from './standard-directive.cache';
import {
  SYSTEM_WORKFLOW_RULESET_VERSION,
  activeSystemWorkflowRules,
  getSystemWorkflowRule,
  systemWorkflowRuleDependents,
  systemWorkflowRuleDependencies,
} from './system-workflow-rules.registry';
import type { SystemWorkflowRule } from './system-workflow-rule.types';

@Injectable()
export class ModuleStandardsService implements OnModuleInit {
  onModuleInit(): void { this.loadToCache(); }

  loadToCache(): void {
    standardDirectiveCache.rebuild(activeSystemWorkflowRules());
  }

  private ruleView(rule: SystemWorkflowRule) {
    return {
      id: rule.id,
      name: rule.name,
      category: rule.category,
      level: rule.level,
      status: rule.status,
      blocking: rule.blocking,
      summary: rule.summary,
      details: [...(rule.details ?? [])],
      scenarios: [...rule.scenarios],
      consumers: [...rule.consumers],
      evidencePolicy: rule.evidencePolicy ?? null,
      parameterRefs: [...(rule.parameterRefs ?? [])],
      dependencies: [...(rule.dependencies ?? [])],
      dependents: systemWorkflowRuleDependents(rule.id).map((item) => item.id),
      implementationRefs: [...rule.implementationRefs],
      testRefs: [...(rule.testRefs ?? [])],
      directives: rule.directives ? structuredClone(rule.directives) : null,
      rulesetVersion: SYSTEM_WORKFLOW_RULESET_VERSION,
      source: 'system_workflow_rule_registry',
    };
  }

  listRules() {
    return [...activeSystemWorkflowRules()]
      .sort((a, b) => `${a.category}:${a.id}`.localeCompare(`${b.category}:${b.id}`))
      .map((item) => this.ruleView(item));
  }

  getRule(id: string) {
    const item = getSystemWorkflowRule(id);
    if (!item || item.status !== 'active') return null;
    return this.ruleView(item);
  }

  impact(id: string) {
    const item = getSystemWorkflowRule(id);
    if (!item) return null;
    return {
      rule: this.ruleView(item),
      dependencies: systemWorkflowRuleDependencies(id).map((rule) => this.ruleView(rule)),
      dependents: systemWorkflowRuleDependents(id).map((rule) => this.ruleView(rule)),
    };
  }

  /** Backward-compatible grouped view; groups are filters, never rule owners. */
  list() {
    return SEED_MODULE_STANDARDS.map((standard) => ({
      moduleKey: standard.module_key,
      moduleName: standard.module_name,
      category: standard.category,
      scenarios: [...standard.scenarios],
      businessTables: [...standard.business_tables],
      purpose: standard.purpose,
      steps: structuredClone(standard.steps),
      requirements: [...standard.requirements],
      rules: [...standard.rules],
      qualityBar: standard.quality_bar,
      inputs: [...standard.inputs],
      outputs: [...standard.outputs],
      version: SYSTEM_WORKFLOW_RULESET_VERSION,
      changeNote: `Registry 只读投影 v${SYSTEM_WORKFLOW_RULESET_VERSION}`,
      source: 'system_workflow_rule_registry',
      seedBaselineVersion: SYSTEM_WORKFLOW_RULESET_VERSION,
      updatedAt: null,
    }));
  }

  get(moduleKey: string) {
    return this.list().find((item) => item.moduleKey === moduleKey) ?? null;
  }

  status() {
    return {
      running: [],
      recent: [],
      modules: this.list().map((item) => ({
        moduleKey: item.moduleKey,
        moduleName: item.moduleName,
        category: item.category,
        version: item.version,
        running: false,
        dirty: false,
        reasons: [],
        lastSummarizedAt: null,
      })),
      ruleCount: activeSystemWorkflowRules().length,
      dirtyCount: 0,
      standardSource: 'system_workflow_rule_registry',
      rulesetVersion: SYSTEM_WORKFLOW_RULESET_VERSION,
      seedBaselineVersion: SYSTEM_WORKFLOW_RULESET_VERSION,
      cacheRebuiltAt: standardDirectiveCache.getRebuiltAt(),
    };
  }
}
