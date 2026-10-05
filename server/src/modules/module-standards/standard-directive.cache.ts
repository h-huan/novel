/**
 * Runtime prompt projection of the public System Workflow Rule Registry.
 * The cache never owns public rule text or thresholds; it only selects active rules
 * for a scene and renders their registry directives.
 */
import { createHash } from 'node:crypto';
import { standardScene } from '../../routing/scenario-taxonomy';
import {
  SYSTEM_WORKFLOW_RULESET_VERSION,
  activeSystemWorkflowRules,
} from './system-workflow-rules.registry';
import type { SystemWorkflowRule } from './system-workflow-rule.types';

class StandardDirectiveCacheClass {
  private rebuiltAt = 0;
  private rules: SystemWorkflowRule[] = [];

  rebuild(rules: readonly SystemWorkflowRule[] = activeSystemWorkflowRules()): void {
    this.rules = structuredClone([...rules]);
    this.rebuiltAt = Date.now();
  }

  private format(rule: SystemWorkflowRule, scene: string): string {
    const lines = [`【系统规则 ${rule.id} · ${rule.level} · ${rule.name}】${rule.summary}`];
    for (const detail of rule.details ?? []) lines.push(`- ${detail}`);
    const directives = rule.directives;
    if (directives) {
      if (['review'].includes(scene) && directives.review) lines.push(`评审：${directives.review}`);
      else if (['polish'].includes(scene) && directives.repair) lines.push(`修复：${directives.repair}`);
      else if (directives.generation) lines.push(`生成：${directives.generation}`);
      if (directives.save && ['writing', 'polish', 'review'].includes(scene)) lines.push(`保存：${directives.save}`);
    }
    if (rule.evidencePolicy && ['review', 'polish'].includes(scene)) lines.push(`证据：${rule.evidencePolicy}`);
    return lines.join('\n');
  }

  private rulesFor(scenario?: string | null, stepKey?: string | null): SystemWorkflowRule[] {
    const scene = standardScene(scenario, stepKey);
    return this.rules.filter((rule) =>
      rule.status === 'active'
      && rule.consumers.includes('prompt')
      && (rule.scenarios.includes('*') || rule.scenarios.includes(scene)),
    );
  }

  get(scenario?: string | null, stepKey?: string | null): string {
    const scene = standardScene(scenario, stepKey);
    return this.rulesFor(scenario, stepKey).map((rule) => this.format(rule, scene)).join('\n\n');
  }

  getRebuiltAt(): number { return this.rebuiltAt; }
  getRulesetVersion(): number { return SYSTEM_WORKFLOW_RULESET_VERSION; }
  getRulesetDigest(): string {
    const canonical = this.rules
      .filter((rule) => rule.status === 'active')
      .map((rule) => ({
        id: rule.id, level: rule.level, blocking: rule.blocking, scenarios: [...rule.scenarios],
        summary: rule.summary, details: [...(rule.details ?? [])], evidencePolicy: rule.evidencePolicy ?? null,
        parameterRefs: [...(rule.parameterRefs ?? [])], dependencies: [...(rule.dependencies ?? [])],
        directives: rule.directives ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  snapshot(scenario: string, enabled = true, stepKey?: string | null) {
    const selected = enabled ? this.rulesFor(scenario, stepKey) : [];
    const directive = enabled ? this.get(scenario, stepKey) : '';
    return {
      enabled,
      available: !!directive,
      rulesetVersion: SYSTEM_WORKFLOW_RULESET_VERSION,
      registryDigest: this.getRulesetDigest(),
      digest: createHash('sha256')
        .update(`${SYSTEM_WORKFLOW_RULESET_VERSION}\n${directive}`)
        .digest('hex'),
      ruleIds: selected.map((rule) => rule.id),
      modules: selected.map((rule) => ({
        key: rule.id,
        version: SYSTEM_WORKFLOW_RULESET_VERSION,
        baseline: SYSTEM_WORKFLOW_RULESET_VERSION,
      })),
    };
  }

  clear(): void {
    this.rules = [];
    this.rebuiltAt = 0;
  }
}

export const standardDirectiveCache = new StandardDirectiveCacheClass();
