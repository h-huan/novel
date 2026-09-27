/**
 * 固定生产 Prompt 注册表。
 *
 * 这里只保留当前两条固定长篇生产链真实引用的 5 个模板。
 * 运行时新增/修改模板、旧灵感补全模板和平行提示词库均已删除，避免模型/对话切换后重新出现第二套流程。
 */
import { Injectable, Logger } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { CHAPTER_WORD_RANGE } from '../../shared/src';

interface TemplateEntry {
  id: string;
  name: string;
  category: 'long-novel-outline';
  version: string;
  content: string;
  description: string;
  variables: string[];
  isActive: true;
}

const FIXED_TEMPLATE_IDS = new Set([
  'long-novel-story-analysis',
  'long-novel-volume-outline',
  'long-novel-chapter-outline',
  'long-novel-main-skeleton',
  'long-novel-init-worldview',
]);

@Injectable()
export class PromptRegistryService {
  private readonly logger = new Logger(PromptRegistryService.name);
  private readonly templates = new Map<string, TemplateEntry>();
  private readonly compiledCache = new Map<string, HandlebarsTemplateDelegate>();

  constructor() {
    this.registerHelpers();
    this.registerFixedTemplates();
    this.logger.log(`PromptRegistry 初始化完成，已注册 ${this.templates.size} 个固定生产模板`);
  }

  private registerFixedTemplates(): void {
    this.register({
      id: 'long-novel-story-analysis',
      name: '剧情分析',
      category: 'long-novel-outline',
      version: '1.0.0',
      description: '分析剧情类型、复杂度，按实际故事阶段决定卷数',
      content: `你是一名资深网文策划，擅长分析故事结构并制定灵活的大纲规划。
**重要：卷数、每卷章数和总章数都不能预设；必须根据故事阶段、人物弧线、冲突升级与节奏实际拆分。**

## 输入信息
- 故事设定：{{user_input.story_setting}}
- 目标字数：{{user_input.targetWords}}（单位：万字）
- 故事类型：{{user_input.genre}}
- 章节上限：{{user_input.chapterLimit}}（可为空；非空时全书总章数不得超过该值）
- 平台与执行标准（最高优先级，必须先执行）：{{user_input.platform_directive}}

## 执行要求
1. **分析剧情复杂度**：根据故事类型和目标字数，评估需要多少卷才能完整讲述故事
2. **决定卷数**：逐一识别不可合并的叙事阶段；只有主题目标、阶段冲突和阶段高潮均成立时才建立一卷，不使用任何预设卷数区间
3. **每卷主题**：为每卷确定一个核心主题
4. **卷数理由**：说明为什么选择这个卷数（基于剧情需要）
5. **执行标准对齐**：卷数、每卷主题与阶段划分必须体现上述平台定位、故事基调、文风、网文流派、题材标签与叙事视角；不得给出与执行标准矛盾的结构

## 输出格式
输出合法JSON，不要markdown包裹：
{"analysis":{"storyComplexity":"简单/中等/复杂","recommendedVolumes":null,"reason":"根据叙事阶段得到卷数的理由"},"volumes":[{"volumeNumber":1,"theme":"卷主题","focus":"本卷重点","estimatedChapters":null,"chapterCountReason":"根据事件链密度与节奏得到章数的理由"}]}
输出时必须把 null 替换为按当前故事分析得到的正整数；数量必须有理由，禁止平均分配。`,
      variables: ['user_input.story_setting', 'user_input.targetWords', 'user_input.genre', 'user_input.chapterLimit', 'user_input.platform_directive'],
      isActive: true,
    });

    this.register({
      id: 'long-novel-volume-outline',
      name: '卷大纲生成',
      category: 'long-novel-outline',
      version: '1.0.0',
      description: '根据卷数规划生成每卷详细大纲',
      content: `你是一名资深网文大纲设计师，擅长为长篇网文设计灵活的分卷大纲。

## 平台与执行标准（最高优先级，必须先执行）
{{user_input.platform_directive}}

## 剧情分析结果
{{json chain_output.node_1_analysis}}

## 故事设定
{{user_input.story_setting}}

## 执行要求
1. **灵活拆分**：根据每卷主题，设计该卷的详细大纲（不要平均分配章节）
2. **章节数动态**：每卷章节数由本卷事件链、人物推进、冲突密度和呼吸节奏决定，不设固定区间，不平均分配
3. **卷内结构**：每卷应有起承转合（开头铺垫→发展→高潮→结尾钩子）
4. **卷间衔接**：每卷结尾应自然过渡到下一卷
5. **伏笔规划**：在大纲中标注关键伏笔的埋设位置和回收位置

## 输出格式
输出合法JSON，不要markdown包裹：
{"volumes":[{"volumeNumber":1,"title":"卷标题","theme":"主题","goal":"本卷目标","climaxDescription":"本卷高潮","estimatedChapters":1,"chapterCountReason":"本卷为什么需要这些章节","outline":"本卷详细大纲","keyEvents":["关键事件"],"foreshadowings":[{"item":"伏笔内容","setupChapter":null,"revealChapter":null}]}]}
输出时按实际情节替换 null：estimatedChapters 必须是按本卷事件链、人物推进与冲突密度得到的正整数，不得平均分配；伏笔的 setupChapter/revealChapter 在章纲确定后回填，此处可先为 null。
本节点只输出卷级结构，不输出 chapters 明细。
卷级 title/theme/outline/goal/climaxDescription/keyEvents 必须与上述平台定位、故事基调、文风、网文流派和题材标签一致。`,
      variables: ['chain_output.node_1_analysis', 'user_input.story_setting', 'user_input.platform_directive'],
      isActive: true,
    });

    this.register({
      id: 'long-novel-chapter-outline',
      name: '章纲生成',
      category: 'long-novel-outline',
      version: '2.0.0',
      description: '在已确定卷结构内生成指定批次的详细章纲（字段契约与落库、正文层一致）',
      content: `你是一名网文章纲设计师。你要在已确定的卷结构内，为本批次生成可直接落库、可直接生成正文的详细章纲。

## 平台与执行标准（最高优先级，必须先执行）
{{user_input.platform_directive}}

## 故事设定
{{user_input.story_setting}}

## 卷结构与剧情分析
{{json chain_output.node_2_volumes}}

## 本批次规模
- 章节上限：{{user_input.chapterLimit}}（可为空；非空时本批次总章数不得超过该值；为空时按第一卷可可靠规划的连续故事阶段生成，不套用固定章数）
- 单章字数区间：{{user_input.wordRangeText}}（targetWords 必须是落在此区间内的整数）

## 执行要求
1. **连续编号**：chapterNumber 从 1 开始连续编号，不得跳号；volumeNumber 必须来自上面的卷结构
2. **一章一事**：本章核心事件单一且可感知；不得概述、不得把多章内容压进一章
3. **字数按任务定**：targetWords 取该章任务所需字数并落在平台单章区间内，不得逐章平均分配；wordCountReason 必须说明为什么是这些字
4. **爽点与反转**：highlight 写本章爽点与高能记忆点；reversals 写本章递进反转（无则空数组）
5. **伏笔可回收**：foreshadowing 写本章埋设；foreshadowingRecovery 写本章回收；foreshadows 写结构化伏笔清单
6. **平台与标签对齐**：mood、conflict、content、hook 必须体现上述平台定位、故事基调、文风、网文流派与题材标签；hook 是本章结尾悬念
7. **视角一致**：第一人称作品必须在 content 与 characterActions 中体现“我”的所见所感
8. **chapterFunction 只能取以下之一**：opening、exposition、rising_action、conflict、climax、explosion、resolution、closing、cliffhanger、transition、breathing、charging
9. **goalArc 只能取以下之一**：crisis_resolve、accumulate_burst、foreshadow_recover、pave_climax、suppress_counter、mist_truth、probe_showdown
10. **场景可拍**：scenes 是本章场景列表（字符串数组，每项一个可感知的地点+事件）

## 输出格式
输出合法JSON，不要markdown包裹：
{"volumes":[{"volumeNumber":1,"chapters":[{"volumeNumber":1,"chapterNumber":1,"title":"章节标题","chapterFunction":"exposition","goalArc":"accumulate_burst","targetWords":3000,"wordCountReason":"为什么需要这些字","content":"本章详细大纲（核心事件、冲突、人物行动、场景、结尾钩子）","conflict":"核心冲突","mood":"基调/情绪","hook":"结尾钩子","foreshadowing":"本章埋设伏笔（无则空字符串）","foreshadowingRecovery":"本章回收伏笔（无则空字符串）","highlight":"爽点/高能记忆点","characterActions":"人物本章关键行动","scenes":["场景1"],"reversals":["递进反转"],"foreshadows":[{"item":"伏笔","type":"埋设"}]}]}]}`,
      variables: ['chain_output.node_2_volumes', 'user_input.story_setting', 'user_input.platform_directive', 'user_input.chapterLimit', 'user_input.wordRangeText'],
      isActive: true,
    });

    this.register({
      id: 'long-novel-main-skeleton',
      name: '长篇主线与结局骨架',
      category: 'long-novel-outline',
      version: '1.0.0',
      description: '依据确认题材与项目创作宪法确定主线、结局和分卷骨架',
      content: `你是长篇小说主线架构师。下列故事设定包含项目创作宪法及平台、分类、情绪氛围、文风、流派、视角、投稿标签和情节取向；全部必须落实到事件与人物行动，不得只抄入标签。
故事设定：{{user_input.story_setting}}
目标总字数：{{user_input.targetWords}}万字；分类：{{user_input.genre}}

先确定主角起点、核心矛盾、不可撤销的关键选择、阶段推进、结局与代价，再依照这些因果节点划分卷。卷数与章数由故事决定，不得平均分配或套用固定数量。每章按${CHAPTER_WORD_RANGE.min}-${CHAPTER_WORD_RANGE.max}字核对全书目标字数的可承载性。已选文风须落实为叙事单元与卷内结构；关系类标签须落实为具名人物、双方行动及关系变化；情节取向须落实为具体事件与代价。现实题材不得无依据添加穿越、修炼或超能力。

只输出合法 JSON 对象，包含：
{"coreSetting":{"title":"书名","type":"类型","coreSellingPoints":["具体卖点"],"targetReaders":"目标读者","setting":"故事背景","coreConflict":"不可调和的主线矛盾","protagonist":"具名主角与身份","initialDilemma":"开篇困境","wantMost":"长期目标","fearMost":"内心恐惧","antagonist":"阻碍力量","emotionalEnding":"结局情绪与代价","highConcept":"高概念","narrativeForm":"文风如何成为全书叙事单元","keyRelationships":"具名关系及变化事件","volumePlan":[{"volume":1,"theme":"阶段主题","goal":"阶段目标","conflict":"核心冲突","turningPoint":"人物变化","climax":"卷末高潮"}]},"skeletonVolumes":[{"volumeNumber":1,"title":"卷名","theme":"主题","description":"阶段目标与因果事件链","estimatedChapters":1,"chapterCountReason":"依据事件链、节奏及目标字数说明章数","narrativeFormExecution":"叙事形式如何落到本卷","relationshipEvent":"具名人物的关系行动"}]}
故事核心设定的每个文字字段至少20字，必须有具体因果与行动，不能以标签或空话占位。estimatedChapters 必须是根据剧情计算的正整数，chapterCountReason 必须解释每卷独立成卷及所需章数。不得在此阶段生成世界规则或详细章纲。`,
      variables: ['user_input.story_setting', 'user_input.targetWords', 'user_input.genre'],
      isActive: true,
    });

    this.register({
      id: 'long-novel-init-worldview',
      name: '长篇世界规则',
      category: 'long-novel-outline',
      version: '1.0.0',
      description: '严格依照已通过验收的主线与分卷骨架生成世界规则',
      content: `你是长篇小说世界规则架构师。主线与结局骨架已由上一阶段生成并验收；只能为它补充一致、可执行的世界规则，不得改写主角、关系、真相、分卷目标或结局。
项目设定与完整创作宪法：{{user_input.story_setting}}
分类：{{user_input.genre}}
已验收骨架：{{{json chain_output.node_1_skeleton}}}

依据骨架中的事件链与人物选择，定义必要的地点、社会结构、真实职业或超常能力边界、经济、文化、历史及势力。每个维度要说明它如何约束主线行动；现实题材不得凭空添加修炼与超能力。人物年龄、履历、年份、亲属关系及机构名称必须与骨架一致。每个维度应具体可核查，不得以抽象套话占位。

只输出合法 JSON：{"worldview":{"geography":[{"name":"地点名","description":"地点如何约束事件"}],"socialStructure":"阶层与制度","powerSystem":"能力或现实机制的来源、代价、边界","economy":"资源与利益分配","culture":"习俗与价值冲突","history":[{"date":"时间","event":"与主线相关的历史事件"}],"factions":[{"name":"势力名","description":"作用与边界","coreGoal":"目标","leader":"负责人"}]}}。每个世界维度至少30字，地理与势力条目必须有具名对象及具体作用。不得输出第二份主线或章纲。`,
      variables: ['user_input.story_setting', 'user_input.genre', 'chain_output.node_1_skeleton'],
      isActive: true,
    });
  }

  render(templateId: string, variables: Record<string, unknown>): string {
    if (!FIXED_TEMPLATE_IDS.has(templateId)) {
      throw new Error(`非固定生产模板已删除: ${templateId}`);
    }
    const entry = this.templates.get(templateId);
    if (!entry) throw new Error(`固定生产模板未找到: ${templateId}`);
    let compiled = this.compiledCache.get(templateId);
    if (!compiled) {
      compiled = Handlebars.compile(entry.content);
      this.compiledCache.set(templateId, compiled);
    }
    const rendered = compiled(variables);
    this.logger.debug(`模板 ${templateId} 渲染成功，输出长度: ${rendered.length}`);
    return rendered;
  }

  getTemplate(templateId: string): TemplateEntry | undefined {
    return FIXED_TEMPLATE_IDS.has(templateId) ? this.templates.get(templateId) : undefined;
  }

  getTemplatesByCategory(category: 'long-novel-outline'): TemplateEntry[] {
    return category === 'long-novel-outline' ? [...this.templates.values()] : [];
  }

  getAllActiveTemplates(): TemplateEntry[] {
    return [...this.templates.values()];
  }

  getTemplateVersions(templateId: string): Array<{ templateId: string; version: string }> | null {
    const entry = this.getTemplate(templateId);
    return entry ? [{ templateId: entry.id, version: entry.version }] : null;
  }

  private register(template: TemplateEntry): void {
    if (!FIXED_TEMPLATE_IDS.has(template.id)) {
      throw new Error(`禁止注册非固定生产模板: ${template.id}`);
    }
    this.templates.set(template.id, template);
    this.compiledCache.delete(template.id);
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('json', (obj: unknown, indent: number = 2) => JSON.stringify(obj, null, indent));
  }
}
