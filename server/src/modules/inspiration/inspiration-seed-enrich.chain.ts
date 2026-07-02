/**
 * 灵感种子智能补全 Prompt Chain 定义
 *
 * Chain ID: inspiration-seed-enrich
 * 4 个节点顺序执行：角色补全 → 世界观补全 → 组织生成 → 地点生成
 * 节点 3/4 通过 chain_output 引用节点 2 的世界观输出
 *
 * 设计文档: src/chain/docs/inspiration-seed-enrich-chain.md
 */
import type { PromptChain } from '../../chain/chain.types';

export const INSPIRATION_SEED_ENRICH_CHAIN: PromptChain = {
  id: 'inspiration-seed-enrich',
  name: '灵感种子智能补全',
  version: '1.2.0',
  description: '灵感转项目时自动丰富骨架种子实体（角色/世界观/组织/地点）',
  nodes: [
    {
      id: 'node_1_character',
      name: '角色深度补全',
      type: 'prompt',
      chainId: 'inspiration-seed-enrich',
      promptTemplateId: 'seed-character-enrich',
      modelConfig: { primary: 'deepseek', fallback: 'glm', temperature: 0.6, tier: 'economy' },
      inputMapping: {
        hook: 'user_input.hook',
        description: 'user_input.description',
        characters: 'user_input.characters',
      },
      outputMapping: {},
      timeout: 30,
      retryCount: 2,
      skipOnEmptyInput: true,
      description: '基于角色名+hook生成性格五维/背景/对话风格',
    },
    {
      id: 'node_2_worldview',
      name: '世界观补全',
      type: 'prompt',
      chainId: 'inspiration-seed-enrich',
      promptTemplateId: 'seed-worldview-enrich',
      modelConfig: { primary: 'deepseek', fallback: 'glm', temperature: 0.5, tier: 'economy' },
      inputMapping: {
        hook: 'user_input.hook',
        description: 'user_input.description',
        setting: 'user_input.setting',
      },
      outputMapping: {},
      timeout: 30,
      retryCount: 2,
      description: '基于setting+hook生成地理/历史/规则/势力格局',
    },
    {
      id: 'node_3_organization',
      name: '组织生成',
      type: 'prompt',
      chainId: 'inspiration-seed-enrich',
      promptTemplateId: 'seed-organization-gen',
      modelConfig: { primary: 'glm', fallback: 'deepseek', temperature: 0.6, tier: 'economy' },
      // worldview 通过模板内 chain_output.node_2_worldview 访问
      inputMapping: { hook: 'user_input.hook' },
      outputMapping: {},
      timeout: 20,
      retryCount: 1,
      description: '基于世界观生成2-3个主要势力',
    },
    {
      id: 'node_4_location',
      name: '地点生成',
      type: 'prompt',
      chainId: 'inspiration-seed-enrich',
      promptTemplateId: 'seed-location-gen',
      modelConfig: { primary: 'deepseek', fallback: 'glm', temperature: 0.6, tier: 'economy' },
      inputMapping: { isLong: 'user_input.isLong' },
      outputMapping: {},
      timeout: 30,
      retryCount: 2,
      description: '长篇按6层层级/短篇简化生成地点',
    },
  ],
  variables: [],
  executionMode: 'sequential',
  config: {
    timeout: 120,
    maxRetries: 2,
    enableLogging: true,
    enableQualityGate: false,
    strictMode: false, // 非严格模式：节点失败不中断，返回 partial 状态
  },
};
