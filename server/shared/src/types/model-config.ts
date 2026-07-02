export type ModelProvider = 'openai' | 'anthropic' | 'deepseek' | 'zhipu' | 'moonshot' | 'doubao' | 'qwen' | 'custom';
export type ModelRole = 'writer' | 'reviewer' | 'planner' | 'creative' | 'cost_optimized';

export interface ModelConfig {
  writerModel: string;
  reviewerModel?: string;
  plannerModel?: string;
  temperature: number;
  topP?: number;
  maxTokens?: number;
  estimatedCost?: number;
  cost: number;
}

export interface ModelSpec {
  id: string;
  name: string;
  provider: ModelProvider;
  role: ModelRole;
  maxTokens: number;
  costPer1KTokens: number;
  features: string[];
}

export interface ApiKeyConfig {
  provider: ModelProvider;
  key: string;
  baseUrl?: string;
  quota?: number;
  used: number;
}

export interface RoutingRule {
  id: string;
  scene: string;
  priority: number;
  modelIds: string[];
  conditions?: Record<string, unknown>;
}

export interface RoutingDecision {
  scene: string;
  selectedModel: string;
  reasoning: string;
  confidence: number;
}
