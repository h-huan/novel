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

  it('fails cleanly when the network-retry expansion is still empty', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ content: '', finishReason: 'length' })
      .mockResolvedValueOnce({ content: '', finishReason: 'length' });
    (service as any).callModel = callModel;

    await expect(service.generate({ prompt: '生成正文', scenario: 'daily', maxEmptyRetries: 1 }))
      .rejects.toThrow('模型返回空内容');
  });
});
