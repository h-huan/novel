import { describe, expect, it, vi } from 'vitest';
import { RealLLMService } from './real-llm.service';

const createService = () => {
  const router = {
    getConfig: () => ({ defaults: { maxTokens: 4096 }, scenarios: { outline: { maxTokens: 4096 } } }),
    getModelForScenario: () => ({ modelName: 'deepseek-flash', modelVersion: 'deepseek-flash', temperature: 0.4 }),
  };
  return new RealLLMService(router as any);
};

describe('RealLLMService structured output guard', () => {
  it('forwards json_object mode to the provider call', async () => {
    const service = createService();
    const callModel = vi.fn().mockResolvedValue({ content: '{"ok":true}', finishReason: 'stop' });
    (service as any).callModel = callModel;

    const response = await service.generate({ prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object' });

    expect(callModel).toHaveBeenCalledWith(
      'deepseek-flash', '输出JSON对象', expect.stringContaining('执行前置规则'),
      0.4, 4096, 600_000, 'json_object', undefined,
    );
    expect(response.content).toBe('{"ok":true}');
    expect(response.finishReason).toBe('stop');
  });

  it('rejects an empty structured response instead of passing it to the parser', async () => {
    const service = createService();
    const callModel = vi.fn().mockResolvedValue({ content: '   ', finishReason: 'stop' });
    (service as any).callModel = callModel;

    await expect(service.generate({ prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object' }))
      .rejects.toThrow('模型返回空内容');
    // 三次物理调用：同配置补发两次仍空，最后一次关闭思考补发（执行标准「模型空内容三档恢复」）
    expect(callModel).toHaveBeenCalledTimes(3);
    expect(callModel.mock.calls.map(call => call[8])).toEqual([undefined, undefined, true]);
  });

  it('rejects a length-truncated structured response for a clean retry', async () => {
    const service = createService();
    (service as any).callModel = vi.fn().mockResolvedValue({ content: '{"partial":', finishReason: 'length' });

    await expect(service.generate({ prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object' }))
      .rejects.toThrow('结构化生成因输出长度被截断');
  });

  it('recovers a single-chapter JSON truncation at the ceiling without changing model, prompt or contract', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockResolvedValueOnce({ content: '{"title":"半截', finishReason: 'length' })
      .mockResolvedValueOnce({ content: '{"title":"完整章纲"}', finishReason: 'stop' });
    (service as any).callModel = callModel;

    const response = await service.generate({
      prompt: '完整单章合同', scenario: 'outline', responseFormat: 'json_object',
      maxTokens: 32768, metrics: { stepKey: 'creation_chapter_detail', projectId: 'test-project' },
    });

    expect(response.content).toBe('{"title":"完整章纲"}');
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[0].slice(0, 7)).toEqual(callModel.mock.calls[1].slice(0, 7));
    expect(callModel.mock.calls[1][8]).toBe(true);
  });

  it('expands an empty length-truncated response before treating it as a generic empty response', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockResolvedValueOnce({ content: '', finishReason: 'length' })
      .mockResolvedValueOnce({ content: '{"ideas":[]}', finishReason: 'stop' });
    (service as any).callModel = callModel;

    const response = await service.generate({
      prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object', maxEmptyRetries: 1,
    });

    expect(response.content).toBe('{"ideas":[]}');
    expect(callModel.mock.calls[0][4]).toBe(4096);
    expect(callModel.mock.calls[1][4]).toBe(8192);
  });

  it('honors a caller-provided output budget instead of replacing it with the scenario default', async () => {
    const service = createService();
    const callModel = vi.fn().mockResolvedValue({ content: '{"foreshadowings":[]}', finishReason: 'stop' });
    (service as any).callModel = callModel;

    await service.generate({
      prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object', maxTokens: 7200,
    });

    expect(callModel).toHaveBeenCalledWith(
      'deepseek-flash', '输出JSON对象', expect.stringContaining('执行前置规则'),
      0.4, 7200, 600_000, 'json_object', undefined,
    );
  });

  it('keeps the expanded budget and explicit temperature during a network retry', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ content: '{"ok":true}', finishReason: 'stop' });
    (service as any).callModel = callModel;

    const response = await service.generate({
      prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object',
      maxTokens: 32768, temperature: 0,
    });

    expect(response.content).toBe('{"ok":true}');
    expect(callModel.mock.calls[1][3]).toBe(0);
    expect(callModel.mock.calls[1][4]).toBe(32768);
  }, 10_000);

  it('retries a disconnected empty-output recovery with the same thinking mode', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockResolvedValueOnce({ content: '', finishReason: 'length' })
      .mockRejectedValueOnce(new Error('UND_ERR_SOCKET: other side closed'))
      .mockResolvedValueOnce({ content: '完整正文', finishReason: 'stop' });
    (service as any).callModel = callModel;

    const response = await service.generate({ prompt: '生成正文', scenario: 'writing_climax', maxTokens: 32768 });

    expect(response.content).toBe('完整正文');
    expect(callModel).toHaveBeenCalledTimes(3);
    expect(callModel.mock.calls.map(call => call[8])).toEqual([undefined, true, true]);
    expect(callModel.mock.calls[2].slice(0, 8)).toEqual(callModel.mock.calls[1].slice(0, 8));
  }, 10_000);

  it('gives a neutral retry action for a closed socket', () => {
    const service = createService();
    const diagnosis = (service as any).describeNetworkError({
      message: 'Connection error', cause: { code: 'UND_ERR_SOCKET', message: 'other side closed' },
    });
    expect(diagnosis.guidance).toContain('重试当前操作');
    expect(diagnosis.guidance).not.toContain('项目看板');
  });

  it('does not silently lower the configured model reasoning level', async () => {
    const service = createService();
    const callModel = vi.fn().mockResolvedValue({ content: '正文...', finishReason: 'stop' });
    (service as any).callModel = callModel;

    await service.generate({ prompt: '生成正文', scenario: 'daily' });

    expect(callModel).toHaveBeenCalledWith(
      'deepseek-flash', '生成正文', expect.stringContaining('执行前置规则'),
      0.4, 4096, 600_000, undefined, undefined,
    );
  });

  it('rejects an empty plain-text (body generation) response instead of returning it empty', async () => {
    const service = createService();
    const callModel = vi.fn().mockResolvedValue({ content: '', finishReason: 'stop' });
    (service as any).callModel = callModel;

    await expect(service.generate({ prompt: '生成正文', scenario: 'daily' }))
      .rejects.toThrow('模型返回空内容');
    // 三次物理调用：同配置补发两次仍空，最后一次关闭思考补发（执行标准「模型空内容三档恢复」）
    expect(callModel).toHaveBeenCalledTimes(3);
    expect(callModel.mock.calls.map(call => call[8])).toEqual([undefined, undefined, true]);
  });

  it('keeps temperature stable when an empty response is补发', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockResolvedValueOnce({ content: '', finishReason: 'stop' })
      .mockResolvedValueOnce({ content: '{"ok":true}', finishReason: 'stop' });
    (service as any).callModel = callModel;

    await service.generate({ prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object', temperature: 0.2 });

    expect(callModel.mock.calls.map(call => call[3])).toEqual([0.2, 0.2]);
  });

  it('expands an empty length-truncated response inside the network-retry branch (regression: 空内容+length 在重试分支直接判死)', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockRejectedValueOnce(new Error('Connection error: other side closed'))
      .mockResolvedValueOnce({ content: '', finishReason: 'length' })
      .mockResolvedValueOnce({ content: '正文内容...', finishReason: 'stop' });
    (service as any).callModel = callModel;

    const response = await service.generate({
      prompt: '生成正文', scenario: 'daily', maxEmptyRetries: 1,
    });

    expect(response.content).toBe('正文内容...');
    // 三次调用：网络失败 → 空+length（应扩容）→ 扩容后成功
    expect(callModel).toHaveBeenCalledTimes(3);
    expect(callModel.mock.calls[1][4]).toBe(4096);
    expect(callModel.mock.calls[2][4]).toBe(8192);
  });

  // ⚠️ 口径变更（防复发）：网络重试分支过去遇到 "空内容+length" 只补发一轮，
  // 与主循环"翻倍到硬顶"的口径不一致，还会把截断误报成"模型返回空内容"。
  // 现在与主循环共用同一个扩容口径（nextExpandedMaxTokens），一直翻倍到硬顶，
  // 仍不足才以【结构化截断】失败 —— 调用方据此判定"该缩小单批规模"，而不是当成模型故障重试。
  it('keeps expanding to the ceiling in the network-retry branch, then fails as 结构化截断', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue({ content: '', finishReason: 'length' });
    (service as any).callModel = callModel;

    await expect(service.generate({ prompt: '生成正文', scenario: 'daily', maxEmptyRetries: 1 }))
      .rejects.toThrow('结构化生成因输出长度被截断');
    // 末次物理调用必须已经用满硬顶，而不是停在第一档扩容就判死
    const budgets = callModel.mock.calls.map(call => call[4] as number);
    expect(Math.max(...budgets)).toBe(32768);
  });

  // ⚠️ 回归测试（防复发）：截断扩容与"空内容重试"必须是两个独立预算。
  // 历史缺陷：扩容条件写作 `attempt < maxEmptyRetries`，于是 maxEmptyRetries=1 时
  // 只允许"一轮"扩容——配置 4096 的调用点最多扩到 8192 就被判定"已扩容仍不足"。
  it('does not let the empty-response retry budget cap truncation expansion (regression)', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockResolvedValueOnce({ content: '{"partial":', finishReason: 'length' })
      .mockResolvedValueOnce({ content: '{"partial":', finishReason: 'length' })
      .mockResolvedValueOnce({ content: '{"ok":true}', finishReason: 'stop' });
    (service as any).callModel = callModel;

    const response = await service.generate({
      prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object',
      maxTokens: 4096, maxEmptyRetries: 1,
    });

    expect(response.content).toBe('{"ok":true}');
    expect(callModel.mock.calls.map(call => call[4])).toEqual([4096, 8192, 16384]);
  });
});
