/**
 * Describe逐句精修 + 模板批量改写的提示词【唯一实现】
 *
 * 这个服务【不再】自带风格词表，也不做任何正则替换。
 *
 * 旧实现把「诗意/直白/隐喻/感官/情绪」5 个风格做成固定正则替换（"走了"→"如风般走了"、
 * "看"→"目光如水看"、"说"→"细语"），与项目卡片上选定的平台/分类/基调/文风/流派/视角
 * 毫无关系，会把「都市·现实 + 白描/朴素 + 第三人称限知」的正文改成另一种文风——
 * 这正是「配置是配置、怎么做是另一回事」的机制性根因，也是精修结果总是"不像这本书"的原因。
 *
 * 现在它只做两件事：
 *   1) 把执行标准（resolveProjectStandardDirective 的产物）注入 prompt 顶部，作为唯一口径；
 *   2) 在「文风」维内部做定向强化，方向取自 STYLE_INTENSITY_AXES 这一唯一来源。
 *
 * standardBlock 由调用方解析后传入；本服务不做任何兜底默认值——
 * 缺标准一律抛出，绝不退回「无平台约束」的通用改写。
 *
 * 为什么模板批量改写也走这里：此前「精修模板」是第二套实现——21 套正则规则，
 * 「删除多余的地/着」这类规则会把「地方」拆成「方」、「着急」拆成「急」，
 * 且与项目卡片上的执行标准无关。现在模板只提供「方向 + 任务」，prompt 装配
 * 与执行标准注入都复用本服务的 assemblePrompt，全仓不再有第三份改写实现。
 */
import { HttpException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { PolishResult } from './dto/refinement.dto';
import { STYLE_INTENSITY_AXES, styleIntensityAxis, type StyleIntensityAxis } from '../project/creative-constitution';

/** 由调用方注入的模型调用函数（避免本服务反向依赖 ChainModule） */
export type PolishLlmGenerate = (prompt: string, temperature: number, maxTokens?: number) => Promise<string>;

export interface DescribePolishRequest {
  /** 待精修句子 */
  sentence: string;
  /**
   * 执行标准块：resolveProjectStandardDirective(...) 的产物（含平台/分类/基调/文风/流派/视角）。
   * 为空 = 标准未执行，本服务直接拒绝执行。
   */
  standardBlock: string;
  /** 平台显示名，用于结果标注 */
  platformLabel: string;
  /** 已确认的「文风」维取值（来自项目卡片） */
  writingStyle: string;
  /** 已确认的「视角」维取值 */
  pov?: string;
  /** 创建前确认的题材标签 */
  styleTags?: string[];
  context?: { genre?: string; characterName?: string; emotion?: string };
  /** 定向强化方向；不传 = 严格按执行标准（standard） */
  axes?: string[];
  /** 每个方向返回几个变体（1-3），默认 3 */
  variants?: number;
}

/** 模板批量改写请求：任务由模板给出，口径由执行标准给出 */
export interface PolishBlockRequest {
  /** 待改写正文（一次调用对应一个内容块） */
  text: string;
  /** 执行标准块（必填，缺则拒绝执行） */
  standardBlock: string;
  /** 任务标题，例如「精修模板批量改写 · 简洁版」 */
  taskTitle: string;
  /** 模板任务指令——标准之内执行 */
  taskInstruction: string;
  /** 定向强化方向 id（STYLE_INTENSITY_AXES） */
  axis: string;
  /** 已确认叙事视角 */
  pov?: string;
}

@Injectable()
export class DescribePolishService {
  /** 可用方向 = 唯一来源里的那一份，不在此再列一份本地词表。 */
  getStyles(): Array<{ id: string; name: string; description: string }> {
    return STYLE_INTENSITY_AXES.map((axis) => ({
      id: axis.id,
      name: axis.label,
      description: axis.description,
    }));
  }

  async polish(req: DescribePolishRequest, llmGenerate: PolishLlmGenerate): Promise<PolishResult[]> {
    const sentence = String(req.sentence ?? '').trim();
    if (!sentence) {
      throw new UnprocessableEntityException('逐句精修未执行：待精修句子为空');
    }
    // 没有执行标准就不开工：空标准下改写出来的句子一定不属于这本书。
    if (!String(req.standardBlock ?? '').trim()) {
      throw new UnprocessableEntityException(
        '逐句精修未执行：缺少执行标准块（平台/分类/基调/文风/流派/视角），不得在无标准的情况下改写正文',
      );
    }

    const requested = req.axes?.length ? req.axes : ['standard'];
    const axes = requested.map((id) => {
      const axis = styleIntensityAxis(id);
      if (!axis) {
        throw new UnprocessableEntityException(
          `逐句精修未执行：未知的强化方向「${id}」。可用方向：${STYLE_INTENSITY_AXES.map((a) => a.id).join('、')}`,
        );
      }
      return axis;
    });

    const variants = Math.min(Math.max(1, Math.floor(req.variants ?? 3)), 3);
    const contextLines = [
      req.context?.genre ? `题材：${req.context.genre}` : '',
      req.context?.characterName ? `本句涉及角色：${req.context.characterName}` : '',
      req.context?.emotion ? `当下情绪：${req.context.emotion}` : '',
    ].filter(Boolean).join('\n');

    const results: PolishResult[] = [];
    for (const axis of axes) {
      for (let v = 0; v < variants; v++) {
        const prompt = this.assemblePrompt({
          standardBlock: req.standardBlock,
          taskTitle: '逐句精修',
          taskInstruction: '对以下句子做「文风维内的定向强化」',
          axis,
          unitLabel: '待精修句子',
          text: sentence,
          contextLines,
          pov: req.pov,
          variantNote: variants > 1
            ? `这是第 ${v + 1}/${variants} 个变体，请与同一句的其他写法采用明显不同的表达策略`
            : '',
        });

        let rewritten = '';
        try {
          rewritten = String((await llmGenerate(prompt, 0.8)) ?? '').trim();
        } catch (error) {
          throw new HttpException(
            {
              code: 'DESCRIBE_POLISH_LLM_FAILED',
              message: `逐句精修未完成：模型调用失败（方向 ${axis.label}）：${error instanceof Error ? error.message : String(error)}`,
            },
            502,
          );
        }
        // 空返回 = 这一句根本没被处理，不能当作候选结果混进去。
        if (!rewritten) {
          throw new HttpException(
            {
              code: 'DESCRIBE_POLISH_EMPTY',
              message: `逐句精修未完成：模型对方向「${axis.label}」返回空内容，已停止返回候选（避免把没处理的结果当成成功）`,
            },
            502,
          );
        }

        results.push({
          original: sentence,
          rewritten,
          axis: axis.id,
          axisLabel: axis.label,
          changes: [axis.guide],
        });
      }
    }

    return results;
  }

  /**
   * 模板批量改写：与逐句精修共用同一份 prompt 装配、同一条执行标准、同一套失败即抛的规则。
   * 返回模型输出原文；空输出/模型异常一律抛出，绝不返回「没改过的原文」冒充成功。
   */
  async polishBlock(req: PolishBlockRequest, llmGenerate: PolishLlmGenerate): Promise<string> {
    const text = String(req.text ?? '');
    if (!text.trim()) {
      throw new UnprocessableEntityException('批量精修未执行：待改写正文为空');
    }
    if (!String(req.standardBlock ?? '').trim()) {
      throw new UnprocessableEntityException(
        '批量精修未执行：缺少执行标准块（平台/分类/基调/文风/流派/视角），不得在无标准的情况下改写正文',
      );
    }
    const axis = styleIntensityAxis(String(req.axis ?? ''));
    if (!axis) {
      throw new UnprocessableEntityException(
        `批量精修未执行：未知的强化方向「${req.axis}」。可用方向：${STYLE_INTENSITY_AXES.map((a) => a.id).join('、')}`,
      );
    }

    const prompt = this.assemblePrompt({
      standardBlock: req.standardBlock,
      taskTitle: req.taskTitle,
      taskInstruction: req.taskInstruction,
      axis,
      unitLabel: '待改写正文',
      text,
      pov: req.pov,
      preserveParagraphs: true,
    });

    let rewritten = '';
    try {
      rewritten = String(
        (await llmGenerate(prompt, 0.7, Math.min(4000, Math.max(1200, text.length * 2)))) ?? '',
      ).trim();
    } catch (error) {
      throw new HttpException(
        {
          code: 'TEMPLATE_APPLY_LLM_FAILED',
          message: `批量精修未完成：模型调用失败（方向 ${axis.label}）：${error instanceof Error ? error.message : String(error)}`,
        },
        502,
      );
    }
    if (!rewritten) {
      throw new HttpException(
        {
          code: 'TEMPLATE_APPLY_EMPTY',
          message: `批量精修未完成：模型对方向「${axis.label}」返回空内容，已停止返回结果（避免把没处理的内容当成成功）`,
        },
        502,
      );
    }
    return rewritten;
  }

  /**
   * prompt 装配的唯一实现：逐句精修与模板批量改写都由这里产出，
   * 差别只在「任务标题/任务指令/单位名/是否保持段落」。
   */
  private assemblePrompt(args: {
    standardBlock: string;
    taskTitle: string;
    taskInstruction: string;
    axis: StyleIntensityAxis;
    unitLabel: string;
    text: string;
    contextLines?: string;
    pov?: string;
    variantNote?: string;
    preserveParagraphs?: boolean;
  }): string {
    const lines = [
      args.standardBlock + `作为写作精修专家，请在本书执行标准之内，执行「${args.taskTitle}」。`,
      `任务：${args.taskInstruction}`,
      `方向：${args.axis.label}（${args.axis.guide}）`,
      '',
      `${args.unitLabel}：`,
      args.text,
      args.contextLines ? '已知上下文：\n' + args.contextLines : '',
      '',
      '输出要求：',
      args.preserveParagraphs
        ? '1. 只输出改写后的正文本身：不要解释、不要引号、不要编号；保持原有段落数量与先后顺序，段落之间空一行'
        : '1. 只输出这一句改写后的文字本身：不要解释、不要引号、不要编号、不要输出多段',
      '2. 保留事实、人物、事件与信息量，不得新增情节或改变人物关系',
      `3. ${args.pov ? `严格保持已确认叙事视角：${args.pov}` : '保持已建立的叙事视角，不得切换'}`,
      '4. 执行标准优先：平台/分类/基调/文风/流派/视角六维是唯一口径，本方向与标准冲突时以标准为准',
      `5. 以「更符合执行标准」为目标，不要为改而改；若内容已经完全符合标准，原样返回即可${args.variantNote ? `；${args.variantNote}` : ''}`,
      '',
      '改写结果：',
    ];
    return lines.filter((line) => line !== '').join('\n');
  }
}
