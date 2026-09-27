/**
 * refinement-templates.service.spec.ts
 * RefinementTemplatesService 单元测试 — 精修模板（执行标准驱动）
 *
 * 这份测试守的是「二次加工入口不得另立风格口径」这条线。
 * 旧实现是「21 套正则规则」：删「地」删「着」会把「地方」拆成「方」、「着急」拆成「急」，
 * 而且与项目卡片上的平台/分类/基调/文风/流派/视角毫无关系——「古风版」能把
 * 「都市·现实 + 白描/朴素」的正文改成另一种文风。
 *
 * 现在模板只提供「方向 axis（唯一来源 STYLE_INTENSITY_AXES）+ 任务 task」，
 * 改写全部交给 DescribePolishService.polishBlock，prompt 走同一份标准块；
 * 与标准冲突的模板直接 422，块失败整体中止，绝不返回半成品。
 */
import { describe, it, expect } from 'vitest';
import { HttpException } from '@nestjs/common';
import { RefinementTemplatesService, templateStandardContext } from './refinement-templates.service';
import { STYLE_INTENSITY_AXES, projectStandardBlock } from '../project/creative-constitution';
import type { ProjectStandardDirective } from '../project/creative-constitution';
import type { DescribePolishService, PolishBlockRequest, PolishLlmGenerate } from './describe-polish.service';

interface DirectiveFixture {
  projectId: string;
  platformLabel: string;
  category: string;
  writingStyle: string[];
  storyTone: string[];
  webNovelGenre: string[];
  pov: string;
  styleTags: string[];
  isLong: boolean;
}

function makeDirective(o: DirectiveFixture): ProjectStandardDirective {
  const constitution = {
    schemaVersion: 1,
    revision: 1,
    projectType: o.isLong ? 'long_novel' : 'short_story',
    targetPlatform: 'fanqie',
    targetWords: 200000,
    platformRules: [],
    category: o.category,
    storyTone: o.storyTone,
    writingStyle: o.writingStyle,
    webNovelGenre: o.webNovelGenre,
    pov: o.pov,
    targetAudience: '男频',
    chapterWordRange: { min: 2000, max: 3000 },
  } as unknown as ProjectStandardDirective['constitution'];
  return {
    projectId: o.projectId,
    directive: `【执行标准】平台=${o.platformLabel}｜题材=${o.category}｜文风=${o.writingStyle.join('/')}｜流派=${o.webNovelGenre.join('/')}｜视角=${o.pov}`,
    constitution,
    isLong: o.isLong,
    platformLabel: o.platformLabel,
    styleTags: o.styleTags,
    categoryPlacement: '',
    categoryBrief: '',
  };
}

/** 项目卡片：番茄小说 · 都市·现实 · 白描/朴素 · 热血 · 系统流 · 第三人称限知（长篇） */
const URBAN = makeDirective({
  projectId: 'p-urban',
  platformLabel: '番茄小说',
  category: '都市·现实',
  writingStyle: ['白描', '朴素'],
  storyTone: ['热血'],
  webNovelGenre: ['系统流'],
  pov: '第三人称限知',
  styleTags: ['签到系统', '都市逆袭'],
  isLong: true,
});

/** 项目卡片：番茄小说 · 玄幻·仙侠 · 古风/文言 · 热血 · 仙侠 · 第三人称限知（长篇） */
const ANCIENT = makeDirective({
  projectId: 'p-ancient',
  platformLabel: '番茄小说',
  category: '玄幻·仙侠',
  writingStyle: ['古风', '文言'],
  storyTone: ['热血'],
  webNovelGenre: ['仙侠'],
  pov: '第三人称限知',
  styleTags: ['修真'],
  isLong: true,
});

const URBAN_CTX = templateStandardContext(URBAN);
const ANCIENT_CTX = templateStandardContext(ANCIENT);

const neverCalledLlm: PolishLlmGenerate = async () => {
  throw new Error('本用例不应触发真实模型调用');
};

/** 用假的 DescribePolishService 构造服务：只关心「服务是否按标准委派、失败是否暴露」 */
function makeService(polishBlock: (req: PolishBlockRequest, llm: PolishLlmGenerate) => Promise<string>) {
  const fake = { polishBlock } as unknown as DescribePolishService;
  return new RefinementTemplatesService(fake);
}

function twoLongParagraphs(): { content: string; first: string; second: string } {
  const first = '他推开门走进屋子。' + '屋内陈设简单。'.repeat(20);
  const second = '他坐到桌前。' + '窗外的雨还在下。'.repeat(20);
  return { content: `${first}\n${second}`, first, second };
}

describe('RefinementTemplatesService', () => {
  const service = new RefinementTemplatesService();

  describe('模板清单', () => {
    it('返回全部模板且每个模板都有 id / name / category / tags', () => {
      const templates = service.findAll();
      expect(templates.length).toBeGreaterThan(0);
      for (const t of templates) {
        expect(t.id).toBeTruthy();
        expect(t.name).toBeTruthy();
        expect(t.category).toBeTruthy();
        expect(Array.isArray(t.tags)).toBe(true);
      }
    });

    it('不再带 rules 正则规则（旧实现的「删地删着」已彻底移除）', () => {
      for (const t of service.findAll()) {
        expect(t).not.toHaveProperty('rules');
        expect(t).not.toHaveProperty('apply');
      }
    });

    it('每个模板的 axis 都来自唯一来源 STYLE_INTENSITY_AXES', () => {
      const ids = STYLE_INTENSITY_AXES.map((a) => a.id);
      for (const t of service.findAll()) {
        expect(ids).toContain(t.axis);
      }
    });

    it('每个模板都有标准之内的任务指令（不得为空）', () => {
      for (const t of service.findAll()) {
        expect(typeof t.task).toBe('string');
        expect(t.task.trim().length).toBeGreaterThan(0);
      }
    });

    it('按 category 过滤，且只返回该分类', () => {
      const styleTemplates = service.findAll('style');
      expect(styleTemplates.length).toBeGreaterThan(0);
      expect(styleTemplates.every((t) => t.category === 'style')).toBe(true);
    });

    it('findById 命中 / 未命中', () => {
      expect(service.findById('concise')!.id).toBe('concise');
      expect(service.findById('nonexistent')).toBeUndefined();
    });

    it('getCategories 返回去重后的分类', () => {
      const categories = service.getCategories();
      expect(categories.length).toBeGreaterThan(0);
      expect(new Set(categories).size).toBe(categories.length);
    });
  });

  describe('旧 API 不得复活（防止又出现第二套正则实现）', () => {
    it('applyTemplate / getAppliedRules / applyTemplates 已不存在', () => {
      const anyService = service as unknown as Record<string, unknown>;
      expect(anyService.applyTemplate).toBeUndefined();
      expect(anyService.getAppliedRules).toBeUndefined();
      expect(anyService.applyTemplates).toBeUndefined();
    });
  });

  describe('执行标准派生上下文', () => {
    it('standardBlock 与唯一来源 projectStandardBlock 完全一致', () => {
      expect(URBAN_CTX.standardBlock).toBe(projectStandardBlock(URBAN));
    });

    it('六维与项目卡片一致，并带回 projectId / 平台 / 题材标签', () => {
      expect(URBAN_CTX.projectId).toBe('p-urban');
      expect(URBAN_CTX.platformLabel).toBe('番茄小说');
      expect(URBAN_CTX.category).toBe('都市·现实');
      expect(URBAN_CTX.writingStyle).toBe('白描、朴素');
      expect(URBAN_CTX.storyTone).toBe('热血');
      expect(URBAN_CTX.webNovelGenre).toBe('系统流');
      expect(URBAN_CTX.pov).toBe('第三人称限知');
      expect(URBAN_CTX.styleTags).toEqual(['签到系统', '都市逆袭']);
    });

    it('standardText 覆盖平台/分类/文风/基调/流派/视角/标签/篇幅，供适用性判定', () => {
      for (const token of ['番茄小说', '都市·现实', '白描', '朴素', '热血', '系统流', '第三人称限知', '都市逆袭', '长篇']) {
        expect(URBAN_CTX.standardText).toContain(token);
      }
    });
  });

  describe('annotateForStandard：与执行标准冲突的模板必须判为不可用', () => {
    it('都市·白描/朴素 标准下，古风版不可用且给出命中的标准文本', () => {
      const list = service.annotateForStandard(URBAN_CTX);
      const classical = list.find((t) => t.id === 'classical')!;
      expect(classical.applicable).toBe(false);
      expect(classical.rejectReason).toContain('执行标准中出现「');
      expect(classical.rejectReason).toMatch(/白描|朴素|都市|现实/);
    });

    it('都市·白描 标准下，韵律节奏版同样不可用', () => {
      const rhythm = service.annotateForStandard(URBAN_CTX).find((t) => t.id === 'rhythm')!;
      expect(rhythm.applicable).toBe(false);
      expect(rhythm.rejectReason).toMatch(/白描|朴素/);
    });

    it('古代·仙侠 标准下，古风版与韵律节奏版可用', () => {
      const list = service.annotateForStandard(ANCIENT_CTX);
      expect(list.find((t) => t.id === 'classical')!.applicable).toBe(true);
      expect(list.find((t) => t.id === 'rhythm')!.applicable).toBe(true);
    });

    it('无 fit 门槛的模板在任何标准下都可用（仍受标准约束）', () => {
      for (const item of service.annotateForStandard(URBAN_CTX)) {
        if (item.id === 'concise' || item.id === 'vivid') expect(item.applicable).toBe(true);
      }
    });

    it('axisLabel 取自唯一来源的轴 label', () => {
      const list = service.annotateForStandard(URBAN_CTX);
      for (const item of list) {
        const axis = STYLE_INTENSITY_AXES.find((a) => a.id === item.axis)!;
        expect(item.axisLabel).toBe(axis.label);
      }
    });

    it('支持按 category 过滤后再标注', () => {
      const list = service.annotateForStandard(URBAN_CTX, 'style');
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((t) => t.category === 'style')).toBe(true);
    });
  });

  describe('applyWithStandard：前提缺失与冲突一律抛出，不静默回落', () => {
    it('未知模板直接拒绝，并列出可用模板', async () => {
      const svc = makeService(async () => 'x');
      await expect(
        svc.applyWithStandard({ templateId: 'nope', content: '第一段。', standard: URBAN_CTX }, neverCalledLlm),
      ).rejects.toThrow(/模板不存在「nope」/);
    });

    it('缺执行标准块时拒绝执行', async () => {
      const svc = makeService(async () => 'x');
      await expect(
        svc.applyWithStandard(
          { templateId: 'concise', content: '第一段。', standard: { ...URBAN_CTX, standardBlock: '   ' } },
          neverCalledLlm,
        ),
      ).rejects.toThrow(/缺少执行标准块/);
    });

    it('待改写正文为空时拒绝执行', async () => {
      const svc = makeService(async () => 'x');
      await expect(
        svc.applyWithStandard({ templateId: 'concise', content: '  \n ', standard: URBAN_CTX }, neverCalledLlm),
      ).rejects.toThrow(/待改写正文为空/);
    });

    it('模板与执行标准冲突时 422 拒绝，并把标准文本带出来', async () => {
      const svc = makeService(async () => 'x');
      const err = await svc
        .applyWithStandard({ templateId: 'classical', content: '第一段。', standard: URBAN_CTX }, neverCalledLlm)
        .catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
      expect((err as Error).message).toContain('当前执行标准：');
    });
  });

  describe('applyWithStandard：标准驱动的批量改写', () => {
    it('按块委派 polishBlock，并把同一份标准块与模板任务传下去', async () => {
      const seen: PolishBlockRequest[] = [];
      const svc = makeService(async (req) => {
        seen.push(req);
        return req.text;
      });
      const { content } = twoLongParagraphs();
      const r = await svc.applyWithStandard(
        { templateId: 'concise', content, standard: URBAN_CTX, chunkChars: 200, concurrency: 1 },
        neverCalledLlm,
      );

      expect(seen.length).toBe(r.chunks);
      expect(r.chunks).toBe(2);
      for (const req of seen) {
        expect(req.standardBlock).toBe(projectStandardBlock(URBAN));
        expect(req.taskInstruction).toBe(service.findById('concise')!.task);
        expect(req.axis).toBe('direct');
        expect(req.pov).toBe('第三人称限知');
        expect(req.taskTitle).toContain('简洁版');
      }
    });

    it('成功时返回完整结果契约，并如实统计改动块数', async () => {
      const { content, first, second } = twoLongParagraphs();
      const svc = makeService(async (req) => (req.text === first ? `${first}（改写）` : req.text));
      const r = await svc.applyWithStandard(
        { templateId: 'concise', content, standard: URBAN_CTX, chunkChars: 200, concurrency: 1 },
        neverCalledLlm,
      );

      expect(r.templateId).toBe('concise');
      expect(r.templateName).toBe('简洁版');
      expect(r.templateTask).toBe(service.findById('concise')!.task);
      expect(r.axis).toBe('direct');
      expect(r.axisLabel).toBe('直白');
      expect(r.projectId).toBe('p-urban');
      expect(r.platform).toBe('番茄小说');
      expect(r.standardBasis).toEqual({
        category: '都市·现实',
        writingStyle: '白描、朴素',
        storyTone: '热血',
        webNovelGenre: '系统流',
        pov: '第三人称限知',
        styleTags: ['签到系统', '都市逆袭'],
      });
      expect(r.original).toBe(content);
      expect(r.result).toBe(`${first}（改写）\n${second}`);
      expect(r.chunks).toBe(2);
      expect(r.changedChunks).toBe(1);
      expect(r.unchangedChunks).toBe(1);
      expect(r.appliedRules.join(' ')).toContain('直白');
    });

    it('单块正文成功改写（空行分段保持）', async () => {
      const content = '第一段。\n\n第二段。';
      const svc = makeService(async () => '第一段改写。\n\n第二段改写。');
      const r = await svc.applyWithStandard({ templateId: 'vivid', content, standard: URBAN_CTX }, neverCalledLlm);
      expect(r.chunks).toBe(1);
      expect(r.result).toBe('第一段改写。\n\n第二段改写。');
      expect(r.changedChunks).toBe(1);
    });
  });

  describe('applyWithStandard：不降级，任何一块失败都整体中止', () => {
    it('段落数被改写破坏时判为失败（上下文不一致的来源）', async () => {
      const content = '第一段。\n第二段。';
      const svc = makeService(async () => '合并成一段了。');
      const err = await svc
        .applyWithStandard({ templateId: 'concise', content, standard: URBAN_CTX }, neverCalledLlm)
        .catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as any).getResponse().code).toBe('TEMPLATE_APPLY_INCOMPLETE');
      expect((err as any).getResponse().failures.join(' ')).toContain('段落数由 2 变为 1');
    });

    it('模型异常时列出失败块，并按 422 报错（未写回半成品）', async () => {
      const { content } = twoLongParagraphs();
      const svc = makeService(async () => {
        throw new Error('模型超时');
      });
      const err = await svc
        .applyWithStandard({ templateId: 'concise', content, standard: URBAN_CTX, chunkChars: 200 }, neverCalledLlm)
        .catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
      const body = (err as any).getResponse();
      expect(body.code).toBe('TEMPLATE_APPLY_INCOMPLETE');
      expect(body.failures).toHaveLength(2);
      expect(body.failures[0]).toContain('模型超时');
      expect(body.standardBasis).toContain('都市·现实');
    });

    it('上游 502 时整体报 502（不把它当成业务 422）', async () => {
      const svc = makeService(async () => {
        throw new HttpException({ code: 'TEMPLATE_APPLY_LLM_FAILED' }, 502);
      });
      const err = await svc
        .applyWithStandard({ templateId: 'concise', content: '第一段。', standard: URBAN_CTX }, neverCalledLlm)
        .catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(502);
    });

    it('模型返回空内容时同样整体中止', async () => {
      const svc = makeService(async () => '   ');
      const err = await svc
        .applyWithStandard({ templateId: 'concise', content: '第一段。\n第二段。', standard: URBAN_CTX }, neverCalledLlm)
        .catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as any).getResponse().code).toBe('TEMPLATE_APPLY_INCOMPLETE');
    });
  });
});
