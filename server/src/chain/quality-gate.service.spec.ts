import { it, expect, vi } from 'vitest';
import { QualityGateService } from './quality-gate.service';
it('does not turn malformed, missing or zero judge scores into a passing fallback', async () => {
  const config = { criteria: [{ name: '逻辑', weight: 1, minScore: 60 }], threshold: 60 } as any;
  for (const content of ['invalid', '{}', '{"score":0,"reason":"逻辑错误"}']) {
    const service = new QualityGateService({ generate: vi.fn(async () => ({ content })) } as any);
    const result = await service.evaluateByLLM(config, '正文', 'n');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  }
});
it('blocks an empty rule gate even with a zero threshold', async () => {
  const service = new QualityGateService({} as any);
  expect((await service.evaluateByRule({ criteria: [], threshold: 0 } as any, {}, 'n')).passed).toBe(false);
});
