/**
 * chain-engine.service.spec.ts - Chain Engine 单元测试
 * 测试 chain 编排引擎的核心功能
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChainEngineService } from './chain-engine.service';
import { PromptRegistryService } from './prompt-registry.service';
import { QualityGateService } from './quality-gate.service';
import { MockLLMService } from './mock-llm.service';

describe('ChainEngineService', () => {
  let service: ChainEngineService;

  const mockLLMOutput = { content: JSON.stringify({ result: 'test output' }), model: 'deepseek', latency: 100 };

  const mockNode = {
    id: 'test_node',
    name: '测试节点',
    type: 'prompt' as const,
    chainId: 'test-chain',
    promptTemplateId: 'test-template',
    modelConfig: { primary: 'deepseek', temperature: 0.5, tier: 'economy' as const },
    inputMapping: { test: 'user_input.test' },
    outputMapping: { result: 'test_node.result' },
    timeout: 30,
    retryCount: 1,
    description: '测试节点',
  };

  const testChain = {
    id: 'test-chain',
    name: '测试Chain',
    version: '1.0.0',
    description: '用于单元测试的Chain',
    nodes: [mockNode],
    variables: [],
    executionMode: 'sequential' as const,
    config: { timeout: 60, maxRetries: 2, enableLogging: false, enableQualityGate: false, strictMode: false },
  };

  beforeEach(async () => {
    const { Test, TestingModule } = await import('@nestjs/testing');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChainEngineService,
        {
          provide: PromptRegistryService,
          useValue: {
            render: vi.fn().mockReturnValue('rendered prompt'),
            getTemplate: vi.fn().mockReturnValue({ id: 'test-template', content: 'template {{test}}' }),
          },
        },
        {
          provide: QualityGateService,
          useValue: {
            evaluateByRule: vi.fn().mockResolvedValue({ passed: true, score: 100, summary: 'pass', details: [] }),
            shouldRetry: vi.fn().mockReturnValue(false),
          },
        },
        {
          provide: MockLLMService,
          useValue: { generate: vi.fn().mockResolvedValue(mockLLMOutput) },
        },
      ],
    }).compile();

    service = module.get<ChainEngineService>(ChainEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute', () => {
    it('should handle empty chains gracefully', async () => {
      const emptyChain = { ...testChain, nodes: [] };
      const result = await service.execute(emptyChain, {});
      expect(result.status).toBe('completed');
      expect(result.chainId).toBe('test-chain');
    });

    it('should return a result for a chain with nodes', async () => {
      const result = await service.execute(testChain, { test: 'hello' });
      expect(result.chainId).toBe('test-chain');
      expect(result.status).toBeDefined();
      expect(result.nodeResults).toBeDefined();
      expect(result.totalLatency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('executeNode', () => {
    it('should create execution context for a prompt node', async () => {
      const context = {
        chainId: 'test-chain',
        variables: { user_input: { test: 'hello' }, test: 'hello' },
        nodeOutputs: {},
        retryCounters: {},
        qualityGateFailures: {},
        startTime: new Date(),
        timestamps: {},
        metadata: {},
      };
      const result = await service.executeNode(mockNode, context, testChain);
      expect(result.status).toBeDefined();
      expect(result.nodeId).toBe('test_node');
    });
  });
});
