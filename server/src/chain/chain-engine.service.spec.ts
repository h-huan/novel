/**
 * chain-engine.service.spec.ts - Chain Engine 单元测试
 * 测试 chain 编排引擎的核心功能
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChainEngineService } from './chain-engine.service';
import { ChainTemplateService } from './chain-template.service';
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
    description: '测试节点',
  };

  const testChain = {
    id: 'test-chain',
    name: '测试Chain',
    version: '1.0.0',
    description: '用于单元测试的Chain',
    nodes: [mockNode],
    variables: [],
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

  it.each(['blocked', 'not_evaluated'] as const)('stops downstream calls after an upstream quality %s', async (gateStatus) => {
    const report = classifyGateFailure({ evaluationStatus: 'evaluated', topic: 'quality_gate', gateStatus,
      buckets: gateStatus === 'blocked' ? { prose_hardline: ['当前卷纲违反已确认事实'] } : { review_incomplete: ['当前卷纲评审缺少可核对依据'] } });
    generate.mockRejectedValueOnce(new GateRejectionError(report, '未通过卷纲')).mockResolvedValue(mockLLMOutput);
    const result = await service.execute({ ...testChain, nodes: [mockNode, { ...mockNode, id: 'downstream' }] }, { test: 'hello' });
    expect(result.status).toBe('failed');
    expect(result.nodeResults).toHaveLength(1);
    expect(firstGateReportFromChain(result)).toEqual(report);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('stops the next production node after any missing upstream model result', async () => {
    generate.mockRejectedValueOnce(new Error('上游调用失败')).mockResolvedValue(mockLLMOutput);
    const result = await service.execute({ ...testChain, nodes: [mockNode, { ...mockNode, id: 'downstream' }] }, { test: 'hello' });
    expect(result.status).toBe('failed');
    expect(result.nodeResults).toHaveLength(1);
    expect(result.errors[0].message).toContain('上游调用失败');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('fixed production chains contain only current long-outline prompt nodes, not legacy body synthesis', () => {
    const registry = new ChainTemplateService(service);
    for (const id of ['long-novel-init-foundation', 'long-novel-flexible-outline']) {
      const production = registry.getDetail(id);
      expect(production.nodes.length).toBeGreaterThan(0);
      expect(production.nodes.every(node => node.type === 'prompt')).toBe(true);
      expect(production.nodes.every(node => !!node.promptTemplateId)).toBe(true);
    }
  });

  it('does not call a downstream node when a fixed long-outline prerequisite fails', async () => {
    const registry = new ChainTemplateService(service);
    const production = registry.getDetail('long-novel-flexible-outline');
    generate.mockRejectedValueOnce(new Error('前序关键节点无有效模型结果')).mockResolvedValue(mockLLMOutput);
    const result = await service.execute({
      ...production, nodes: [mockNode, { ...mockNode, id: 'downstream' }],
    }, { test: 'hello' });
    expect(result.status).toBe('failed');
    expect(result.nodeResults).toHaveLength(1);
    expect(generate).toHaveBeenCalledTimes(1);
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
        startTime: new Date(),
        timestamps: {},
        metadata: {},
      };
      const result = await service.executeNode(mockNode, context, testChain);
      expect(result.status).toBeDefined();
      expect(result.nodeId).toBe('test_node');
    });

    it('makes one LLM attempt for a failed fixed production node', async () => {
      generate.mockRejectedValue(new Error('schema mismatch'));
      const context = {
        chainId: 'test-chain',
        variables: { user_input: { test: 'hello' }, test: 'hello' },
        nodeOutputs: {},
        startTime: new Date(), timestamps: {},
      };

      const result = await service.executeNode(mockNode, context, testChain);

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
        nodeOutputs: {},
        startTime: new Date(), timestamps: {},
      };

      const result = await service.executeNode(mockNode, context, testChain);

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
