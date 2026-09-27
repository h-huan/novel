/**
 * 精修模板系统（执行标准驱动）
 *
 * 旧实现是「21 套正则规则」：用 remove 规则删掉「地」「着」这类虚词（正则含空白匹配），
 * 「地方」拆成「方」、「着急」拆成「急」；而 add / rewrite 规则在旧实现里直接 return content，
 * 是空转。更要命的是它与项目卡片上确认的 平台/分类/基调/文风/流派/视角 毫无关系——
 * 「古风版」可以把「都市·现实 + 白描/朴素」的正文改成另一种文风，这正是
 * 「配置是配置、怎么做是另一回事」的老毛病。
 *
 * 现在模板只回答两件事：
 *   1) 方向 axis —— 取值来自 STYLE_INTENSITY_AXES（唯一来源）；
 *   2) 任务 task —— 标准之内的具体改写任务。
 *
 * 真正的改写由 DescribePolishService.polishBlock 执行：prompt 装配、执行标准注入、
 * 空输出与模型异常一律抛出，全仓共用同一份实现。凡是与执行标准冲突的模板
 * （如古风版之于都市白描）在 applyWithStandard 中直接 422 拒绝，绝不照做。
 */
import { HttpException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { Template, TemplateFit, TemplateStandardContext } from './dto/refinement.dto';
import { projectStandardBlock, styleIntensityAxis } from '../project/creative-constitution';
import type { ProjectStandardDirective } from '../project/creative-constitution';
import { DescribePolishService } from './describe-polish.service';
import type { PolishLlmGenerate } from './describe-polish.service';

/** 由 ProjectStandardDirective 派生模板执行上下文（适用性判断 + prompt 注入） */
export function templateStandardContext(standard: ProjectStandardDirective): TemplateStandardContext {
  const c = standard.constitution;
  const styleList = Array.isArray(c.writingStyle)
    ? c.writingStyle.map((v) => String(v)).filter(Boolean)
    : c.writingStyle ? [String(c.writingStyle)] : [];
  const toneList = c.storyTone.map((v) => String(v)).filter(Boolean);
  const genreList = c.webNovelGenre.map((v) => String(v)).filter(Boolean);
  const text = [
    standard.platformLabel,
    c.category,
    ...styleList,
    ...toneList,
    ...genreList,
    c.pov,
    standard.styleTags.join(' '),
    standard.isLong ? '长篇' : '短篇',
  ].filter(Boolean).join(' ');
  return {
    projectId: standard.projectId,
    standardBlock: projectStandardBlock(standard),
    platformLabel: standard.platformLabel,
    category: String(c.category ?? ''),
    writingStyle: styleList.join('、'),
    storyTone: toneList.join('、'),
    webNovelGenre: genreList.join('、'),
    pov: String(c.pov ?? ''),
    styleTags: standard.styleTags,
    standardText: text,
  };
}

export interface TemplateListItem extends Template {
  axisLabel: string;
  /** 在【该项目执行标准】下是否可用 */
  applicable: boolean;
  /** 不可用时的具体理由（含命中的标准文本） */
  rejectReason: string;
}

export interface TemplateApplyInput {
  templateId: string;
  content: string;
  standard: TemplateStandardContext;
  /** 单次模型调用的正文上限（字符），默认 900 */
  chunkChars?: number;
  /** 并发模型调用数，默认 3 */
  concurrency?: number;
}

export interface TemplateApplyResult {
  templateId: string;
  templateName: string;
  templateTask: string;
  axis: string;
  axisLabel: string;
  projectId: string;
  platform: string;
  standardBasis: {
    category: string;
    writingStyle: string;
    storyTone: string;
    webNovelGenre: string;
    pov: string;
    styleTags: string[];
  };
  original: string;
  result: string;
  chunks: number;
  changedChunks: number;
  unchangedChunks: number;
  appliedRules: string[];
}

interface Chunk {
  index: number;
  text: string;
  paragraphs: number;
}

const DEFAULT_CHUNK_CHARS = 900;
const DEFAULT_CONCURRENCY = 3;

@Injectable()
export class RefinementTemplatesService {
  constructor(private readonly describePolish: DescribePolishService) {}

  private readonly templates: Template[] = [
    {
      id: 'concise', name: '简洁版', category: 'style', tags: ['简洁', '精炼', '去除冗余'],
      description: '在不改变信息量的前提下删去冗余修饰，让表达更直接有力',
      axis: 'direct',
      task: '删去冗余修饰词与口水话，让句子更直接有力；不得把「地方」「着急」这类词拆开，不得删掉任何信息',
    },
    {
      id: 'vivid', name: '生动版', category: 'style', tags: ['生动', '细节', '感官'],
      description: '补足细节与感官体验，让文字更具画面感',
      axis: 'sensory',
      task: '补足与当下动作/情绪直接相关的细节，让画面更具体；不得新增情节或堆砌无关环境描写',
    },
    {
      id: 'dialogue', name: '对话强化版', category: 'dialogue', tags: ['对话', '表现力', '标签'],
      description: '增强对话表现力，丰富对话标签和语气',
      axis: 'standard',
      task: '丰富对话前后的人物动作与语气提示，让对话贴合角色身份与当下处境；不得新增对白、不得改变台词含义',
    },
    {
      id: 'suspense', name: '悬念版', category: 'plot', tags: ['悬念', '神秘', '氛围'],
      description: '调整信息释放节奏，增加悬念感和神秘氛围',
      axis: 'suspense',
      task: '延后关键信息的释放，强化读者追问的欲望；不得新增事实，不得改变已有信息的真假',
    },
    {
      id: 'emotional', name: '情绪版', category: 'emotion', tags: ['情绪', '渲染', '冲击力'],
      description: '强化情绪渲染，增强情感冲击力',
      axis: 'emotional',
      task: '强化情绪落点与层次；不得改变基调，不得煽情化，不得替角色下结论',
    },
    {
      id: 'scene', name: '场景版', category: 'scene', tags: ['场景', '沉浸', '环境'],
      description: '增强场景沉浸感，丰富环境描写',
      axis: 'sensory',
      task: '增强场景的空间感与在场感；不得堆砌与当下情节无关的景物',
    },
    {
      id: 'pacing', name: '节奏版', category: 'style', tags: ['节奏', '韵律', '断句'],
      description: '调整句子长短和段落节奏，增强阅读韵律',
      axis: 'standard',
      task: '调整句长与段落切分，使张弛有节奏；不得改变叙事顺序，不得删减信息',
    },
    {
      id: 'style-unify', name: '文风统一版', category: 'style', tags: ['文风', '统一', '语体'],
      description: '保持全文风格和语体一致，检测并修正风格不匹配',
      axis: 'standard',
      task: '校正与已确认文风不一致的语体（夹生的书面腔、网络腔、翻译腔），使全章语体统一到执行标准',
    },
    {
      id: 'classical', name: '古风版', category: 'style', tags: ['古风', '文言', '雅韵'],
      description: '按古代/文言方向行文（仅适用于古代题材的标准）',
      axis: 'standard',
      task: '按已确认的古代/文言方向调整用词与句式；现代白话的叙述腔必须去掉',
      fit: {
        requireAny: ['古风', '古代', '文言', '仙侠', '武侠', '历史', '宫廷', '江湖', '修真', '玄幻', '东方'],
        forbidAny: ['白描', '朴素', '现实', '都市', '职场', '现代', '科幻', '校园'],
        reason: '「古风版」会改变已确认的「文风/流派」，与当前执行标准冲突',
      },
    },
    {
      id: 'commercial', name: '网文爽感版', category: 'plot', tags: ['爽感', '节奏', '期待感'],
      description: '强化爽感节奏，增加情绪冲击点和期待感',
      axis: 'emotional',
      task: '强化爽点密度与期待感，让读者有追读动力；不得改变基调，不得凭空新增打脸/反转桥段',
    },
    {
      id: 'literary', name: '文学修辞版', category: 'style', tags: ['修辞', '比喻', '文学性'],
      description: '在标准允许的范围内运用修辞手法提升文学性',
      axis: 'metaphorical',
      task: '在已确认文风允许的范围内使用比喻/拟人/排比等修辞；不得堆砌辞藻，不得把文风改成另一种文体',
    },
    {
      id: 'horror', name: '悬疑恐怖版', category: 'emotion', tags: ['恐怖', '压迫感', '悬念'],
      description: '营造压迫氛围，增强心理悬念',
      axis: 'suspense',
      task: '营造压迫与不安的气氛，强化心理悬念；不得改变题材定位，不得加入与执行标准冲突的元素',
      fit: {
        forbidAny: ['儿童', '童话', '亲子', '低幼', '甜宠'],
        reason: '「悬疑恐怖版」与当前执行标准的题材定位冲突（低幼/甜宠向内容不宜施加恐怖氛围）',
      },
    },
    {
      id: 'logical', name: '逻辑一致性版', category: 'plot', tags: ['逻辑', '自洽', '因果'],
      description: '修正前后矛盾，确保因果自洽',
      axis: 'standard',
      task: '修正前后矛盾与因果跳跃；不得为了自洽而新增设定或改变既有事实',
    },
    {
      id: 'action', name: '动作强化版', category: 'scene', tags: ['动作', '张力', '画面感'],
      description: '增强动作描写的张力和画面感',
      axis: 'sensory',
      task: '增强动作的张力、速度感与因果清晰度；不得新增招式/能力，不得改变胜负结果',
    },
    {
      id: 'dialogue-natural', name: '对话自然版', category: 'dialogue', tags: ['对话', '自然', '身份'],
      description: '让对话更自然流畅，符合角色身份',
      axis: 'standard',
      task: '让对话更自然、更贴合角色身份与当下处境；不得改变台词含义与信息',
    },
    {
      id: 'exposition', name: '背景说明优化版', category: 'plot', tags: ['背景', '融入', '叙事'],
      description: '将直白的背景说明转化为自然的叙事融入',
      axis: 'standard',
      task: '把直白的背景说明融进当下的动作、对话或场景中；不得删掉读者必须知道的信息',
    },
    {
      id: 'transitions', name: '过渡衔接版', category: 'style', tags: ['过渡', '衔接', '场景切换'],
      description: '优化段落和场景之间的过渡衔接',
      axis: 'standard',
      task: '优化段落与场景之间的过渡，消除生硬跳转；不得改变事件顺序',
    },
    {
      id: 'sensory', name: '五感增强版', category: 'scene', tags: ['五感', '感官', '沉浸'],
      description: '补足视觉/听觉/触觉/味觉/嗅觉中与情境相关的部分',
      axis: 'sensory',
      task: '补足五感中与当下情境真正相关的部分；不得堆砌五感，不得写与情节无关的感官铺陈',
    },
    {
      id: 'rhythm', name: '韵律节奏版', category: 'style', tags: ['韵律', '句式', '反复'],
      description: '通过句式反复与长短交替形成语言节奏（仅适用于韵律/古风向标准）',
      axis: 'poetic',
      task: '通过句式长短与有意的重复形成语言节奏；保持叙述推进，不得写成诗化文体',
      fit: {
        requireAny: ['古风', '古代', '诗词', '仙侠', '武侠', '东方', '玄幻', '韵律', '文艺'],
        forbidAny: ['白描', '朴素'],
        reason: '「韵律节奏版」的押韵/反复句式会改变已确认的「白描/朴素」文风',
      },
    },
    {
      id: 'flashback', name: '回忆插叙版', category: 'plot', tags: ['回忆', '插叙', '结构'],
      description: '将平铺直叙中的关键信息转为回忆/插叙手法',
      axis: 'standard',
      task: '把关键信息改由回忆/插叙带出；不得改变事实发生的时间与因果',
    },
    {
      id: 'summarize', name: '精炼概括版', category: 'style', tags: ['精炼', '压缩', '效率'],
      description: '压缩冗长段落，保留核心信息',
      axis: 'direct',
      task: '压缩冗长段落、保留核心信息；不得删除关键情节、人物动机与必要铺垫',
    },
  ];

  findAll(category?: string): Template[] {
    if (category) {
      return this.templates.filter((t) => t.category === category);
    }
    return this.templates;
  }

  findById(id: string): Template | undefined {
    return this.templates.find((t) => t.id === id);
  }

  getCategories(): string[] {
    const cats = new Set(this.templates.map((t) => t.category));
    return Array.from(cats);
  }

  /**
   * 按项目执行标准标注每个模板是否可用。
   * 界面必须依据 applicable 决定能不能执行——不能把与标准冲突的模板照做一遍。
   */
  annotateForStandard(standard: TemplateStandardContext, category?: string): TemplateListItem[] {
    return this.findAll(category).map((template) => {
      const verdict = this.evaluateFit(template, standard);
      const axis = styleIntensityAxis(template.axis);
      return {
        ...template,
        axisLabel: axis ? axis.label : template.axis,
        applicable: verdict.applicable,
        rejectReason: verdict.reason,
      };
    });
  }

  /**
   * 标准驱动的模板批量改写：分块 → 逐块调用 DescribePolishService.polishBlock → 校验段落结构 → 合并。
   * 任一块失败（模型异常/空输出/段落数变化）一律整体抛出并列出失败块，
   * 绝不返回「部分改了一半」的正文冒充成功——那正是上下文不一致的来源。
   */
  async applyWithStandard(
    input: TemplateApplyInput,
    llmGenerate: PolishLlmGenerate,
  ): Promise<TemplateApplyResult> {
    const template = this.findById(input.templateId);
    if (!template) {
      throw new UnprocessableEntityException(
        `精修模板未执行：模板不存在「${input.templateId}」。可用模板：${this.templates.map((t) => t.id).join('、')}`,
      );
    }
    const verdict = this.evaluateFit(template, input.standard);
    if (!verdict.applicable) {
      throw new UnprocessableEntityException(
        `精修模板未执行：${verdict.reason}。当前执行标准：${input.standard.standardText}`,
      );
    }
    if (!String(input.standard.standardBlock ?? '').trim()) {
      throw new UnprocessableEntityException(
        '精修模板未执行：缺少执行标准块（平台/分类/基调/文风/流派/视角）',
      );
    }
    const content = String(input.content ?? '');
    if (!content.trim()) {
      throw new UnprocessableEntityException('精修模板未执行：待改写正文为空');
    }

    const axis = styleIntensityAxis(template.axis);
    if (!axis) {
      throw new UnprocessableEntityException(
        `精修模板未执行：模板「${template.name}」绑定了未知方向「${template.axis}」`,
      );
    }

    const chunks = this.planChunks(content, input.chunkChars ?? DEFAULT_CHUNK_CHARS);
    const taskTitle = `精修模板批量改写 · ${template.name}`;
    const rewritten: string[] = new Array(chunks.length);
    const failures: string[] = [];
    let upstreamFailure = false;

    await this.mapWithConcurrency(chunks, input.concurrency ?? DEFAULT_CONCURRENCY, async (chunk) => {
      try {
        const out = await this.describePolish.polishBlock(
          {
            text: chunk.text,
            standardBlock: input.standard.standardBlock,
            taskTitle,
            taskInstruction: template.task,
            axis: template.axis,
            pov: input.standard.pov,
          },
          llmGenerate,
        );
        const expected = this.countParagraphs(chunk.text);
        const actual = this.countParagraphs(out);
        if (actual !== expected) {
          failures.push(`第 ${chunk.index + 1} 块：段落数由 ${expected} 变为 ${actual}（改写破坏了段落结构）`);
          return;
        }
        rewritten[chunk.index] = out;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = (error as any)?.getStatus?.() ?? (error as any)?.status;
        if (status === 502 || status === 504) upstreamFailure = true;
        failures.push(`第 ${chunk.index + 1} 块：${message}`);
      }
    });

    if (failures.length > 0) {
      throw new HttpException(
        {
          code: 'TEMPLATE_APPLY_INCOMPLETE',
          message: `精修模板未完成：${failures.length}/${chunks.length} 块失败，已整体中止（不写回半成品）：${failures.slice(0, 3).join('；')}`,
          templateId: template.id,
          failures,
          standardBasis: input.standard.standardText,
        },
        upstreamFailure ? 502 : 422,
      );
    }

    const separator = this.detectSeparator(content);
    const result = rewritten.join(separator);
    const changedChunks = chunks.filter((c, i) => rewritten[i] !== c.text).length;

    return {
      templateId: template.id,
      templateName: template.name,
      templateTask: template.task,
      axis: template.axis,
      axisLabel: axis.label,
      projectId: input.standard.projectId,
      platform: input.standard.platformLabel,
      standardBasis: {
        category: input.standard.category,
        writingStyle: input.standard.writingStyle,
        storyTone: input.standard.storyTone,
        webNovelGenre: input.standard.webNovelGenre,
        pov: input.standard.pov,
        styleTags: input.standard.styleTags,
      },
      original: content,
      result,
      chunks: chunks.length,
      changedChunks,
      unchangedChunks: chunks.length - changedChunks,
      appliedRules: [`方向：${axis.label}（${axis.guide}）`, `任务：${template.task}`],
    };
  }

  /** 适用性判定：与执行标准冲突的模板不得执行 */
  evaluateFit(template: Template, standard: TemplateStandardContext): { applicable: boolean; reason: string } {
    const fit: TemplateFit | undefined = template.fit;
    if (!fit) return { applicable: true, reason: '' };
    const text = String(standard.standardText ?? '');
    const hit = (fit.forbidAny ?? []).find((word) => word && text.includes(word));
    if (hit) {
      return { applicable: false, reason: `${fit.reason}（执行标准中出现「${hit}」）` };
    }
    const required = fit.requireAny ?? [];
    if (required.length > 0 && !required.some((word) => word && text.includes(word))) {
      return { applicable: false, reason: `${fit.reason}（执行标准中未出现 ${required.join('/')}）` };
    }
    return { applicable: true, reason: '' };
  }

  /** 段落分隔方式：优先空行分段，否则按单行分段——决定合并时用什么还原 */
  private detectSeparator(content: string): string {
    return /\n\s*\n/.test(content) ? '\n\n' : '\n';
  }

  private splitParagraphs(content: string, separator: string): string[] {
    return content
      .split(separator === '\n\n' ? /\n\s*\n/ : /\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  private planChunks(content: string, chunkChars: number): Chunk[] {
    const limit = Math.max(200, Math.floor(chunkChars));
    const separator = this.detectSeparator(content);
    const paragraphs = this.splitParagraphs(content, separator);
    const chunks: Chunk[] = [];
    let current: string[] = [];
    let currentChars = 0;

    const flush = () => {
      if (current.length === 0) return;
      chunks.push({
        index: chunks.length,
        text: current.join(separator),
        paragraphs: current.length,
      });
      current = [];
      currentChars = 0;
    };

    for (const paragraph of paragraphs) {
      if (currentChars > 0 && currentChars + paragraph.length > limit) flush();
      current.push(paragraph);
      currentChars += paragraph.length;
    }
    flush();
    return chunks;
  }

  private countParagraphs(text: string): number {
    return text.split(/\n/).map((line) => line.trim()).filter(Boolean).length;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
  ): Promise<void> {
    const size = Math.max(1, Math.min(Math.floor(limit), items.length));
    let cursor = 0;
    const workers = Array.from({ length: size }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        await fn(items[index]);
      }
    });
    await Promise.all(workers);
  }
}
