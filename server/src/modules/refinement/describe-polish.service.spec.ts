/**
 * describe-polish.service.spec.ts
 * DescribePolishService 单元测试 — 逐句精修（执行标准驱动）
 *
 * 这份测试守的是「二次加工入口必须按项目执行标准执行」这条线：
 * 旧实现是「5 个固定风格 + 正则替换」，与项目卡片上的平台/基调/文风无关，
 * 因此这里不再断言任何正则产物，只断言——标准块进了 prompt、方向来自唯一来源、缺标准/缺结果一律暴露。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DescribePolishService } from './describe-polish.service';
import { STYLE_INTENSITY_AXES } from '../project/creative-constitution';

const STANDARD_BLOCK = '【目标平台与风格定位 · 最高优先级】\n平台=番茄小说｜文风=白描/朴素｜基调=热血｜视角=第三人称限知\n\n';
const BASE = {
  sentence: '他推开门，走进了房间。',
  standardBlock: STANDARD_BLOCK,
  platformLabel: '番茄小说',
  writingStyle: '白描/朴素',
  pov: '第三人称限知',
};

describe('DescribePolishService', () => {
  let service: DescribePolishService;

  beforeEach(() => {
    service = new DescribePolishService();
  });

  describe('getStyles', () => {
    it('方向清单来自唯一来源 STYLE_INTENSITY_AXES', () => {
      const styles = service.getStyles();
      expect(styles.map((s) => s.id)).toEqual(STYLE_INTENSITY_AXES.map((a) => a.id));
    });

    it('每个方向都有 id / name / description', () => {
      for (const style of service.getStyles()) {
        expect(style.id).toBeTruthy();
        expect(style.name).toBeTruthy();
        expect(style.description).toBeTruthy();
      }
    });

    it('默认方向是「严格按执行标准」，不是某个具体风格', () => {
      expect(service.getStyles()[0].id).toBe('standard');
    });
  });

  describe('执行标准是前提', () => {
    it('缺执行标准块时拒绝执行', async () => {
      await expect(
        service.polish({ ...BASE, standardBlock: '   ' }, async () => '改写结果'),
      ).rejects.toThrow(/缺少执行标准块/);
    });

    it('空句子时拒绝执行', async () => {
      await expect(
        service.polish({ ...BASE, sentence: '  ' }, async () => '改写结果'),
      ).rejects.toThrow(/待精修句子为空/);
    });

    it('未知方向时拒绝执行，并列出可用方向', async () => {
      await expect(
        service.polish({ ...BASE, axes: ['no_such_axis'] }, async () => '改写结果'),
      ).rejects.toThrow(/未知的强化方向/);
    });
  });

  describe('prompt 必须带上执行标准', () => {
    it('标准块出现在 prompt 最前，且带上平台/文风/视角与方向条款', async () => {
      const prompts: string[] = [];
      await service.polish({ ...BASE, axes: ['direct'], variants: 1 }, async (prompt) => {
        prompts.push(prompt);
        return '他拉开门，走进去。';
      });

      expect(prompts).toHaveLength(1);
      const prompt = prompts[0];
      expect(prompt.startsWith(STANDARD_BLOCK)).toBe(true);
      expect(prompt).toContain('番茄小说');
      expect(prompt).toContain('白描/朴素');
      expect(prompt).toContain('第三人称限知');
      expect(prompt).toContain('执行标准优先');
      // 方向条款取自唯一来源，且显式声明不得越出已确认文风
      const directGuide = STYLE_INTENSITY_AXES.find((a) => a.id === 'direct')!.guide;
      expect(prompt).toContain(directGuide);
    });

    it('未指定方向时按 standard（严格按执行标准）执行', async () => {
      const prompts: string[] = [];
      await service.polish({ ...BASE, variants: 1 }, async (prompt) => {
        prompts.push(prompt);
        return '他推开门，走进房间。';
      });
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toContain(STYLE_INTENSITY_AXES[0].label);
    });
  });

  describe('结果契约', () => {
    it('每个方向 × 每个变体各调用一次模型，并原样返回模型输出', async () => {
      let calls = 0;
      const results = await service.polish({ ...BASE, axes: ['poetic', 'direct'], variants: 3 }, async () => {
        calls += 1;
        return `改写版本${calls}`;
      });
      expect(calls).toBe(6);
      expect(results).toHaveLength(6);
      expect(results.map((r) => r.rewritten)).toEqual([
        '改写版本1', '改写版本2', '改写版本3', '改写版本4', '改写版本5', '改写版本6',
      ]);
    });

    it('每条结果带 original / axis / axisLabel / changes，且不再有伪评分', async () => {
      const results = await service.polish({ ...BASE, axes: ['poetic'], variants: 1 }, async () => '如风般推开门。');
      expect(results).toHaveLength(1);
      expect(results[0].original).toBe(BASE.sentence);
      expect(results[0].axis).toBe('poetic');
      expect(results[0].axisLabel).toBe('诗意');
      expect(results[0].changes.length).toBeGreaterThan(0);
      expect(results[0]).not.toHaveProperty('rating');
    });

    it('变体数被限制在 1-3', async () => {
      const results = await service.polish({ ...BASE, axes: ['poetic'], variants: 99 }, async () => '改');
      expect(results).toHaveLength(3);
    });
  });

  describe('不降级：失败必须暴露', () => {
    it('模型返回空内容时抛出，而不是把空结果当成候选', async () => {
      await expect(
        service.polish({ ...BASE, axes: ['poetic'], variants: 1 }, async () => '   '),
      ).rejects.toThrow(/返回空内容/);
    });

    it('模型调用失败时抛出，并带上方向与原因', async () => {
      await expect(
        service.polish({ ...BASE, axes: ['poetic'], variants: 1 }, async () => {
          throw new Error('模型超时');
        }),
      ).rejects.toThrow(/模型调用失败（方向 诗意）：模型超时/);
    });
  });

  describe('polishBlock（模板批量改写，与逐句精修共用同一份标准与 prompt 装配）', () => {
    const BLOCK_BASE = {
      text: '他推开门，走进了房间。\n他坐到桌前，翻开了本子。',
      standardBlock: STANDARD_BLOCK,
      taskTitle: '精修模板批量改写 · 简洁版',
      taskInstruction: '删去冗余修饰词与口水话，让句子更直接有力',
      axis: 'direct',
      pov: '第三人称限知',
    };

    it('缺执行标准块时拒绝执行', async () => {
      await expect(
        service.polishBlock({ ...BLOCK_BASE, standardBlock: '  ' }, async () => '改写结果'),
      ).rejects.toThrow(/缺少执行标准块/);
    });

    it('待改写正文为空时拒绝执行', async () => {
      await expect(
        service.polishBlock({ ...BLOCK_BASE, text: '  \n ' }, async () => '改写结果'),
      ).rejects.toThrow(/待改写正文为空/);
    });

    it('未知方向时拒绝执行，并列出可用方向', async () => {
      await expect(
        service.polishBlock({ ...BLOCK_BASE, axis: 'no_such_axis' }, async () => '改写结果'),
      ).rejects.toThrow(/未知的强化方向/);
    });

    it('prompt 以标准块开头，并带上模板任务/方向条款/视角与「保持段落数量」条款', async () => {
      const prompts: string[] = [];
      await service.polishBlock(BLOCK_BASE, async (prompt) => {
        prompts.push(prompt);
        return '他推开门，走进房间。\n他坐到桌前，翻开本子。';
      });
      expect(prompts).toHaveLength(1);
      const prompt = prompts[0];
      expect(prompt.startsWith(STANDARD_BLOCK)).toBe(true);
      expect(prompt).toContain('精修模板批量改写 · 简洁版');
      expect(prompt).toContain(BLOCK_BASE.taskInstruction);
      expect(prompt).toContain(STYLE_INTENSITY_AXES.find((a) => a.id === 'direct')!.guide);
      expect(prompt).toContain('第三人称限知');
      expect(prompt).toContain('执行标准优先');
      expect(prompt).toContain('保持原有段落数量与先后顺序');
    });

    it('原样返回模型输出（本服务不做后处理，段落校验由模板服务负责）', async () => {
      const out = await service.polishBlock(BLOCK_BASE, async () => '他推门进屋。\n他在桌前坐下。');
      expect(out).toBe('他推门进屋。\n他在桌前坐下。');
    });

    it('调用模型时用 0.7 温度，并按正文长度把 maxTokens 传下去（长块不截断）', async () => {
      const calls: Array<{ temperature: number; maxTokens?: number }> = [];
      await service.polishBlock(BLOCK_BASE, async (_prompt, temperature, maxTokens) => {
        calls.push({ temperature, maxTokens });
        return '改写结果';
      });
      expect(calls[0].temperature).toBe(0.7);
      expect(calls[0].maxTokens).toBe(1200);

      const longText = '句子内容。'.repeat(700);
      await service.polishBlock({ ...BLOCK_BASE, text: longText }, async (_prompt, temperature, maxTokens) => {
        calls.push({ temperature, maxTokens });
        return '改写结果';
      });
      expect(calls[1].maxTokens).toBe(4000);
    });

    it('模型返回空内容时抛出 TEMPLATE_APPLY_EMPTY，而不是把没处理的内容当成成功', async () => {
      const err = await service.polishBlock(BLOCK_BASE, async () => '   ').catch((e) => e);
      expect((err as any).getResponse().code).toBe('TEMPLATE_APPLY_EMPTY');
      expect((err as any).getStatus()).toBe(502);
    });

    it('模型调用失败时抛出 TEMPLATE_APPLY_LLM_FAILED，并带上方向与原因', async () => {
      const err = await service.polishBlock(BLOCK_BASE, async () => {
        throw new Error('模型超时');
      }).catch((e) => e);
      const body = (err as any).getResponse();
      expect(body.code).toBe('TEMPLATE_APPLY_LLM_FAILED');
      expect((err as any).getStatus()).toBe(502);
      expect(body.message).toContain('直白');
      expect(body.message).toContain('模型超时');
    });
  });
});