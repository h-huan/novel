export type SystemWorkflowRuleLevel = 'P0' | 'P1' | 'P2' | 'P3';
export type SystemWorkflowRuleStatus = 'active' | 'deprecated' | 'replaced';
export type SystemWorkflowRuleCategory =
  | 'governance'
  | 'authority'
  | 'architecture'
  | 'context'
  | 'generation'
  | 'quality'
  | 'repair'
  | 'workflow'
  | 'platform'
  | 'learning';

export type SystemWorkflowRuleConsumer =
  | 'prompt'
  | 'deterministic_gate'
  | 'semantic_gate'
  | 'repair'
  | 'retry'
  | 'persistence'
  | 'learning'
  | 'api'
  | 'ui'
  | 'test';

export interface SystemWorkflowRuleClause {
  id: string;
  label: string;
  text: string;
}

export interface SystemWorkflowRuleDirectives {
  generation?: string;
  review?: string;
  repair?: string;
  save?: string;
}

export interface SystemWorkflowRule {
  id: string;
  name: string;
  category: SystemWorkflowRuleCategory;
  level: SystemWorkflowRuleLevel;
  status: SystemWorkflowRuleStatus;
  summary: string;
  /** Stable detailed clauses belonging to this Rule ID; not independent rules. */
  details?: readonly string[];
  /** Structured sub-criteria owned by this Rule ID (for renderers/validators). */
  clauses?: readonly SystemWorkflowRuleClause[];
  /** Named public contract fragments owned by this Rule ID; callers may render but not redefine them. */
  contracts?: Readonly<Record<string, string>>;
  blocking: boolean;
  /** `*` means all standard scenes. */
  scenarios: readonly string[];
  consumers: readonly SystemWorkflowRuleConsumer[];
  evidencePolicy?: string;
  parameterRefs?: readonly string[];
  dependencies?: readonly string[];
  implementationRefs: readonly string[];
  testRefs?: readonly string[];
  directives?: SystemWorkflowRuleDirectives;
  replacedBy?: string;
}
