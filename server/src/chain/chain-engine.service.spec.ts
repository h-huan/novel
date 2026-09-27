/**
 * chain-engine.service.spec.ts - Chain Engine 单元测试
 * 测试 chain 编排引擎的核心功能
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChainEngineService, chapterSynthesisMaxTokens } from './chain-engine.service';
import { PromptRegistryService } from './prompt-registry.service';
import { RealLLMService } from './real-llm.service';
import { GateRejectionError, classifyGateFailure, firstGateReportFromChain } from '../modules/writing-quality/gate-failure';

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
    modelConfig: { temperature: 0.5 },
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
    config: { timeout: 60, maxRetries: 2, enableLogging: false, strictMode: false },
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
    (service as any).llm = { generate };
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('chapter synthesis token budget', () => {
    it('keeps a 3000-5000 character chapter within a single-chapter output budget', () => {
      expect(chapterSynthesisMaxTokens(3000)).toBe(3600);
      expect(chapterSynthesisMaxTokens(3600)).toBe(4140);
      expect(chapterSynthesisMaxTokens(4000)).toBe(4600);
      expect(chapterSynthesisMaxTokens(5000)).toBe(5750);
      expect(chapterSynthesisMaxTokens(5000)).toBeLessThan(6000);
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
      chainId: 'body-by-outline',
      variables: { chapterFunction: 'development', chapterNumber: 1, chapterOutline: '有效详细大纲'.repeat(20) },
      nodeOutputs: {}, retryCounters: {},
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

    it('preserves the generation run id on the prompt node result', async () => {
      generate.mockResolvedValueOnce({ ...mockLLMOutput, runId: 'run-world-1' });

      const result = await service.execute(testChain, { test: 'hello', projectId: 'project-1' });

      expect(result.status).toBe('completed');
      expect(result.nodeResults).toHaveLength(1);
      expect(result.nodeResults[0].runId).toBe('run-world-1');
      expect(result.nodeResults[0].output).toEqual({ result: 'test output' });
    });
  });

  describe('executeNode', () => {
    it('should create execution context for a prompt node', async () => {
      const context = {
        chainId: 'test-chain',
        variables: { user_input: { test: 'hello' }, test: 'hello' },
        nodeOutputs: {},
        retryCounters: {},
        startTime: new Date(),
        timestamps: {},
        metadata: {},
      };
      const result = await service.executeNode(mockNode, context, testChain);
      expect(result.status).toBeDefined();
      expect(result.nodeId).toBe('test_node');
    });

    it('does not replay the same prompt when a node fails without corrective evidence', async () => {
      generate.mockRejectedValue(new Error('schema mismatch'));
      const context = {
        chainId: 'test-chain',
        variables: { user_input: { test: 'hello' }, test: 'hello' },
        nodeOutputs: {}, retryCounters: {},
        startTime: new Date(), timestamps: {}, metadata: {},
      };

      const result = await service.executeNode({ ...mockNode, retryCount: 5 }, context, testChain);

      expect(result.status).toBe('failed');
      expect(result.retryCount).toBe(0);
      expect(generate).toHaveBeenCalledTimes(1);
    });

    it('keeps the Gate rejection report on the failed node instead of flattening it to a string', async () => {
      // 回归：此前 Error 实例跨节点边界退化成 error 字符串，报告被吞掉，
      // 上游只能看到「缺少世界观 / volumes 为空」这类下游症状 ——
      // 用户按症状去改，改完仍然失败且报错一字不变（「同一个问题反反复复出现」的机制）。
      const report = classifyGateFailure({
        evaluationStatus: 'evaluated',
        topic: 'quality_gate',
        gateStatus: 'blocked',
        buckets: {
          missing_standard: ['创作宪法未设置平台：属未执行标准'],
          prose_hardline: ['platform.category_word_scale：目标总字数 12 万落在番茄男频·都市日常头部实测 46.2 万–719.0 万之外'],
        },
      });
      generate.mockRejectedValue(new GateRejectionError(report, '正文片段'));
      const context = {
        chainId: 'test-chain',
        variables: { user_input: { test: 'hello' }, test: 'hello' },
        nodeOutputs: {}, retryCounters: {},
        startTime: new Date(), timestamps: {}, metadata: {},
      };

      const result = await service.executeNode({ ...mockNode, retryCount: 0 }, context, testChain);

      expect(result.status).toBe('failed');
      expect(result.gateReport).toEqual(report);
      // 文案保留 Gate 语义，不再被改写成中性节点错误
      expect(result.error).toContain('质量 Gate blocked');
      expect(result.error).toContain('platform.category_word_scale');
      // 上层靠这个入口把真实成因提到下游症状之前
      expect(firstGateReportFromChain({ nodeResults: [result] })).toEqual(report);
    });
  });
});
