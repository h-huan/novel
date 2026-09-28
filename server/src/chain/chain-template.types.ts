import type { ChainConfig, ChainNode, ExecutionMode, VariableDef } from './chain.types';

export interface ChainTemplate {
  id: string;
  name: string;
  version: string;
  description: string;
  nodes: ChainNode[];
  variables: VariableDef[];
  executionMode: ExecutionMode;
  config: ChainConfig;
  createdAt: string;
  updatedAt: string;
}
