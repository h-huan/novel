/**
 * Prompt 模板仓库服务
 *
 * 管理所有 Prompt 模板（JSON 格式），支持：
 * - 模板版本管理（语义版本）
 * - Handlebars 变量替换（{{title}}, {{characters}} 等）
 * - 模板分类检索
 * - 只注册「有真实消费者」的预置模板（清单与理由见 registerAllTemplates）
 *
 * 当前开发阶段模板内容硬编码在代码中，
 * 后续可迁移到数据库或文件系统中管理
 */
import { Injectable, Logger } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { CHAPTER_WORD_RANGE } from '../../shared/src';

// ==================== 模板版本管理 ====================

/** 模板版本信息 */
interface TemplateVersion {
  templateId: string;
  version: string;             // 语义版本 "1.0.0"
  changelog: string[];
  activeSince: string;
  deprecatedAt?: string;
  modelTestResults?: Record<string, { avgScore: number; sampleCount: number; lastTestedAt: string }>;
}

/** 模板条目 */
interface TemplateEntry {
  id: string;
  name: string;
  category: string;
  version: string;
  content: string;             // Handlebars 模板文本
  description: string;
  versions: TemplateVersion[]; // 版本历史
  variables: string[];         // 模板使用的变量列表（自动提取）
  isActive: boolean;
}

/** 模板分类 */
type TemplateCategory =
  // 灵感种子智能补全（角色/世界观/组织/地点）
  | 'inspiration-seed'
  // 长篇大纲（创建地基 + 剧情分析/分卷大纲/章纲）
  | 'long-novel-outline';

@Injectable()
export class PromptRegistryService {
  private readonly logger = new Logger(PromptRegistryService.name);

  /** 模板仓库 */
  private readonly templates: Map<string, TemplateEntry> = new Map();

  /** Handlebars 编译缓存 */
  private readonly compiledCache: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor() {
    this.registerAllTemplates();
    this.registerHelpers();
    this.logger.log(`PromptRegistry 初始化完成，已注册 ${this.templates.size} 个模板`);
  }

  // ==================== 模板注册 ====================

  /**
   * 注册所有预置模板
   *
   * 这里只保留「有真实消费者」的模板：调用点全部在 chain-template.service.ts，
   * 由 /chain/templates/execute/:id 进入。没有消费者的模板一律删除，不再保留
   * 「以后可能用得上」的平行提示词库 —— 历史上一份长篇流程在这里、另一份在
   * chain-template 里，两边口径不一致，生成结果自然对不上。
   */
  private registerAllTemplates(): void {
    // ==================== 灵感种子智能补全 (4个) ====================

    this.registerTemplate({
      id: 'seed-character-enrich',
      name: '角色深度补全',
      category: 'inspiration-seed',
      version: '1.1.0',
      description: '基于角色名+hook生成性格五维/背景/外貌/对话风格/动机弧线',
      content: `你是一名资深网文角色设计师，擅长为中国网络小说设计有弧光的立体角色。

## 角色设计铁律（必守）
1. **三要素缺一不可**：每个角色必须明确——想要什么（外部动机）、需要什么（内部动机）、害怕什么（致命缺陷）
2. **人物弧线**：不是"从A到B"的简单变化，而是具体事件触发→信念动摇→选择代价→新信念确立
3. **差异化**：不同角色的性格五维必须有明显数值落差（不能全在40-60中间地带）。同一角色内也要有对立面（如：外冷内热、精明但心软）
4. **钩子潜质**：每个角色的背景必须包含至少一个可后续展开的暗线——隐藏身份/未说出口的秘密/与他人的暗流关系/过去的创伤

## 灵感信息
- 钩子: {{user_input.hook}}
- 故事简介: {{user_input.description}}
- 角色名单: {{#each user_input.characters}}{{this}}{{#unless @last}}、{{/unless}}{{/each}}

## 执行要求
1. 为每个角色生成完整的性格五维(0-100，须有明显高低落差)、背景故事、外貌、对话风格和口头禅
2. 第一个角色(POV视角)的background应直接呼应hook中的核心冲突，且要写明其人物弧线起点
3. dialoguePatterns给出2-4个具体口头禅或说话习惯，必须能通过对话识别说话人
4. 每个角色配置一个独特的小习惯或身体细节（紧张时摸耳垂/走路数步数/从不接电话只发文字/笑的时候先眯左眼）
5. 背景故事中必须包含"伤口"——这个角色过去经历了什么，导致他现在的核心恐惧或信念
6. **字数要求**：每个角色的background不少于150字，appearance不少于30字

## 输出格式
输出合法JSON，不要markdown包裹:
{"characters":[{"name":"角色名","personality":{"extraversion":50,"agreeableness":50,"conscientiousness":50,"neuroticism":50,"openness":50},"background":"背景故事(含钩子潜质+伤口+人物弧线起点)","appearance":"外貌特征(含独特细节)","dialogueStyle":"对话风格","dialoguePatterns":["口头禅1","口头禅2"]}]}`,
      versions: [
        { templateId: 'seed-character-enrich', version: '1.0.0', changelog: ['初始版本，灵感种子智能补全'], activeSince: '2026-06-21' },
        { templateId: 'seed-character-enrich', version: '1.1.0', changelog: ['增强角色设计铁律、人物弧线要求、伤口设定、差异化约束'], activeSince: '2026-07-26' },
      ],
      variables: ['user_input.hook', 'user_input.description', 'user_input.characters'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'seed-worldview-enrich',
      name: '世界观补全',
      category: 'inspiration-seed',
      version: '1.1.0',
      description: '基于setting+hook生成地理/历史/规则/势力格局（增强版）',
      content: `你是一名资深网文世界观架构师，擅长为中国网络文学构建沉浸式且自洽的世界观。

## 世界观设计铁律（必守）
1. **核心矛盾优先**：先确定世界的核心冲突（王朝末路/异族入侵/权力真空/资源枯竭），所有设定围绕这个矛盾展开
2. **约束即创意**：每个世界必须有不可违背的硬约束和可以打破的软约束。硬约束制造张力，软约束提供破局可能
3. **具象不抽象**：不写"资源匮乏"，写"矿脉三年前枯竭，连铁钉都要从邻国运"；不写"民不聊生"，写一个具体的、只有这个世界才会发生的场景片段
4. **钩子埋设**：geography/history/rules中各至少埋一处可后续展开的暗线——禁地/禁忌/历史悬案/规则漏洞/隐藏势力

## 灵感信息
- 钩子: {{user_input.hook}}
- 故事简介: {{user_input.description}}
- 世界观种子: {{user_input.setting}}

## 执行要求
1. 基于setting种子补全完整的地理环境、历史背景、社会规则、势力格局
2. 如果setting为空或极简，根据hook推断最合理的架空/现实背景
3. 每个维度必须以具体细节支撑——名字、数字、事件片段，拒绝空泛概括
4. constraints给出4-6条约束：2-3条硬约束（severity:hard，不可打破）+ 2-3条软约束（severity:soft，可打破但有代价）
5. 历史背景必须包含一个"决定性事件"——这个事件塑造了当今世界的格局
6. 势力格局不能只列名字，要写明各势力之间的利益冲突点和可能的联盟/背叛线

## 输出格式
输出合法JSON，不要markdown包裹:
{"name":"世界观名","era":"时代背景","geography":"地理环境(含钩子，不少于150字)","history":"历史背景(含决定性事件和钩子，不少于150字)","rules":"社会/力量规则(含钩子，不少于100字)","factionLayout":"势力格局概述(含冲突线，不少于100字)","constraints":[{"category":"分类","rule":"规则","description":"说明","severity":"hard/soft"}]}`,
      versions: [
        { templateId: 'seed-worldview-enrich', version: '1.0.0', changelog: ['初始版本，灵感种子智能补全'], activeSince: '2026-06-21' },
        { templateId: 'seed-worldview-enrich', version: '1.1.0', changelog: ['增强设计铁律、具象要求、字数约束、架空历史专项'], activeSince: '2026-07-26' },
      ],
      variables: ['user_input.hook', 'user_input.description', 'user_input.setting'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'seed-organization-gen',
      name: '组织/势力生成',
      category: 'inspiration-seed',
      version: '1.1.0',
      description: '基于世界观生成3-5个主要势力（增强版）',
      content: `你是一名网文势力设计专家。基于以下世界观，生成3-5个主要势力/组织。

## 势力设计铁律（必守）
1. **冲突驱动**：每个势力必须有其核心利益和与其他势力的冲突点。没有冲突就没有戏剧张力
2. **内部矛盾**：每个势力内部要有暗流——派系/野心家/隐藏目的。纯粹团结的势力是平面的
3. **与主角关联**：至少一个势力与hook中的核心冲突有直接关联——是主角的盟友/敌人/摇摆方

## 世界观设定
{{json chain_output.node_2_worldview}}

## 执行要求
1. 生成3-5个组织，type必须从以下枚举中选择(小写):
   - regime: 政权/朝廷/政府
   - faction: 派系/势力
   - army: 军队/武装力量
   - sect: 门派/宗派/学院
   - camp: 阵营/联盟
   - organization: 组织/机构/公司
   - other: 其他
2. 每个组织的description不少于80字，必须包含：核心利益、与其他势力的冲突点、内部的暗流（一人/一派可能有隐藏目的）
3. 组织之间的关系要形成"三角博弈"或"多方对峙"格局——不能是简单的二元对立

## 输出格式
输出合法JSON，不要markdown包裹:
{"organizations":[{"name":"组织名","type":"regime","description":"组织描述(含核心利益+冲突点+内部暗流，不少于80字)"}]}`,
      versions: [
        { templateId: 'seed-organization-gen', version: '1.0.0', changelog: ['初始版本，灵感种子智能补全'], activeSince: '2026-06-21' },
        { templateId: 'seed-organization-gen', version: '1.1.0', changelog: ['增至3-5个势力、加入势力设计铁律、三角博弈要求'], activeSince: '2026-07-26' },
      ],
      variables: ['chain_output.node_2_worldview'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'seed-location-gen',
      name: '地点生成',
      category: 'inspiration-seed',
      version: '1.1.0',
      description: '长篇按6层层级/短篇简化生成地点（增强版）',
      content: `你是一名网文地图设计师。基于世界观生成故事地点，每个地点必须有"故事感"。

## 地点设计铁律（必守）
1. **场景即冲突**：每个重要地点应该天然带有冲突潜质——狭窄的巷子适合伏击、开阔的广场适合公开对决、密闭的房间适合秘密谈话
2. **层级递进**：长篇从小地图逐步展开（新手村→城镇→都城→世界），每次展开都是一次信息增量
3. **感官描述**：每个地点的description至少包含一种感官细节（气味/声音/温度/触感），让读者"身临其境"

## 世界观设定
{{json chain_output.node_2_worldview}}

## 篇幅类型
{{#if user_input.isLong}}长篇(按6层层级: world→region→country→city→location→scene，生成8-15个地点){{else}}短篇(简化为1-2层，生成3-5个location/scene级地点){{/if}}

## 执行要求
1. 每个地点的description不少于50字，必须包含"场景冲突潜质"——能发生什么类型的关键剧情
2. 至少2个地点带有"钩子潜质"——隐藏的密室/废弃的遗迹/看似普通却暗藏玄机的地方
3. level必须从以下枚举中选择(小写): world / region / country / city / location / scene
4. 长篇: parentId填父级地点name(如"并州城"的parentId为"中原")
5. 短篇: 只生成location/scene级，不需要parentId
6. 地点命名要符合世界观基调——古代架空用古代地名风格，现代都市用现代地名风格

## 输出格式
输出合法JSON，不要markdown包裹:
{"locations":[{"name":"地点名","level":"world","parentId":"父地点名(短篇不需要)","description":"地点描述(含场景冲突潜质+感官细节，不少于50字)"}]}`,
      versions: [
        { templateId: 'seed-location-gen', version: '1.0.0', changelog: ['初始版本，灵感种子智能补全'], activeSince: '2026-06-21' },
        { templateId: 'seed-location-gen', version: '1.1.0', changelog: ['加入地点设计铁律、场景冲突潜质、感官描述要求、命名风格约束'], activeSince: '2026-07-26' },
      ],
      variables: ['chain_output.node_2_worldview', 'user_input.isLong'],
      isActive: true,
    });

    // ==================== 长篇灵活大纲 (3个) ====================

    this.registerTemplate({
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
3. **每卷主题**：为每卷确定一个核心主题（如"初入江湖"、"真相浮现"、"最终决战"）
4. **卷数理由**：说明为什么选择这个卷数（基于剧情需要）
5. **执行标准对齐**：卷数、每卷主题与阶段划分必须体现上述平台定位、故事基调、文风、网文流派、题材标签与叙事视角；不得给出与执行标准矛盾的结构

## 输出格式
输出合法JSON，不要markdown包裹：
{"analysis":{"storyComplexity":"简单/中等/复杂","recommendedVolumes":null,"reason":"根据叙事阶段得到卷数的理由"},"volumes":[{"volumeNumber":1,"theme":"卷主题","focus":"本卷重点","estimatedChapters":null,"chapterCountReason":"根据事件链密度与节奏得到章数的理由"}]}
输出时必须把 null 替换为按当前故事分析得到的正整数；数量必须有理由，禁止平均分配。`,
      versions: [
        { templateId: 'long-novel-story-analysis', version: '1.0.0', changelog: ['初始版本，长篇灵活大纲'], activeSince: '2026-06-22' },
      ],
      variables: ['user_input.story_setting', 'user_input.targetWords', 'user_input.genre', 'user_input.chapterLimit'],
      isActive: true,
    });

    this.registerTemplate({
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
输出时按实际情节替换 null：estimatedChapters 必须是按本卷事件链、人物推进与冲突密度得到的正整数，不得平均分配；
伏笔的 setupChapter/revealChapter 在章纲确定后回填，此处可先为 null。
本节点只输出卷级结构，不输出 chapters 明细。
卷级 title/theme/outline/goal/climaxDescription/keyEvents 必须与上述平台定位、故事基调、文风、网文流派和题材标签一致。`,
      versions: [
        { templateId: 'long-novel-volume-outline', version: '1.0.0', changelog: ['初始版本，长篇灵活大纲'], activeSince: '2026-06-22' },
      ],
      variables: ['chain_output.node_1_analysis', 'user_input.story_setting'],
      isActive: true,
    });

    this.registerTemplate({
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
4. **爽点与反转**：highlight 写本章爽点与高能记忆点（2-3个，混合至少2类：打脸/逆袭/热血名场面/反转冲击/情感暴击/信息爆点）；reversals 写本章递进反转（无则空数组）
5. **伏笔可回收**：foreshadowing 写本章埋设（无则空字符串）；foreshadowingRecovery 写本章回收（无则空字符串）；foreshadows 写结构化伏笔清单
6. **平台与标签对齐**：mood（基调）、conflict、content、hook 必须体现上述平台定位、故事基调、文风、网文流派与题材标签；hook 是本章结尾悬念
7. **视角一致**：第一人称作品必须在 content 与 characterActions 中体现“我”的所见所感
8. **chapterFunction 只能取以下之一**：opening、exposition、rising_action、conflict、climax、explosion、resolution、closing、cliffhanger、transition、breathing、charging
9. **goalArc 只能取以下之一**：crisis_resolve、accumulate_burst、foreshadow_recover、pave_climax、suppress_counter、mist_truth、probe_showdown
10. **场景可拍**：scenes 是本章场景列表（字符串数组，每项一个可感知的地点+事件）

## 输出格式
输出合法JSON，不要markdown包裹：
{"volumes":[{"volumeNumber":1,"chapters":[{"volumeNumber":1,"chapterNumber":1,"title":"章节标题","chapterFunction":"exposition","goalArc":"accumulate_burst","targetWords":3000,"wordCountReason":"为什么需要这些字","content":"本章详细大纲（150-300字：核心事件、冲突、人物行动、场景、结尾钩子）","conflict":"核心冲突","mood":"基调/情绪","hook":"结尾钩子","foreshadowing":"本章埋设伏笔（无则空字符串）","foreshadowingRecovery":"本章回收伏笔（无则空字符串）","highlight":"爽点/高能记忆点","characterActions":"人物本章关键行动","scenes":["场景1"],"reversals":["递进反转"],"foreshadows":[{"item":"伏笔","type":"埋设"}]}]}]}`,
      versions: [
        { templateId: 'long-novel-chapter-outline', version: '2.0.0', changelog: ['初始版本，长篇灵活大纲', 'v2.0.0：注入平台/分类/基调/文风/流派/视角六维执行标准（含题材标签），补齐可落库字段契约，targetWords 必须落在共享单章字数区间'], activeSince: '2026-06-22' },
      ],
      variables: ['chain_output.node_2_volumes'],
      isActive: true,
    });

    // 长篇地基分两次模型调用。这里曾有一份同时生成骨架与世界观的提示词，
    // 后果是世界规则没有经过验收的主线可依赖；旧模板已删除，链节点只引用以下两份阶段提示词。
    this.registerTemplate({
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
      versions: [{ templateId: 'long-novel-main-skeleton', version: '1.0.0', changelog: ['先于世界规则生成并验收主线与结局骨架'], activeSince: '2026-09-25' }],
      variables: ['user_input.story_setting', 'user_input.targetWords', 'user_input.genre'],
      isActive: true,
    });
    this.registerTemplate({
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
      versions: [{ templateId: 'long-novel-init-worldview', version: '1.0.0', changelog: ['以已验收主线为唯一输入生成世界规则'], activeSince: '2026-09-25' }],
      variables: ['user_input.story_setting', 'user_input.genre', 'chain_output.node_1_skeleton'],
      isActive: true,
    });

    // ⚠️ 防复发：原先这里还挂着一整套「长篇小说创作全流程」提示词库（Phase1-4 准备/规划/创作/完善、
    // 发布策略、读者互动、常见问题、案例分析、写作工具、质量门禁、周月复盘、参考样章），共 23 个模板。
    // 它们没有任何消费者，且与 chain-template.service.ts 里真正在跑的长篇流程重复 —— 两套并存时，
    // 改一边不改另一边，就会出现「配置改了但生成没变」的假修复。已全部删除，不要再往这里加平行流程。
  }

  // ==================== 公共 API ====================

  /**
   * 根据模板 ID 获取渲染后的 Prompt
   * @param templateId 模板 ID
   * @param variables 变量对象
   * @returns 渲染后的 Prompt 文本
   */
  render(templateId: string, variables: Record<string, unknown>): string {
    const entry = this.templates.get(templateId);
    if (!entry) {
      throw new Error(`模板未找到: ${templateId}`);
    }

    // 从缓存获取编译后的模板
    let compiled = this.compiledCache.get(templateId);
    if (!compiled) {
      compiled = Handlebars.compile(entry.content);
      this.compiledCache.set(templateId, compiled);
    }

    try {
      const rendered = compiled(variables);
      this.logger.debug(`模板 ${templateId} 渲染成功，输出长度: ${rendered.length}`);
      return rendered;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`模板 ${templateId} 渲染失败: ${msg}`);
      throw new Error(`模板渲染失败 [${templateId}]: ${msg}`);
    }
  }

  /**
   * 获取模板信息
   */
  getTemplate(templateId: string): TemplateEntry | undefined {
    return this.templates.get(templateId);
  }

  /**
   * 按分类获取模板列表
   */
  getTemplatesByCategory(category: TemplateCategory): TemplateEntry[] {
    const result: TemplateEntry[] = [];
    for (const entry of this.templates.values()) {
      if (entry.category === category && entry.isActive) {
        result.push(entry);
      }
    }
    return result;
  }

  /**
   * 获取所有活跃模板
   */
  getAllActiveTemplates(): TemplateEntry[] {
    return Array.from(this.templates.values()).filter((t) => t.isActive);
  }

  /**
   * 获取模板版本历史
   */
  getTemplateVersions(templateId: string): TemplateVersion[] | null {
    const entry = this.templates.get(templateId);
    return entry ? entry.versions : null;
  }

  /**
   * 注册自定义模板（运行时添加）
   */
  registerTemplate(template: TemplateEntry): void {
    // 自动提取模板中的变量
    const variables = this.extractVariables(template.content);
    template.variables = variables;

    this.templates.set(template.id, template);

    // 清空编译缓存
    this.compiledCache.delete(template.id);

    this.logger.log(`注册模板: ${template.id} v${template.version}`);
  }

  // ==================== 私有方法 ====================

  /**
   * 从模板内容中提取 Handlebars 变量
   */
  private extractVariables(content: string): string[] {
    const varRegex = /\{\{([#/]?[a-zA-Z0-9_.]+)\}\}/g;
    const matches = new Set<string>();
    let match;

    while ((match = varRegex.exec(content)) !== null) {
      const varName = match[1];
      // 过滤 Handlebars 内置关键字
      if (!varName.startsWith('#') && !varName.startsWith('/') && !varName.startsWith('each') && !varName.startsWith('if') && !varName.startsWith('json') && varName !== 'else') {
        matches.add(varName);
      }
    }

    return Array.from(matches);
  }

  /**
   * 注册 Handlebars 自定义 Helper
   */
  private registerHelpers(): void {
    // json 格式化
    Handlebars.registerHelper('json', (obj: unknown, indent: number = 2) => {
      return JSON.stringify(obj, null, indent);
    });

    // 文本截断
    Handlebars.registerHelper('truncate', (str: string, len: number) => {
      return str && str.length > len ? str.slice(0, len) + '...' : str;
    });

    // 中文字数统计
    Handlebars.registerHelper('wordCount', (str: string) => {
      return (str || '').replace(/\s/g, '').length;
    });

    // 加法
    Handlebars.registerHelper('add', (a: number, b: number) => {
      return a + b;
    });

    // 角色列表格式化
    Handlebars.registerHelper('characterRoster', (chars: Array<{ name: string; surfaceIdentity?: string; status?: string; motivation?: string }>) => {
      if (!chars || chars.length === 0) return '无特殊角色';
      return chars
        .map(
          (c) =>
            `【${c.name}】${c.surfaceIdentity || ''} | 状态:${c.status || '正常'} | 动机:${c.motivation || '未知'}`,
        )
        .join('\n');
    });
  }
}
