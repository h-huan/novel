import type { ChainNode, VariableDef } from './chain.types';

export interface ChainTemplate {
  id: string;
  name: string;
  version: string;
  description: string;
  nodes: ChainNode[];
  variables: VariableDef[];
  createdAt: string;
  updatedAt: string;
}
