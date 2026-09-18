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

    expect(callModel).toHaveBeenCalledWith('deepseek-flash', '输出JSON对象', '', 0.4, 4096, 600_000, 'json_object', undefined);
    expect(response.content).toBe('{"ok":true}');
    expect(response.finishReason).toBe('stop');
  });

  it('rejects an empty structured response instead of passing it to the parser', async () => {
    const service = createService();
    (service as any).callModel = vi.fn().mockResolvedValue({ content: '   ', finishReason: 'stop' });

    await expect(service.generate({ prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object' }))
      .rejects.toThrow('模型返回空内容');
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

    expect(callModel).toHaveBeenCalledWith('deepseek-flash', '输出JSON对象', '', 0.4, 7200, 600_000, 'json_object', undefined);
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

    expect(callModel).toHaveBeenCalledWith('deepseek-flash', '生成正文', '', 0.4, 4096, 600_000, undefined, undefined);
  });

  it('rejects an empty plain-text (body generation) response instead of returning it empty', async () => {
    const service = createService();
    (service as any).callModel = vi.fn().mockResolvedValue({ content: '', finishReason: 'stop' });

    await expect(service.generate({ prompt: '生成正文', scenario: 'daily' }))
      .rejects.toThrow('模型返回空内容');
  });
});
