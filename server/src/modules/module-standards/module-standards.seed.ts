/**
 * Backward-compatible module view generated from the System Workflow Rule Registry.
 * This file MUST NOT define public rule prose or thresholds of its own.
 */
import { buildCanonPolicyDirective } from '../canon/canon-policy';
import {
  SYSTEM_WORKFLOW_RULESET_VERSION,
  activeSystemWorkflowRules,
  getSystemWorkflowRule,
} from './system-workflow-rules.registry';
import type { SystemWorkflowRuleCategory } from './system-workflow-rule.types';

export const SEED_BASELINE_VERSION = SYSTEM_WORKFLOW_RULESET_VERSION;

export const CHAPTER_COORDINATE_CONTRACT = getSystemWorkflowRule('ARCH-003')?.summary
  ?? '章节坐标规则缺失；必须阻断并修复 Registry。';

/** Canon detail renderer remains an implementation; AUTH-002 owns the public rule semantics. */
export const STORY_FACT_PRIORITY = buildCanonPolicyDirective();

export interface SeedModuleStandard {
  module_key: string;
  module_name: string;
  category: 'creation' | 'quality' | 'crosscut';
  scenarios: string[];
  business_tables: string[];
  purpose: string;
  steps: Array<{ name: string; goal: string }>;
  requirements: string[];
  rules: string[];
  quality_bar: string;
  inputs: string[];
  outputs: string[];
}

const CATEGORY_VIEW: Record<SystemWorkflowRuleCategory, {
  key: string;
  name: string;
  legacyCategory: SeedModuleStandard['category'];
}> = {
  governance: { key: 'rule_governance', name: '规则治理', legacyCategory: 'crosscut' },
  authority: { key: 'story_authority', name: '事实权威', legacyCategory: 'crosscut' },
  architecture: { key: 'story_architecture', name: '小说架构', legacyCategory: 'creation' },
  context: { key: 'context_continuity', name: '上下文与连续性', legacyCategory: 'crosscut' },
  generation: { key: 'generation', name: '生成规则', legacyCategory: 'creation' },
  quality: { key: 'quality_loop', name: '质量 Gate', legacyCategory: 'quality' },
  repair: { key: 'repair', name: '修复规则', legacyCategory: 'quality' },
  workflow: { key: 'workflow', name: '工作流与保存', legacyCategory: 'crosscut' },
  platform: { key: 'platform', name: '平台参数', legacyCategory: 'quality' },
  learning: { key: 'learning', name: '历史经验与策略学习', legacyCategory: 'crosscut' },
};

export function buildSeedModuleStandardsFromRegistry(): SeedModuleStandard[] {
  return (Object.keys(CATEGORY_VIEW) as SystemWorkflowRuleCategory[]).map((category) => {
    const view = CATEGORY_VIEW[category];
    const rules = activeSystemWorkflowRules().filter((item) => item.category === category);
    const scenarios = [...new Set(rules.flatMap((item) => [...item.scenarios]))];
    return {
      module_key: view.key,
      module_name: view.name,
      category: view.legacyCategory,
      scenarios,
      business_tables: [],
      purpose: `QUALITY_EXECUTION.md 中 ${view.name} 类公共规则的只读投影；规则所有权属于 Rule ID，不属于本模块。`,
      steps: [],
      requirements: rules.filter((item) => item.level === 'P0' || item.level === 'P1')
        .map((item) => `[${item.id} · ${item.level}] ${item.summary}`),
      rules: rules.flatMap((item) => [
        `[${item.id} · ${item.level}] ${item.summary}`,
        ...(item.details ?? []).map((detail) => `[${item.id}] ${detail}`),
      ]),
      quality_bar: '只展示 Registry active 规则；模块/场景不是规则所有者。',
      inputs: ['SystemWorkflowRuleRegistry'],
      outputs: ['只读规则视图'],
    };
  });
}

export const SEED_MODULE_STANDARDS: SeedModuleStandard[] = buildSeedModuleStandardsFromRegistry();
