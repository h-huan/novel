/**
 * chain-engine.service.spec.ts - Chain Engine 单元测试
 * 测试 chain 编排引擎的核心功能
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChainEngineService, chapterSynthesisMaxTokens } from './chain-engine.service';
import { PromptRegistryService } from './prompt-registry.service';
import { QualityGateService } from './quality-gate.service';
import { RealLLMService } from './real-llm.service';

describe('ChainEngineService', () => {
  let service: ChainEngineService;
  let generate: ReturnType<typeof vi.fn>;

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
    generate = vi.fn().mockResolvedValue(mockLLMOutput);
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
          provide: RealLLMService,
          useValue: { generate },
        },
      ],
    }).compile();

    service = module.get<ChainEngineService>(ChainEngineService);
    // Vitest's metadata transform does not reliably preserve Nest constructor
    // parameter metadata here. Bind collaborators explicitly so these tests
    // execute the real engine paths instead of passing with undefined services.
    (service as any).promptRegistry = {
      render: vi.fn().mockReturnValue('rendered prompt'),
      getTemplate: vi.fn().mockReturnValue({ id: 'test-template', content: 'template {{test}}' }),
    };
    (service as any).qualityGate = {
      evaluateByRule: vi.fn().mockResolvedValue({ passed: true, score: 100, summary: 'pass', details: [] }),
      shouldRetry: vi.fn().mockReturnValue(false),
    };
    (service as any).llm = { generate };
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('chapter synthesis token budget', () => {
    it('keeps a 3200-4000 character chapter within a single-chapter output budget', () => {
      expect(chapterSynthesisMaxTokens(3200)).toBe(3800);
      expect(chapterSynthesisMaxTokens(3600)).toBe(4140);
      expect(chapterSynthesisMaxTokens(4000)).toBe(4600);
      expect(chapterSynthesisMaxTokens(4000)).toBeLessThan(6000);
    });
  });

  it('rewrites an overlong synthesis instead of accepting or truncating it', async () => {
    const firstDraft = '甲'.repeat(7138);
    const contractedDraft = '乙'.repeat(3600);
    generate
      .mockResolvedValueOnce({ content: firstDraft })
      .mockResolvedValueOnce({ content: contractedDraft });
    const node = {
      ...mockNode,
      id: 'node_9_chapter_synthesis',
      type: 'transform' as const,
      promptTemplateId: undefined,
    };
    const context = {
      chainId: 'tianlong-8step',
      variables: { chapterFunction: 'development', chapterNumber: 1, chapterOutline: '有效详细大纲'.repeat(20) },
      nodeOutputs: {}, retryCounters: {}, qualityGateFailures: {},
      startTime: new Date(), timestamps: {}, metadata: {},
    };
    const result = await (service as any).executeTransformNode(node, {
      goal: '目标', trigger: '诱因', action: '行动', obstacle: '阻碍',
      misjudge: '误判', reversal: '反转', cost: '代价', hook: '钩子',
      targetWords: 3600, chapterNumber: 1,
      chapterOutline: '有效详细大纲'.repeat(20), chapterContext: { confirmed: true },
    }, context);

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.fullText).toBe(contractedDraft);
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
