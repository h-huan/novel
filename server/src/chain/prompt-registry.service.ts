/**
 * 固定生产 Prompt 注册表。
 *
 * 这里只保留当前两条固定长篇生产链真实引用的 5 个模板。
 * 运行时新增/修改模板、旧灵感补全模板和平行提示词库均已删除，避免模型/对话切换后重新出现第二套流程。
 */
import { Injectable, Logger } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { CHAPTER_WORD_RANGE } from '../../shared/src';
import { chapterResponsibilityPlanningDirective } from '../../shared/src/chapter-responsibility-review';

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
6. **先编译章节职责，再展开内容**：${chapterResponsibilityPlanningDirective(false)}
按已注入QLT-003的行动—条件—结果判据，先核对每项exitState如何由本章责任实际实现；将必要动作与前置条件安排在responsibility/prerequisites中，而不是只写获救、落网、封停等结果。进入权限核对不能替代对结果成立条件的核对。
未确认精确起点钟表时，timeline优先使用已有的相对先后、时段和期限约束，不自行补出各章的精确小时数。确有来源或明确候选排期的数值，后续content与scenes中的同一动作必须沿用该时点，不能另写相互冲突的早晚或跨日；不得为数字标签另加正文解释。
以chapterResponsibilities列出本批次各章的职责、进入条件、结束状态和相对时间。只编译后续细纲要展开的近期连续窗口；章节上限非空时遵守该上限，长篇不一次穷举全书远期章节。先把核心事件的起点、已有期限、完成位置与完成后的后果分开；所有处在同一时限内的章节必须能沿一条累计时间线执行，不能每章重新开始计时。尚未获得的线索、权限、道具和人物配合必须在此前安排获得途径，或明确保留为本章需要解决的任务，不能在后章直接当作已有。prerequisites与exitState只编译本次候选，不覆盖已确认资料；期限依据缺失则写未知，不编造精确数值。每章的阶段回报须体现行动前后的局面改变，不只反复增加罚款或跑手续。

## 输出格式
输出合法JSON，不要markdown包裹：
{"analysis":{"storyComplexity":"简单/中等/复杂","recommendedVolumes":null,"reason":"根据叙事阶段得到卷数的理由"},"volumes":[{"volumeNumber":1,"theme":"卷主题","focus":"本卷重点","estimatedChapters":null,"chapterCountReason":"根据事件链密度与节奏得到章数的理由"}],"chapterResponsibilities":[{"chapter":1,"title":"候选章节","function":"章节职责","responsibility":"本章唯一推进任务","prerequisites":["来自已确认资料或前章出口的必要条件"],"timeline":"相对计时起点的位置；在同一累计期限内或在核心事件完成后","exitState":"本章结束时实际取得的事实、筹码与局面改变"}]}
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
6. **继承已编译职责**：前序chapterResponsibilities中的期限、进入条件和出口状态是本次规划的共同基线；本节点展开冲突与兑现，不重新安排相互矛盾的日期，不跳过必要条件的取得，不提前消费后章出口。若前序与已确认资料不兼容，明确指出双方依据，不用新增能力或延长期限掩盖。
7. **关键动作因果自检**：新增决定性动作前核对参与者位置、进入与离开条件、关键证据来源和动作先后；同一人在同一时点不能既被引出又被锁在原处。卷纲保留阶段目标、冲突和结果关系，尚未落实的战术条件交给后续细纲解决；不得靠手滑、巧合泄密或一句“完成反制”跳过取得关键证据与权限的必要路径。

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
【前序章节职责与累计状态】
{{json chain_output.node_1_analysis}}

【卷级展开】
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
11. **时间职责编译**：按已注入的 CTX-005、CTX-008，把故事中明确的总时间窗口、事件期限与前章状态落实到各章 timeline。先确定核心事件从哪一处开始计时、必须在哪一处前完成，再分配各章的相对位置；章纲中的“次日”“又过数天”等跨度必须能纳入同一条累计时间线。已到期核心事件之后的后果可以跨日，但须明确事件已完成，不能把收束阶段的跨度放进尚未结束的倒计时。仅编译已有依据，来源没有精确钟点或历时就保持相对关系，不补造秒数；content、scenes、characterActions 必须遵循同一 timeline。
12. **按前序职责接力**：逐章继承chapterResponsibilities的prerequisites、timeline和exitState，细化动作与场景，不独立重设起点、期限、能力或已取得证据。第N章用到的前章成果必须能定位到第N-1章或更早的出口；普通既有职业能力仍以已确认人物与世界资料为依据，不要求无关日常动作逐项登记。终局动作先后、参与者位置、关键工具与离场路径须可由这些条件成立，不能以一句“完成反制”跳过必要因果。
13. **关键场景状态核对**：按已注入ARCH-005/QLT-003，生成场景前沿进入—行动—结果—离开核对参与者位置、可用权限、关键物件的来源与保管状态，核对对手按既有能力反应时结果是否仍成立；不能把结果断言当成立条件。只把真正改变结果的交接或撤离动作写进场景，不另加解释段；物理物件与可共享的信息不能混作同一独占对象，已明确原件/唯一副本的条件须继承。相邻章交接发生在前章最后一个实际动作之后，同一时段可以包含先后事件，不为消除时段重叠编造精确钟点。

## 输出格式
输出合法JSON，不要markdown包裹：
{"volumes":[{"volumeNumber":1,"chapters":[{"volumeNumber":1,"chapterNumber":1,"title":"章节标题","chapterFunction":"exposition","goalArc":"accumulate_burst","targetWords":3000,"wordCountReason":"为什么需要这些字","timeline":"本章相对前章的位置、累计时间与已有期限；无数字依据时只写相对关系","content":"本章详细大纲（核心事件、冲突、人物行动、场景、结尾钩子）","conflict":"核心冲突","mood":"基调/情绪","hook":"结尾钩子","foreshadowing":"本章埋设伏笔（无则空字符串）","foreshadowingRecovery":"本章回收伏笔（无则空字符串）","highlight":"爽点/高能记忆点","characterActions":"人物本章关键行动","scenes":["场景1"],"reversals":["递进反转"],"foreshadows":[{"item":"伏笔","type":"埋设"}]}]}]}`,
      variables: ['chain_output.node_1_analysis', 'chain_output.node_2_volumes', 'user_input.story_setting', 'user_input.platform_directive', 'user_input.chapterLimit', 'user_input.wordRangeText'],
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
