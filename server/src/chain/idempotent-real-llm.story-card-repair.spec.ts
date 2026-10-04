import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdempotentRealLLMService } from './idempotent-real-llm.service';
import { RealLLMService } from './real-llm.service';

const auditedCard = {
  coreConflict: '沈青简必须在誊清屠城记录前，用馆规允许的校勘程序找出被移花接木的证据。',
  protagonistDesire: '保住旧臣家眷并查清父亲留下的屠城记录。',
  turningPoint: '她补齐墨迹、纸料、驿传日期三证后具名递交校勘签。',
  reveal: '草稿并非监修官伪造。',
  ending: '她保住史笔，但失去复国阵营。',
  scenes: [
    { goal: '调阅旧档', conflict: '先只有墨迹疑点', outcome: '只申请调档，尚未触发暂缓誊清' },
    { goal: '补齐证据', conflict: '纸料与驿传日期被分开保管', outcome: '取得三证' },
    { goal: '开堂验籍', conflict: '身份被质疑', outcome: '两名在册馆臣具名指认后开堂验籍' },
  ],
};

function service() {
  const router = {} as any;
  const metrics = {} as any;
  const db = { prepare: () => ({ get: () => undefined }) };
  return new IdempotentRealLLMService(router, metrics, { getDb: () => db } as any);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IdempotentRealLLMService story-card audit/repair continuity', () => {
  it('feeds the exact audited candidate back into the following repair and requires local changes only', async () => {
    const superGenerate = vi.spyOn(RealLLMService.prototype, 'generate')
      .mockResolvedValueOnce({ content: '{"consistent":false,"contradictions":["CR-2"]}', model: 'deepseek-flash', latency: 10 } as any)
      .mockResolvedValueOnce({ content: JSON.stringify(auditedCard), model: 'deepseek-flash', latency: 11 } as any);
    const instance = service();

    await instance.generate({
      prompt: `只核对故事卡是否忠实于已确认题材并遵守已确认世界规则，不评价文风。\n【候选故事卡】${JSON.stringify(auditedCard)}\n检查人物姓名、身份、关系与结局。`,
      scenario: 'review',
      responseFormat: 'json_object',
      metrics: { projectId: 'project-a', stepKey: 'story_card_audit' },
    } as any);

    await instance.generate({
      prompt: '重新生成故事卡，完全丢弃候选卡中的错误机制，只能使用已确认题材与世界规则。\n【禁止出现的错误】CR-2：场景3人数要件不完整。',
      scenario: 'outline',
      responseFormat: 'json_object',
      metrics: { projectId: 'project-a', stepKey: 'story_card_repair' },
    } as any);

    expect(superGenerate).toHaveBeenCalledTimes(2);
    const repairPrompt = String((superGenerate.mock.calls[1][0] as any).prompt);
    expect(repairPrompt).toContain('【当前候选故事卡（唯一修复底稿）】');
    expect(repairPrompt).toContain('只申请调档，尚未触发暂缓誊清');
    expect(repairPrompt).toContain('两名在册馆臣具名指认后开堂验籍');
    expect(repairPrompt).toContain('只修改【禁止出现的错误】逐条点名的 scene/字段及其直接依赖');
    expect(repairPrompt).toContain('人数、数量、并列证据、前置动作、时点和触发条件必须完整');
  });

  it('does not borrow a candidate from another project', async () => {
    const superGenerate = vi.spyOn(RealLLMService.prototype, 'generate')
      .mockResolvedValueOnce({ content: '{"consistent":false,"contradictions":["CR-2"]}', model: 'deepseek-flash', latency: 10 } as any)
      .mockResolvedValueOnce({ content: '{}', model: 'deepseek-flash', latency: 11 } as any);
    const instance = service();

    await instance.generate({
      prompt: `只核对故事卡是否忠实于已确认题材并遵守已确认世界规则，不评价文风。\n【候选故事卡】${JSON.stringify(auditedCard)}\n检查人物姓名。`,
      scenario: 'review',
      responseFormat: 'json_object',
      metrics: { projectId: 'project-a', stepKey: 'story_card_audit' },
    } as any);

    const originalRepairPrompt = '重新生成故事卡，完全丢弃候选卡中的错误机制，只能使用已确认题材与世界规则。\n【禁止出现的错误】CR-2。';
    await instance.generate({
      prompt: originalRepairPrompt,
      scenario: 'outline',
      responseFormat: 'json_object',
      metrics: { projectId: 'project-b', stepKey: 'story_card_repair' },
    } as any);

    expect(String((superGenerate.mock.calls[1][0] as any).prompt)).toBe(originalRepairPrompt);
  });
});
