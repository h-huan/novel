import { describe, expect, it, vi } from 'vitest';
import { ChainController } from './chain.controller';
import type { HardlineFinding } from './hardline-scanner';

describe('正文硬红线段落级精修输入', () => {
  it('只提交有逐字证据的有限段落，不再附整章和整份规则说明', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.resolveHardlineProfile = () => ({ platform: 'fanqie', storyType: 'short_story' });
    controller.detectGlobalFactContradictions = () => [];
    controller.buildExecutionStandardTags = () => '平台：番茄；分类：悬疑';
    controller.logger = { warn: vi.fn() };
    const generate = vi.fn(async (_request: any) => { throw new Error('mock: no model call'); });
    controller.realLLM = { generate };

    const hit = Array.from({ length: 9 }, (_, i) => `第${i + 1}处命中段落，门背后留下不同的手印与编号。`);
    const untouched = '这是一段未命中的正常正文，人物完成了对应章节的实际行动。';
    const content = [...hit, untouched].join('\n\n');
    const findings: HardlineFinding[] = hit.map((p, i) => ({
      ruleId: '35', message: `第${i + 1}处标点单一`, position: `第 ${i + 1} 段`,
      snippet: p, paragraphs: [p], paragraphIndices: [i],
    }));
    const result = await controller.repairHardlineFindingsLocally({
      projectId: 'test-project', chapterIndex: 1, content, findings, attempt: 1,
    });
    expect(result).toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
    const prompt = generate.mock.calls[0][0].prompt as string;
    expect(prompt).toContain(hit[0]);
    expect(prompt).toContain(hit[5]);
    expect(prompt).not.toContain(hit[6]);
    expect(prompt).not.toContain(untouched);
    expect(prompt).not.toContain('【全文正文');
    expect(prompt).not.toContain('修正规则（针对每条违规类型');
  });

  it('同轮多规则时不让前两条占满锚点，仍覆盖对话和残句证据', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.resolveHardlineProfile = () => ({ platform: 'fanqie', storyType: 'short_story' });
    controller.detectGlobalFactContradictions = () => [];
    controller.buildExecutionStandardTags = () => '';
    controller.logger = { warn: vi.fn() };
    const generate = vi.fn(async (_request: any) => { throw new Error('mock: no model call'); });
    controller.realLLM = { generate };
    const paragraphs = Array.from({ length: 12 }, (_, i) => `第${i + 1}段有各自不同的证据与行动，编号${i + 1}保留原样。`);
    const finding = (ruleId: string, indexes: number[]): HardlineFinding => ({
      ruleId, message: ruleId, position: '全文', snippet: paragraphs[indexes[0]],
      paragraphs: indexes.map(i => paragraphs[i]), paragraphIndices: indexes,
    });
    const findings = [
      finding('26-uniform', [0, 1, 2]), finding('35', [3, 4, 5, 6]),
      finding('35b', [4, 5, 6, 7]), finding('42', [8, 9]),
      finding('50-fragment-action-chain', [5, 10]), finding('53-same-structure-parallel', [11]),
    ];
    await controller.repairHardlineFindingsLocally({
      projectId: 'test-project', chapterIndex: 1,
      content: paragraphs.join('\n\n'), findings, attempt: 1,
    });
    const prompt = String(generate.mock.calls[0][0].prompt);
    for (const id of findings.map(f => f.ruleId)) expect(prompt).toContain(`规则 ${id}`);
    expect(prompt).toContain(paragraphs[8]);
    expect(prompt).toContain(paragraphs[11]);
  });

  it('连续八段对话选中两个分隔位置，避免只改首段仍剩七段', async () => {
    const controller = Object.create(ChainController.prototype) as any;
    controller.resolveHardlineProfile = () => ({ platform: 'fanqie', storyType: 'short_story' });
    controller.detectGlobalFactContradictions = () => [];
    controller.buildExecutionStandardTags = () => '';
    controller.logger = { warn: vi.fn() };
    const generate = vi.fn(async (_request: any) => { throw new Error('mock: no model call'); });
    controller.realLLM = { generate };
    const paragraphs = Array.from({ length: 8 }, (_, i) => `“第${i + 1}句不同的问答，逐条核对现场进展。”`);
    await controller.repairHardlineFindingsLocally({
      projectId: 'test-project', chapterIndex: 1, content: paragraphs.join('\n\n'), attempt: 1,
      findings: [{ ruleId: '42', message: '连续八段圆滑对答', position: '第 1-8 段',
        snippet: paragraphs[0], paragraphs, paragraphIndices: Array.from({ length: 8 }, (_, i) => i) }],
    });
    const prompt = String(generate.mock.calls[0][0].prompt);
    expect(prompt).toContain(paragraphs[2]);
    expect(prompt).toContain(paragraphs[5]);
    expect(prompt).not.toContain(paragraphs[0]);
  });
});
