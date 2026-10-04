import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdempotentRealLLMService } from './idempotent-real-llm.service';
import { RealLLMService } from './real-llm.service';

const ideaRequest = () => ({
  prompt: '把已选 premise P1 结构化。JSON 结构（ideas 必须恰好 1 项）：{"ideas":[{"title":"标题"}]}',
  scenario: 'idea_generate' as const,
  responseFormat: 'json_object' as const,
});

const completeCard = {
  title: '替嫁后我握了盐引',
  hook: '新婚夜夫家被抄，她在嫁妆夹层发现盐引暗账。',
  description: '她必须在保住生母、查清暗账来源和避免夫家被定罪之间主动选择。',
  coreConflict: '夫家、娘家与盐运使都要她交出不同版本的账。',
  mainReversal: '暗账最终证明她一直认错了真正的利益同盟。',
};

function service() {
  const router = {} as any;
  const metrics = {} as any;
  const database = { getDb: () => { throw new Error('idea discovery must not read project DB'); } } as any;
  return new IdempotentRealLLMService(router, metrics, database);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IdempotentRealLLMService single idea-card shape recovery', () => {
  it('normalizes a complete naked card into the required one-item ideas envelope', async () => {
    const superGenerate = vi.spyOn(RealLLMService.prototype, 'generate').mockResolvedValue({
      content: JSON.stringify(completeCard),
      model: 'deepseek-flash',
      latency: 10,
      runId: 'raw-run-must-not-be-reused-after-client-normalization',
    } as any);

    const response = await service().generate(ideaRequest() as any);

    expect(superGenerate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(response.content)).toEqual({ ideas: [completeCard] });
    expect(response.finishReason).toContain('normalized_single_idea_card');
    expect(response.runId).toBeUndefined();
  });

  it('retries the exact same selected premise once when a successful call returns no card', async () => {
    const superGenerate = vi.spyOn(RealLLMService.prototype, 'generate')
      .mockResolvedValueOnce({ content: '{"ideas":[]}', model: 'deepseek-flash', latency: 10 } as any)
      .mockResolvedValueOnce({ content: JSON.stringify({ ideas: [completeCard] }), model: 'deepseek-flash', latency: 11 } as any);
    const request = ideaRequest();

    const response = await service().generate(request as any);

    expect(superGenerate).toHaveBeenCalledTimes(2);
    expect((superGenerate.mock.calls[0][0] as any).prompt).toBe(request.prompt);
    expect((superGenerate.mock.calls[1][0] as any).prompt).toBe(request.prompt);
    expect((superGenerate.mock.calls[1][0] as any).systemPrompt).toContain('不要换题、不要重选 premise');
    expect(JSON.parse(response.content)).toEqual({ ideas: [completeCard] });
  });

  it('fails closed after one same-premise shape retry instead of inventing or replacing a card', async () => {
    const superGenerate = vi.spyOn(RealLLMService.prototype, 'generate')
      .mockResolvedValueOnce({ content: '{"ideas":[]}', model: 'deepseek-flash', latency: 10 } as any)
      .mockResolvedValueOnce({ content: '{"ideas":[]}', model: 'deepseek-flash', latency: 11 } as any);

    const response = await service().generate(ideaRequest() as any);

    expect(superGenerate).toHaveBeenCalledTimes(2);
    expect(response.content).toBe('{"ideas":[]}');
  });

  it('does not apply the recovery protocol to unrelated json_object calls', async () => {
    const superGenerate = vi.spyOn(RealLLMService.prototype, 'generate').mockResolvedValue({
      content: '{"ideas":[]}', model: 'deepseek-flash', latency: 10,
    } as any);

    const response = await service().generate({
      prompt: '生成普通 JSON',
      scenario: 'idea_generate',
      responseFormat: 'json_object',
    } as any);

    expect(superGenerate).toHaveBeenCalledTimes(1);
    expect(response.content).toBe('{"ideas":[]}');
  });
});
