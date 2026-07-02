/**
 * Prompt 模板仓库服务
 *
 * 管理所有 Prompt 模板（JSON 格式），支持：
 * - 模板版本管理（语义版本）
 * - Handlebars 变量替换（{{title}}, {{characters}} 等）
 * - 模板分类检索
 * - 预置短篇三步骤全套模板和天龙8步法模板
 *
 * 当前开发阶段模板内容硬编码在代码中，
 * 后续可迁移到数据库或文件系统中管理
 */
import { Injectable, Logger } from '@nestjs/common';
import * as Handlebars from 'handlebars';

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
  // 短篇三步骤
  | 'short-story-stage3'
  | 'tianlong-8step'
  // 长篇四阶段
  | 'long-novel-phase1'    // 前期准备
  | 'long-novel-phase2'    // 详细规划
  | 'long-novel-phase3'    // AI创作执行
  | 'long-novel-phase4'    // 后期完善
  | 'long-novel-outline'   // 长篇大纲（旧版，保留兼容）
  // 发布与互动
  | 'long-novel-publishing'
  | 'long-novel-problem-solving'
  | 'long-novel-case-study'
  | 'long-novel-tools'
  | 'long-novel-quality'
  | 'long-novel-review'
  | 'long-novel-reference'
  // 其他分类
  | 'styles'
  | 'attachments'
  | 'inspiration-seed'
  | 'polish'
  | 'sensitive'
  | 'shared';

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
   * 从短故事三步骤.md 完整提取
   */
  private registerAllTemplates(): void {
    // ---- 阶段一：题材生成 (5个) ----
    this.registerTemplate({
      id: 'tianlong-step1-goal',
      name: '天龙8步-目标',
      category: 'tianlong-8step',
      version: '1.0.0',
      description: '设定本章主角目标',
      content: `现在进入正文创作阶段。

你是一名成熟的第一人称网络短篇小说写手。

## 当前上下文
### 故事总设定
{{json chain_output.outline.coreSetting}}

### 前文摘要
{{chain_output.context.previousChapterSummary}}

### 当前章节
第{{chain_output.context.chapterNumber}}章

### 当前章节大纲
{{chain_output.context.chapterOutline}}

### 本章剧情功能
{{chain_output.context.chapterFunction}}

### 出场角色
{{characterRoster chain_output.context.activeCharacters}}

## 第一步：目标设定

在本章开头，"我"必须有一个明确目标。

请设定本章主角的目标：
{
  "protagonist": "我",
  "goal": "本章开头主角要达成什么目标",
  "motivation": "为什么要达成这个目标",
  "winCondition": "怎样才算完成目标"
}

**写作要求：**
- 目标必须从上一章结尾自然延伸
- 目标要具体、可行动
- 匹配角色当前状态和动机
- 故事必须发生在中国，场景要有中国现实生活细节——写到具体物件：小区门禁的磁卡声、物业群里的@所有人、派出所走廊的消毒水味、医院缴费窗口的排队栏杆、外卖柜的取件码短信、微信群里的撤回提示
- 开头直接进入事件，不要铺垫天气、背景、自我介绍——第一句就出现冲突或异常
- 每300字左右必须出现一次新疑点、冲突或信息变化——不让读者有"可以放下手机"的间隙
- 语言适合手机阅读：段落短（≤3句），节奏快，多用动作和对话驱动剧情
- 不要提前泄露最终真相——主角和读者应该同步发现信息
- **去AI味**：避免"内心深处""不禁""仿佛""似乎"等AI高频词；不要用排比句/对仗句；句式长短交错，制造断裂感和意外停顿
- **具体胜过抽象**：用五感细节（看到了什么颜色/形状，听到了什么声音，闻到了什么气味）代替"紧张""不安"等抽象形容词
- **角色要有差异**：不同角色说话方式不同（有人啰嗦有人寡言），小动作不同（有人摸鼻子有人转笔），对同一件事的反应不同
- **不完整才有余味**：不要把所有信息都说完。用一句没说完的话、一个反常的沉默、一个被忽略的物件来暗示，让读者自己去想`,
      versions: [
        { templateId: 'tianlong-step1-goal', version: '1.0.0', changelog: ['初始版本，基于短故事三步骤.md天龙8步目标'], activeSince: '2026-01-01' },
      ],
      variables: ['chain_output.outline.coreSetting', 'chain_output.context.previousChapterSummary', 'chain_output.context.chapterNumber', 'chain_output.context.chapterOutline', 'chain_output.context.chapterFunction', 'chain_output.context.activeCharacters'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'tianlong-step2-trigger',
      name: '天龙8步-诱因',
      category: 'tianlong-8step',
      version: '1.0.0',
      description: '设计刺激主角行动的事件',
      content: `## 第二步：诱因

基于以下目标，设计一个刺激"我"行动的事件。

### 本章目标
{{json chain_output.node_1}}

### 执行要求
- 这个事件必须具体、突然、有压迫感
- 不能只是"我突然想到"
- 诱因要打破主角的常规状态
- 用具体感官细节来呈现：一个电话响了多久才接、一条短信的几个错别字、窗外突然停下的脚步声——而不是"我感到不安"
- 让诱因自带"不对劲"的质感，但不解释为什么不对劲

### 输出格式
{
  "triggerEvent": "触发事件描述",
  "triggerMethod": "触发方式，如意外发现/电话/短信/目击异常/他人介入",
  "urgency": "紧急程度，高/中/低"
}`,
      versions: [
        { templateId: 'tianlong-step2-trigger', version: '1.0.0', changelog: ['初始版本，基于短故事三步骤.md天龙8步诱因'], activeSince: '2026-01-01' },
      ],
      variables: ['chain_output.node_1'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'tianlong-step3-action',
      name: '天龙8步-行动',
      category: 'tianlong-8step',
      version: '1.0.0',
      description: '描写主角的具体行动',
      content: `## 第三步：行动

"我"必须采取具体行动。

### 诱因
{{json chain_output.node_2}}

### 本章目标
{{json chain_output.node_1.goal}}

### 执行要求
- 要写动作、对话、试探、调查、撒谎、反击、交易、逃跑等
- 主角不能只在心里想
- 多写动作、对话、现场细节，少写空泛心理总结
- 语言适合手机阅读，段落短，节奏快
- 对话要短、有压迫感，不能解释过多
- **去AI味**：对话不要用"他说道""她解释道"等标签；用动作代替——他说了一半停下来点烟，她笑了笑没接话；角色说错话、说半截话、被突然打断才是真实的
- **角色差异**：每个角色有独特的说话方式——有人每句话带"那个"，有人从来不直接回答问题，有人总在别人说完后沉默两秒才开口
- **具体/五感**：至少2处可感知细节——温度、气味、光线、声音。不要写"办公室很压抑"，写"空调出风口嗡嗡响，没人关，也没人抬头"
- **留白**：至少1处不说完整——一句被打断的对话、一个主角看到了但没追问的细节、一个反常的安静

### 输出
直接输出正文片段（600~1000字），第一人称"我"。`,
      versions: [
        { templateId: 'tianlong-step3-action', version: '1.0.0', changelog: ['初始版本，基于短故事三步骤.md天龙8步行动'], activeSince: '2026-01-01' },
      ],
      variables: ['chain_output.node_1', 'chain_output.node_2'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'tianlong-step4-obstacle',
      name: '天龙8步-阻碍',
      category: 'tianlong-8step',
      version: '1.0.0',
      description: '设计主角行动遇到的阻碍',
      content: `## 第四步：阻碍

行动必须遇到阻碍。

### 行动文本
{{chain_output.node_3}}

### 执行要求
- 阻碍可以来自人、规则、环境、舆论、监控、亲情、制度、时间限制、身体伤害等
- 阻碍要合理且有张力，不能是强行制造困难
- 思考主角的反应——是正面硬刚、迂回策略还是暂时撤退
- 最好的阻碍来自角色自身的局限：性格缺陷、知识盲区、过往创伤——不是外部强加的困难，而是角色自己绊倒自己
- 不要写"他感到很沮丧"，写他重复按了三下打火机没点着，然后把烟放回了口袋

### 输出格式
{
  "obstacleType": "阻碍类型",
  "description": "阻碍的详细描述",
  "protagonistReaction": "主角的反应"
}`,
      versions: [
        { templateId: 'tianlong-step4-obstacle', version: '1.0.0', changelog: ['初始版本，基于短故事三步骤.md天龙8步阻碍'], activeSince: '2026-01-01' },
      ],
      variables: ['chain_output.node_3'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'tianlong-step5-misjudge',
      name: '天龙8步-误判',
      category: 'tianlong-8step',
      version: '1.0.0',
      description: '设计主角的误判',
      content: `## 第五步：误判

"我"根据已有信息做出一个看似合理但错误的判断。

### 本章背景
目标：{{chain_output.node_1.goal}}
诱因：{{chain_output.node_2.triggerEvent}}
行动：{{chain_output.node_3}}
阻碍：{{chain_output.node_4.description}}

### 执行要求
- 误判要能推动剧情，而不是单纯降智
- 误判必须基于前文已有的信息（角色知道什么）
- 误判的后果需要体现
- 最好的误判来自角色自己深信不疑的偏见——他看到了几个碎片信息，拼出了一个合理的假象。不要急于告诉读者真相，让他们比主角多知道一点，或少知道一点，在信息差中产生紧张

### 输出格式
{
  "protagonistThinks": "主角认为的真相",
  "actualTruth": "实际真相",
  "infoGapSource": "信息差的来源",
  "consequenceOfMisjudgment": "误判将导致的后果"
}`,
      versions: [
        { templateId: 'tianlong-step5-misjudge', version: '1.0.0', changelog: ['初始版本，基于短故事三步骤.md天龙8步误判'], activeSince: '2026-01-01' },
      ],
      variables: ['chain_output.node_1', 'chain_output.node_2', 'chain_output.node_3', 'chain_output.node_4'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'tianlong-step6-reversal',
      name: '天龙8步-反转',
      category: 'tianlong-8step',
      version: '1.0.0',
      description: '设计本章的信息反转或局势反转',
      content: `## 第六步：反转（本章核心高潮）

本章必须出现一个信息反转或局势反转。

### 背景信息
目标：{{chain_output.node_1.goal}}
诱因：{{chain_output.node_2.triggerEvent}}
行动：{{chain_output.node_3}}
阻碍：{{chain_output.node_4.description}}
误判：{{chain_output.node_5.protagonistThinks}} → {{chain_output.node_5.actualTruth}}

### 执行要求
- 反转不一定是终极真相，但必须改变当前局面
- 反转要和前文细节有关，不能凭空出现
- 反转要有冲击力，让读者意外但觉得合理
- 严禁使用"做梦""精神病""系统强行解释"等廉价反转
- 反转的冲击力不在"声光电"，而在一个细节突然被重新照亮——前文随手提到的一个眼神、一个没接的电话、一句被你忽略的对话，此刻突然有了完全不同的含义。让读者倒回去重读才有滋味
- 不同角色的反应必须不同：有人愣住、有人冷笑、有人第一反应是看手机、有人转身就走——每个反应暴露各自的性格和立场
- 至少一处不写满——主角发现真相后没说出口的那句话、一个没被追问的疑点、一个对方刻意避开的回答
### 输出格式
{
  "reversalType": "反转类型，如身份反转/动机反转/局势反转/信息反转",
  "reversalMoment": "反转时刻的详细描写（400~800字），第一人称",
  "reactions": "各方反应"
}`,
      versions: [
        { templateId: 'tianlong-step6-reversal', version: '1.0.0', changelog: ['初始版本，基于短故事三步骤.md天龙8步反转'], activeSince: '2026-01-01' },
      ],
      variables: ['chain_output.node_1', 'chain_output.node_2', 'chain_output.node_3', 'chain_output.node_4', 'chain_output.node_5'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'tianlong-step7-cost',
      name: '天龙8步-代价',
      category: 'tianlong-8step',
      version: '1.0.0',
      description: '描述反转后主角付出的代价',
      content: `## 第七步：代价

反转之后，"我"必须付出代价。

### 反转详情
{{json chain_output.node_6}}

### 执行要求
- 代价可以是暴露身份、失去证据、被亲人背叛、被警方怀疑、被公司开除、被困住、被威胁、失去信任等
- 代价必须与反转匹配，不能过于轻巧
- 描写200~400字
- 代价的痛感不在"大"，而在"真"——丢了一把用了十年的钥匙比破产更让人心疼，只要那把钥匙上有只有自己知道的故事。用具体的、私人的、无法替代的损失来呈现代价
- 写"他后悔了"不如写"他在手机上打出对不起三个字，删了，又打，最后锁屏"——用动作替代心理
- 不同角色对主角付出代价的反应要有差别：有人假装没看见、有人说风凉话、有人沉默地多做了你的那份工作

### 输出格式
{
  "costType": "代价类型",
  "description": "代价的详细描写（200~400字），第一人称",
  "subsequentImpact": "对后续剧情的影响"
}`,
      versions: [
        { templateId: 'tianlong-step7-cost', version: '1.0.0', changelog: ['初始版本，基于短故事三步骤.md天龙8步代价'], activeSince: '2026-01-01' },
      ],
      variables: ['chain_output.node_6'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'tianlong-step8-hook',
      name: '天龙8步-钩子',
      category: 'tianlong-8step',
      version: '1.0.0',
      description: '设计本章结尾的强钩子',
      content: `## 第八步：钩子

本章最后必须留下强钩子。

### 本章剧情
目标：{{chain_output.node_1.goal}}
诱因：{{chain_output.node_2.triggerEvent}}
反转：{{chain_output.node_6.reversalType}}
代价：{{chain_output.node_7.costType}}

### 执行要求
- 钩子可以是一句话、一个物件、一个电话、一段监控、一个反常行为、一个身份暴露
- 结尾要让读者想继续看下一章
- 钩子要自然，不能生硬
- 最好的钩子不是惊叹号，而是逗号——一个没说完的句子，一个正在发生但还没被理解的动作，一个主角看见了但还没反应过来的细节。它的力量在"延迟理解"，不在"当场惊吓"

### 输出格式
{
  "hookType": "钩子类型，如物件钩子/对话钩子/动作钩子/情绪钩子/悬念钩子",
  "hookText": "钩子文本，第一人称",
  "nextChapterDirection": "下章衔接方向"
}`,
      versions: [
        { templateId: 'tianlong-step8-hook', version: '1.0.0', changelog: ['初始版本，基于短故事三步骤.md天龙8步钩子'], activeSince: '2026-01-01' },
      ],
      variables: ['chain_output.node_1', 'chain_output.node_2', 'chain_output.node_6', 'chain_output.node_7'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'tianlong-chapter-qa',
      name: '章节质检',
      category: 'tianlong-8step',
      version: '1.0.0',
      description: '生成章节的质量检查报告',
      content: `请以网络短篇编辑身份审查以下正文。

## 章节大纲
{{chain_output.context.chapterOutline}}

## 完整正文
{{chain_output.node_9}}

## 审查维度
请从以下12个维度审查，每项0-10分：
1. 开头钩子（前300字是否出现强异常，而非铺垫）
2. 大纲吻合度（是否按章节大纲推进）
3. 角色一致性（角色行为是否OOC）
4. 角色差异性（不同角色是否有不同的说话方式、小动作、思维习惯）
5. 反转质量（反转是否与前文伏笔有关，是否避免廉价反转）
6. AI痕迹指数（0-100，越低越好）——重点检查：排比句/对仗句、"内心深处/不禁/仿佛/似乎"等AI高频词、过度完整的解释性叙述、均匀的句长和段落
7. 情绪冲击力/热血感
8. 章节结尾吸引力（是否有强钩子，钩子是否自然不刻意）
9. 手机阅读适配（段落是否短、节奏是否快）
10. 中国场景真实感（场景是否有中国现实生活细节）
11. 具体质感（是否用五感细节代替抽象形容词，描写是否可触摸）
12. 版权风险检测

## 输出格式
{
  "passed": true/false,
  "overallScore": 综合评分0-10,
  "outlineMatch": 大纲吻合度0-10,
  "characterConsistency": 角色一致性0-10,
  "characterDistinctiveness": 角色差异性0-10,
  "reversalQuality": 反转质量0-10,
  "aiTraceIndex": "AI痕迹指数0-100",
  "emotionalImpact": "情绪冲击力0-10",
  "chapterEndAppeal": "结尾吸引力0-10",
  "mobileReadability": "手机阅读适配0-10",
  "chineseAuthenticity": "中国场景真实感0-10",
  "concreteQuality": "具体质感0-10",
  "copyrightRisk": false,
  "issues": [
    { "type": "error/warning/info", "dimension": "维度名称", "description": "问题描述", "suggestion": "修改建议" }
  ]
}`,
      versions: [
        { templateId: 'tianlong-chapter-qa', version: '1.0.0', changelog: ['初始版本，基于短故事三步骤.md天龙8步质检'], activeSince: '2026-01-01' },
      ],
      variables: ['chain_output.context.chapterOutline', 'chain_output.node_9'],
      isActive: true,
    });

    // 外挂模板
    this.registerTemplate({
      id: 'attach-opening-boost',
      name: '开头强化',
      category: 'attachments',
      version: '1.0.0',
      description: '生成10个第一人称强钩子开头',
      content: `请基于当前故事设定，生成10个第一人称强钩子开头，每个100到300字，分别适配知乎盐选、番茄短篇、抖音口播、规则怪谈、都市悬疑等风格。

## 故事设定
{{json user_input.story_setting}}

## 质量要求
- 每个开头必须在第一句出现具体可感知的异常——不是"气氛诡异"，是一个具体的反常细节
- 至少3个开头用日常物件作为叙事支点（比如坏掉的门锁、一条未读消息的预览、垃圾桶里不属于这个家的外卖盒）
- 不要写完整闭环，每个开头停在"读者想问下一句"的位置，不给出答案
- 不同风格的开头差异要明显——知乎盐选收敛克制，番茄短篇直给冲突，抖音口播第一句必须能截成短视频封面文案`,
      versions: [
        { templateId: 'attach-opening-boost', version: '1.0.0', changelog: ['初始版本，基于短故事三步骤.md外挂一'], activeSince: '2026-01-01' },
      ],
      variables: ['user_input.story_setting'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'attach-reversal-boost',
      name: '反转强化',
      category: 'attachments',
      version: '1.0.0',
      description: '审查反转力度并提供替代方案',
      content: `请审查当前大纲的反转力度，找出反转不够强的地方，并提供5个更有冲击力但不破坏人物动机的替代方案。

## 当前大纲
{{json user_input.outline}}

## 审查标准
- 标记出任何"做梦""精神病""系统解释"等廉价反转，直接驳回
- 好的反转来自前文伏笔的重新照亮——检查每个反转是否有前文细节支撑
- 替代方案应该让读者产生"回头看才懂"的延迟理解，而非当场惊吓`,
      versions: [
        { templateId: 'attach-reversal-boost', version: '1.0.0', changelog: ['初始版本，基于短故事三步骤.md外挂二'], activeSince: '2026-01-01' },
      ],
      variables: ['user_input.outline'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'attach-platform-rewrite',
      name: '平台改写',
      category: 'attachments',
      version: '1.0.0',
      description: '将故事改写成目标平台风格',
      content: `请将当前故事改写成{{user_input.target_platform}}风格，保留核心剧情，强化对应平台的节奏、语言和情绪钩子。

## 故事正文
{{user_input.story_text}}

## 改写质量要求
- 用具体的感官细节替换所有抽象形容词（"紧张"→"手心在裤子上蹭了两下"）
- 对话要有角色辨识度——不同人的说话方式不能互换
- 每300字至少出现一次新信息或无解疑点，不让读者有"可以放下手机"的间隙
- 禁止出现排比句/对仗句/三段论式叙述——真实的人说话不这样`,
      versions: [
        { templateId: 'attach-platform-rewrite', version: '1.0.0', changelog: ['初始版本，基于短故事三步骤.md外挂三'], activeSince: '2026-01-01' },
      ],
      variables: ['user_input.target_platform', 'user_input.story_text'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'attach-title-synopsis',
      name: '标题简介',
      category: 'attachments',
      version: '1.0.0',
      description: '生成爆款标题和简介',
      content: `请基于当前故事生成20个爆款标题、5个故事简介、5个短视频口播开头，要求符合{{user_input.platform}}风格。

## 故事设定
{{json user_input.story_setting}}`,
      versions: [
        { templateId: 'attach-title-synopsis', version: '1.0.0', changelog: ['初始版本，基于短故事三步骤.md外挂四'], activeSince: '2026-01-01' },
      ],
      variables: ['user_input.platform', 'user_input.story_setting'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'attach-final-qa',
      name: '终稿质检',
      category: 'attachments',
      version: '1.0.0',
      description: '发布前最终质量检查',
      content: `请以网络短篇编辑身份审查全文，给出具体修改建议。

## 完整故事
{{user_input.full_story}}

## 目标平台
{{user_input.platform}}

## 审查维度（每项标注 pass/warn/fail）
1. 开头钩子（前300字是否有可感知的强异常）
2. 第一人称代入感
3. 悬念密度（每300字是否有新疑点或信息变化）
4. 反转力度（是否避免廉价反转，反转是否有前文伏笔）
5. 人物动机合理性
6. 角色差异性（不同人的说话方式、小动作、反应是否可互换）
7. 伏笔回收
8. 具体质感（五感细节密度，抽象形容词数量）
9. 平台适配度
10. 完读率潜力
11. 去AI味（是否出现排比句/对仗句/"内心深处/不禁/仿佛/似乎"等高频词）`,
      versions: [
        { templateId: 'attach-final-qa', version: '1.0.0', changelog: ['初始版本，基于短故事三步骤.md外挂五'], activeSince: '2026-01-01' },
      ],
      variables: ['user_input.full_story', 'user_input.platform'],
      isActive: true,
    });

    // ==================== 灵感种子智能补全 (4个) ====================

    this.registerTemplate({
      id: 'seed-character-enrich',
      name: '角色深度补全',
      category: 'inspiration-seed',
      version: '1.0.0',
      description: '基于角色名+hook生成性格五维/背景/对话风格',
      content: `你是一名资深网文角色设计师，擅长为网络短篇小说/长篇网文设计立体角色。

## 灵感信息
- 钩子: {{user_input.hook}}
- 故事简介: {{user_input.description}}
- 角色名单: {{#each user_input.characters}}{{this}}{{#unless @last}}、{{/unless}}{{/each}}

## 执行要求
1. 为每个角色生成完整的性格五维(0-100)、背景故事、外貌、对话风格和口头禅
2. **钩子思维**: 每个角色的background必须包含一个"钩子潜质"——能埋伏笔或制造冲突的暗线(如隐藏身份/未说出口的秘密/与他人的暗流关系)
3. **反幻觉**: 所有设定必须与hook和description有逻辑关联，不得凭空捏造与灵感无关的核心设定
4. 第一个角色(POV视角)的background应直接呼应hook中的核心冲突
5. dialoguePatterns给出2-4个具体口头禅或说话习惯
6. **角色差异**: 每个角色必须有一个独特的小习惯（摸耳垂/转笔/紧张时喝水/不接电话只发文字）。不同角色的性格五维不能趋同——要有明显的数值落差。对角色的描述不能互换——如果把角色A的背景套到角色B身上，必须明显感到不合适。

## 输出格式
输出合法JSON，不要markdown包裹:
{"characters":[{"name":"角色名","personality":{"extraversion":50,"agreeableness":50,"conscientiousness":50,"neuroticism":50,"openness":50},"background":"背景故事(含钩子潜质)","appearance":"外貌","dialogueStyle":"对话风格","dialoguePatterns":["口头禅1","口头禅2"]}]}`,
      versions: [
        { templateId: 'seed-character-enrich', version: '1.0.0', changelog: ['初始版本，灵感种子智能补全'], activeSince: '2026-06-21' },
      ],
      variables: ['user_input.hook', 'user_input.description', 'user_input.characters'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'seed-worldview-enrich',
      name: '世界观补全',
      category: 'inspiration-seed',
      version: '1.0.0',
      description: '基于setting+hook生成地理/历史/规则/势力格局',
      content: `你是一名资深网文世界观架构师，擅长为中国网络文学构建沉浸式世界观。

## 灵感信息
- 钩子: {{user_input.hook}}
- 故事简介: {{user_input.description}}
- 世界观种子: {{user_input.setting}}

## 执行要求
1. 基于setting种子补全完整的地理环境、历史背景、社会/力量规则、势力格局
2. **钩子思维**: geography/history/rules中各埋至少一处"钩子潜质"——能后续展开冲突或反转的暗线(如禁地/禁忌/历史悬案/规则漏洞)
3. **反幻觉**: 世界观必须与hook和description的题材基调一致，不得引入与灵感无关的体系(如都市题材不能凭空加修仙体系)
4. constraints给出2-3条世界观硬约束(如"修炼者不可跨界""公司内部禁止私联")
5. 如果setting为空或极简，根据hook推断最合理的中国现实/架空背景
6. **具体细节**: 地理环境不要泛泛写"繁华都市"，写"小区建成二十年，电梯间广告换了三轮都没人撕"；历史背景不要写"历史悠久"，写一个具体的、只有这个设定下才会发生的事件片段

## 输出格式
输出合法JSON，不要markdown包裹:
{"name":"世界观名","era":"时代背景","geography":"地理环境(含钩子)","history":"历史背景(含钩子)","rules":"社会/力量规则(含钩子)","factionLayout":"势力格局概述","constraints":[{"category":"分类","rule":"规则","description":"说明","severity":"critical/major/minor"}]}`,
      versions: [
        { templateId: 'seed-worldview-enrich', version: '1.0.0', changelog: ['初始版本，灵感种子智能补全'], activeSince: '2026-06-21' },
      ],
      variables: ['user_input.hook', 'user_input.description', 'user_input.setting'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'seed-organization-gen',
      name: '组织生成',
      category: 'inspiration-seed',
      version: '1.0.0',
      description: '基于世界观生成2-3个主要势力',
      content: `你是一名网文势力设计专家。基于以下世界观，生成2-3个主要势力/组织。

## 世界观设定
{{json chain_output.node_2_worldview}}

## 执行要求
1. 生成2-3个组织，type必须从以下枚举中选择(小写):
   - regime: 政权/朝廷/政府
   - faction: 派系/势力
   - army: 军队/武装力量
   - sect: 门派/宗派/学院
   - camp: 阵营/联盟
   - organization: 组织/机构/公司
   - other: 其他
2. **钩子思维**: 每个组织的description必须包含"钩子潜质"——组织内部的暗流/与主角的潜在冲突/隐藏目的
3. **反幻觉**: 组织必须与世界观geography和factionLayout逻辑一致
4. 至少一个组织与hook中的核心冲突有直接关联

## 输出格式
输出合法JSON，不要markdown包裹:
{"organizations":[{"name":"组织名","type":"regime","description":"组织描述(含钩子)"}]}`,
      versions: [
        { templateId: 'seed-organization-gen', version: '1.0.0', changelog: ['初始版本，灵感种子智能补全'], activeSince: '2026-06-21' },
      ],
      variables: ['chain_output.node_2_worldview'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'seed-location-gen',
      name: '地点生成',
      category: 'inspiration-seed',
      version: '1.0.0',
      description: '长篇按6层层级/短篇简化生成地点',
      content: `你是一名网文地图设计师。基于世界观生成故事地点。

## 世界观设定
{{json chain_output.node_2_worldview}}

## 篇幅类型
{{#if user_input.isLong}}长篇(按6层层级: world→region→country→city→location→scene，生成8-15个地点){{else}}短篇(简化为1-2层，生成3-5个location/scene级地点){{/if}}

## 执行要求
1. **钩子思维**: 每个地点的description必须包含"钩子潜质"——能发生关键剧情/埋伏笔/制造冲突的场所特征
2. **反幻觉**: 地点必须与世界观geography一致
3. level必须从以下枚举中选择(小写): world / region / country / city / location / scene
   - region对应区域(如华北地区、东北地区)，替代"大陆"概念，更贴合中国地理叙事
4. 长篇: parentId填父级地点name(如"长安城"的parentId为"大唐")
5. 短篇: 只生成location/scene级，不需要parentId

## 输出格式
输出合法JSON，不要markdown包裹:
{"locations":[{"name":"地点名","level":"world","parentId":"父地点名(短篇不需要)","description":"地点描述(含钩子)"}]}`,
      versions: [
        { templateId: 'seed-location-gen', version: '1.0.0', changelog: ['初始版本，灵感种子智能补全'], activeSince: '2026-06-21' },
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
      description: '分析剧情类型、复杂度，决定卷数（3-10卷）',
      content: `你是一名资深网文策划，擅长分析故事结构并制定灵活的大纲规划。
**重要：不搞固定8卷×50章的死板结构，而是根据剧情实际需要灵活拆分。**

## 输入信息
- 故事设定：{{user_input.story_setting}}
- 目标字数：{{user_input.targetWords}}（单位：万字）
- 故事类型：{{user_input.genre}}

## 执行要求
1. **分析剧情复杂度**：根据故事类型和目标字数，评估需要多少卷才能完整讲述故事
2. **决定卷数**：灵活决定卷数（3-10卷），不要固定8卷
   - 简单故事/目标字数少：3-5卷
   - 中等复杂度：5-8卷
   - 高复杂度/目标字数多：8-10卷
3. **每卷主题**：为每卷确定一个核心主题（如"初入江湖"、"真相浮现"、"最终决战"）
4. **卷数理由**：说明为什么选择这个卷数（基于剧情需要）

## 输出格式
输出合法JSON，不要markdown包裹：
{"analysis":{"storyComplexity":"简单/中等/复杂","recommendedVolumes":5,"reason":"选择X卷的理由"},"volumes":[{"volumeNumber":1,"theme":"卷主题","focus":"本卷重点","estimatedChapters":30}]}`,
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

## 剧情分析结果
{{json chain_output.node_1_analysis}}

## 故事设定
{{user_input.story_setting}}

## 执行要求
1. **灵活拆分**：根据每卷主题，设计该卷的详细大纲（不要平均分配章节）
2. **章节数灵活**：每卷章节数根据剧情需要决定（15-80章不等）
3. **卷内结构**：每卷应有起承转合（开头铺垫→发展→高潮→结尾钩子）
4. **卷间衔接**：每卷结尾应自然过渡到下一卷
5. **伏笔规划**：在大纲中标注关键伏笔的埋设位置和回收位置

## 输出格式
输出合法JSON，不要markdown包裹：
{"volumes":[{"volumeNumber":1,"title":"卷标题","theme":"主题","chapters":35,"outline":"本卷详细大纲（500字）","keyEvents":["关键事件1","关键事件2"],"foreshadowings":[{"item":"伏笔内容","setupChapter":5,"revealChapter":25}]}]}`,
      versions: [
        { templateId: 'long-novel-volume-outline', version: '1.0.0', changelog: ['初始版本，长篇灵活大纲'], activeSince: '2026-06-22' },
      ],
      variables: ['chain_output.node_1_analysis', 'user_input.story_setting'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'long-novel-chapter-summary',
      name: '章节概要生成',
      category: 'long-novel-outline',
      version: '1.0.0',
      description: '生成前N章的详细概要',
      content: `你是一名网文章节设计师，擅长根据大纲生成详细的章节概要。

## 卷大纲
{{json chain_output.node_2_volumes}}

## 执行要求
1. **生成前20章概要**：为前两卷生成详细章节概要（后续章节可在写作时动态生成）
2. **每章概要**：包含章节标题、核心事件、出场人物、伏笔埋设
3. **节奏控制**：根据大纲的起承转合，安排章节节奏（铺垫→发展→高潮→缓和）
4. **第一人称视角**：如果是第一人称小说，确保每章概要体现"我"的视角和感受

## 输出格式
输出合法JSON，不要markdown包裹：
{"chapters":[{"chapterNumber":1,"title":"章节标题","summary":"本章概要（100字）","keyEvents":["事件1"],"characters":["角色1"],"foreshadowings":[{"item":"伏笔","type":"埋设"}]}]}`,
      versions: [
        { templateId: 'long-novel-chapter-summary', version: '1.0.0', changelog: ['初始版本，长篇灵活大纲'], activeSince: '2026-06-22' },
      ],
      variables: ['chain_output.node_2_volumes'],
      isActive: true,
    });

    // ==================== 综合长篇大纲生成 (单次LLM调用) ====================
    this.registerTemplate({
      id: 'long-novel-comprehensive-outline',
      name: '长篇综合大纲生成',
      category: 'long-novel-outline',
      version: '2.0.0',
      description: '基于参考文档（两百万字指南/魂穿北洋/短篇三步骤），一次生成完整大纲：核心设定+世界观+角色+卷章结构+伏笔+反转+时间线',
      content: `你是一名资深网络小说创作策划，擅长为长篇小说设计完整的大纲体系。

## 参考标准
- 两百万字网文创作全流程：8卷起承转合，每卷有明确主题/目标/高潮
- 魂穿北洋实例：每章有核心内容/人物行动/冲突/伏笔/钩子
- 短篇三步骤：角色需包含性格(3核心+1矛盾)/背景/能力/目标/成长弧光

## 输入信息
- 故事设定：{{user_input.story_setting}}
- 目标字数：{{user_input.targetWords}}（单位：万字）
- 故事类型：{{user_input.genre}}

## 执行要求
请生成以下完整大纲，每个部分都必须详细、具体、可落地：

### 一、核心设定
- title: 书名（≤15字，有冲击力）
- type: 小说类型
- coreSellingPoints: 核心卖点（3-5个关键词）
- targetReaders: 目标读者群
- setting: 故事背景（200字）
- coreConflict: 核心矛盾（100字）
- emotionalEnding: 最终情绪落点

### 二、世界观（至少5个维度）
- geography: 世界地理/重要地点（3-5个）
- socialStructure: 社会结构/阶级体系
- powerSystem: 力量体系/等级划分（如适用）
- economy: 经济体系/资源
- culture: 文化特色/习俗
- history: 重要历史事件（3-5条）
- factions: 主要势力/派系（3-5个，含核心诉求）

### 三、角色体系（至少5个核心角色）
每个角色包含：
- name: 姓名
- identity: 身份/职业
- personality: 性格（3个核心性格+1个矛盾点）
- background: 背景故事（150字）
- abilities: 能力设定（3-5项）
- shortTermGoal: 短期目标
- longTermGoal: 长期目标
- growthArc: 成长弧光（初始→转折→终局）
- fear: 内心恐惧
- relationships: 与其他角色关系（至少2个）

### 四、卷结构（弹性卷数，根据剧情需要3-10卷）
每卷包含：
- volumeNumber: 卷号
- title: 卷标题
- theme: 卷主题（如"初入江湖"、"真相浮现"）
- outline: 卷大纲（300字）
- keyEvents: 关键事件（5-8个）
- climaxDescription: 卷末高潮描述
- hookToNextVolume: 钩子

### 五、章节结构（生成前{{user_input.chapterLimit}}章详细概要）
每章包含：
- chapterNumber: 章序号
- title: 章节标题
- chapterFunction: 章节功能。短篇按《短故事三步骤》使用 opening/exposition/rising_action/conflict/climax/transition/cliffhanger/resolution 分布；长篇按《两百万字小说创作全流程指南》使用 opening/charging/conflict/explosion/breathing/paving/cliffhanger/transition/closing 交替。禁止全部使用 paving。
- goalArc: Goal弧线（crisis_resolve/accumulate_burst/foreshadow_recover/pave_climax/suppress_counter/mist_truth/probe_showdown）
- summary: 核心内容（短篇120-200字，长篇160-260字）。必须包含具体事件链、人物动作、误判或偏差、代价/后果、章末钩子，不能只写概括空话。
- openingHook: 开篇吸引力。短篇前300-500字必须有强异常/强疑点/强代价；长篇前1-3章必须让主角主动行动并留下可追读悬念。
- scenes: 主要场景（1-3个）
- characterActions: 人物行动
- conflict: 冲突设计
- highlight: 爽点设置
- foreshadowing: 伏笔设置
- foreshadowingRecovery: 伏笔回收
- hook: 下章钩子
- mood: 情感基调（紧张/悬疑/热血/悲伤/轻松等）
- targetWords: 目标字数

### 六、伏笔网络（至少10个伏笔）
每个伏笔包含：
- id: 伏笔编号
- content: 伏笔内容
- scope: 作用范围（global全局/volume卷级/chapter章级）
- setupChapter: 设置章节号
- recoveryChapter: 回收章节号
- recoveryCondition: 回收条件
- payoffDescription: 回收时的效果

### 七、反转表（至少3次递进式反转）
每次反转包含：
- id: 反转编号
- position: 位置（在第几章附近）
- surfaceTruth: 表面真相
- actualTruth: 实际真相
- foreshadowRef: 支撑伏笔编号
- revealMethod: 揭露方式
- impactOnCharacter: 对主角打击
- impactOnReader: 对读者冲击
- changesUnderstanding: 是否改变前文理解

### 八、时间线（10+个关键事件节点）
每条时间线包含：
- date: 故事内时间
- event: 事件描述
- chapterReference: 对应章节
- significance: 重要性

### 九、层级与交叉推进（长篇必须）
1. 伏笔必须交叉推进，不允许“一个伏笔完全结束后才开启下一个伏笔”。至少包含：
   - global：贯穿全文伏笔，如斗破里的焚决、萧族、陀舍古帝玉这类从前期出现、中后期多次变形、后期兑现的主轴伏笔。
   - volume：卷级伏笔，服务于某一卷或跨2-3卷的阶段矛盾。
   - chapter：章节/小场景伏笔，服务于局部冲突、误判、反转或爽点。
   每条伏笔必须包含 setupChapter、recoveryChapter、recoveryCondition、payoffDescription，并在章节 summary/scenes/foreshadowing 字段里交叉引用。
2. 地图必须分层输出，不要扁平罗列：
   - world：大陆/世界级，例如“斗气大陆”。
   - region：国家、区域、州郡，例如“加玛帝国”“黑角域”。
   - country：国家、王朝、宗门势力覆盖区，或中型区域，例如“加玛帝国”“乌坦城周边”“魔兽山脉外围”。
   - city：城镇、宗门驻地、港口、关隘。
   - location：具体地点，例如坊市、山洞、客栈、演武场。
   每个地图节点必须有 level，且只允许 world/region/country/city/location/scene；非根节点必须用 parentName 指向父节点名称。
3. 组织/势力必须分层输出：
   - empire/region/sect/clan/guild/cell 等层级或类型。
   - 非根组织用 parentName 指向上级势力或归属阵营。
4. 长篇结构必须呈现“全文主线 + 卷级线 + 小场景线”同时推进：同一章可以推进一个全局伏笔、一个卷级矛盾和一个局部场景冲突。

## 输出格式
输出合法JSON，不要markdown包裹，结构如下：
{
  "coreSetting": { "title":"...", "type":"...", ... },
  "worldview": {
    "geography": [{ "name":"大陆/国家/城市/地点", "level":"world|region|country|city|location|scene", "parentName":"父地点名或空", "description":"..." }],
    "locations": [{ "name":"地点名", "level":"world|region|country|city|location|scene", "parentName":"父地点名或空", "description":"..." }],
    "factions": [{ "name":"势力名", "type":"empire|sect|clan|guild|cell", "level":"root|region|branch|cell", "parentName":"父势力名或空", "description":"..." }],
    "socialStructure":"...", "powerSystem":"...", "economy":"...", "culture":"...", "history":"..."
  },
  "characters": [{ "name":"...", "identity":"...", "personality":"...", "background":"...", "abilities":[], "shortTermGoal":"...", "longTermGoal":"...", "growthArc":"...", "fear":"...", "relationships":[] }],
  "volumes": [{ "volumeNumber":1, "title":"...", "theme":"...", "outline":"...", "keyEvents":[], "climaxDescription":"...", "hookToNextVolume":"...", "chapters":[] }],
  "foreshadowings": [{ "id":"FS_1", "content":"...", "scope":"global", "setupChapter":1, "recoveryChapter":15, "recoveryCondition":"...", "payoffDescription":"..." }],
  "reversals": [{ "id":"REV_1", "position":"...", "surfaceTruth":"...", "actualTruth":"...", "foreshadowRef":"FS_3", "revealMethod":"...", "impactOnCharacter":"...", "impactOnReader":"...", "changesUnderstanding":true }],
  "timeline": [{ "date":"...", "event":"...", "chapterReference":1, "significance":"..." }]
}

## 质量要求
1. 人物设定必须丰满，不可扁平化
2. 伏笔必须有明确的回收位置
3. 反转必须递进，不能仅在结尾反转
4. 章节功能必须交替：短篇按开篇钩子→信息揭示→危机升级→正面冲突→高潮/反转→悬念→收束；长篇按开篇钩子→蓄力→冲突→爆发→呼吸→铺垫→悬念→过渡循环推进。不能整批章节都是铺垫。
5. 时间线必须自洽，无矛盾
6. 所有内容必须适合所选的故事类型和目标字数`,
      versions: [
        { templateId: 'long-novel-comprehensive-outline', version: '2.0.0', changelog: ['完全重写，基于参考文档一次性生成所有组件：核心设定+世界观7维+角色5+6维+卷章结构+伏笔+反转+时间线'], activeSince: '2026-06-24' },
      ],
      variables: ['user_input.story_setting', 'user_input.targetWords', 'user_input.genre', 'user_input.chapterLimit'],
      isActive: true,
    });

    // ==================== 长篇初始地基 (创建时仅生成核心设定+世界观) ====================
    this.registerTemplate({
      id: 'long-novel-init-foundation',
      name: '长篇初始地基（核心设定+世界观）',
      category: 'long-novel-outline',
      version: '1.0.0',
      description: '创建长篇项目时生成核心设定和世界观（按两百万字指南标准，非常详细）。大纲/角色/伏笔后续增删改查。',
      content: `你是一名资深网络小说世界观架构师，参考《两百万字小说创作全流程指南》为长篇小说搭建初始地基。

## 参考标准
- 两百万字网文创作全流程：8卷起承转合，每卷有明确主题/目标/高潮
- 魂穿北洋实例：第一卷106章"魂穿北洋，力挽狂澜止称帝"，时间线1915.9.16→1916.6.6
- 世界观必须包含7个维度（见下方）

## 输入信息
- 故事设定：{{user_input.story_setting}}
- 目标字数：{{user_input.targetWords}}万字
- 类型：{{user_input.genre}}

## 【核心要求】你要输出两个核心模块，必须详细具体

---

### 模块一：核心设定 (coreSetting)
务必详细，不能只有一两句。每个字段至少20字。

1. **title**：书名（有冲击力，适合网文平台）
2. **type**：小说类型（如"历史穿越+权谋"、"玄幻修仙"）
3. **coreSellingPoints**：核心卖点3-5个（如"魂穿+阻止称帝+科技强国"）
4. **targetReaders**：目标读者群描述（如"25-35岁男性，偏好历史军事类"）
5. **setting**：故事背景详细描述（200-300字，时代背景、社会环境、主要冲突来源）
6. **coreConflict**：核心矛盾（详细说明主要冲突是什么、为什么不可调和）
7. **protagonist**：主角身份描述（姓名、穿越前身份、穿越后身份、核心能力来源）
8. **initialDilemma**：主角初始困境（面临的第一个重大选择或危机）
9. **wantMost**：主角最想要什么（长期追求）
10. **fearMost**：主角最害怕什么（内心最深恐惧）
11. **antagonist**：反派或阻碍力量（详细描述对手是谁、为什么成为对手、实力如何）
12. **emotionalEnding**：最终情绪落点（热血胜利/悲壮牺牲/开放式/黑色幽默等）
13. **highConcept**：一句话高概念（让读者3秒内被吸引）
14. **volumePlan**：初步卷规划（建议3-8卷，每卷1句话描述主题）

---

### 模块二：世界观 (worldview)
务必详细，每个维度至少30字。参照以下7维：

1. **geography**：世界地理（数组，每个地点含 name+description，至少列出5个关键地点）
2. **socialStructure**：社会结构/阶级体系（详细描述社会等级、权力分配、阶层流动）
3. **powerSystem**：力量体系/等级划分（详细描述能力体系、等级名称、晋升方式）
4. **economy**：经济体系（货币、贸易、产业、资源分配）
5. **culture**：文化特色（习俗、节日、价值观、流行文化、禁忌）
6. **history**：重要历史事件（数组，每个事件含 date+event，至少列出5条关键历史）
7. **factions**：主要势力/派系（数组，每个势力含 name+description+coreGoal+leader，至少列出4个）

---

## 输出格式
输出合法JSON，不要markdown包裹：

{
  "coreSetting": {
    "title":"...", "type":"...", "coreSellingPoints":[...], "targetReaders":"...",
    "setting":"...", "coreConflict":"...", "protagonist":"...",
    "initialDilemma":"...", "wantMost":"...", "fearMost":"...",
    "antagonist":"...", "emotionalEnding":"...", "highConcept":"...",
    "volumePlan": [{"volume":1, "theme":"..."}, ...]
  },
  "worldview": {
    "geography": [{"name":"...", "description":"..."}],
    "socialStructure":"...", "powerSystem":"...",
    "economy":"...", "culture":"...",
    "history": [{"date":"...", "event":"..."}],
    "factions": [{"name":"...", "description":"...", "coreGoal":"...", "leader":"..."}]
  },
  "skeletonVolumes": [
    {"volumeNumber":1, "title":"第一卷 ...", "theme":"本卷主题", "estimatedChapters":30, "description":"本卷核心目标"}
  ]
}

## 质量要求
1. 核心设定每个字段必须详细（≥20字），不能敷衍
2. 世界观每个维度必须详细（≥30字），地理位置和势力必须有 name+description
3. 卷规划必须根据题材特点（历史/都市/玄幻等）给出合理卷数和主题
4. 参照魂穿北洋实例的质量水准`,
      versions: [
        { templateId: 'long-novel-init-foundation', version: '1.0.0', changelog: ['长篇创建时仅生成核心设定+世界观，大纲/角色/伏笔后续增删改查'], activeSince: '2026-06-25' },
      ],
      variables: ['user_input.story_setting', 'user_input.targetWords', 'user_input.genre', 'user_input.chapterLimit'],
      isActive: true,
    });

    // ==================== 长篇小说创作全流程 (基于两百万字指南) ====================
    // Phase 1: 前期准备 (2周) —— 4个模板

    this.registerTemplate({
      id: 'long-novel-genre-selection',
      name: '类型题材选择',
      category: 'long-novel-phase1',
      version: '1.0.0',
      description: '选择小说类型和题材，基于两百万字小说创作全流程指南Phase 1',
      content: `你是一名资深网文策划，擅长帮助作者选择合适的小说类型和题材。

## 执行要求
请根据以下方向，帮助作者确定小说类型和题材（可单选或组合）：

### 可选方向
- 都市异能 + 悬疑探案
- 玄幻修仙 + 系统流
- 科幻末世 + 经营建设
- 古代言情 + 宫廷权谋
- 历史穿越 + 工业发展

### 分析维度
对每个选定的方向，分析：
1. **目标读者群**：谁会读这类小说？
2. **市场热度**：当前平台表现如何？
3. **创作难度**：需要哪些专业知识？
4. **推荐理由**：为什么选这个方向？

### 输出格式
{
  "selectedGenres": ["方向1", "方向2"],
  "targetAudience": "目标读者描述",
  "marketAnalysis": "市场热度分析",
  "difficulty": "创作难度评估",
  "recommendationReason": "推荐理由",
  "nextStep": "下一步：使用基础设定提示词生成世界观"
}

## 重要提示
- 选择后以该类型为基础，使用后续提示词生成基础设定
- 可组合不同类型创造新颖题材`,
      versions: [
        { templateId: 'long-novel-genre-selection', version: '1.0.0', changelog: ['初始版本，基于两百万字指南Phase 1'], activeSince: '2026-06-23' },
      ],
      variables: [],
      isActive: true,
    });

    this.registerTemplate({
      id: 'long-novel-world-building',
      name: '世界观设定',
      category: 'long-novel-phase1',
      version: '1.0.0',
      description: '生成详细世界观设定，包含地理环境、历史背景、力量体系、势力格局',
      content: `你是一名资深网文世界观架构师，擅长为长篇小说构建沉浸式世界观。

## 用户输入
- 小说类型：{{user_input.genre}}
- 题材方向：{{user_input.direction}}
- 目标字数：{{user_input.targetWords}}万字

## 执行要求
请生成完整的世界观设定，包含以下维度：

### 1. 地理环境
- 世界地图（大陆、海洋、国家分布）
- 气候与自然资源分布
- 重要地理节点（山脉、河流、城市）

### 2. 历史背景
- 世界历史大事件（战争、发现、变革）
- 当前时代背景（政治、经济、文化）
- 历史遗留问题（领土争端、民族矛盾）

### 3. 力量/社会体系
- 力量等级（如适用：修仙境界、科技水平、异能等级）
- 社会阶层（贵族、平民、特殊职业）
- 核心规则（世界运行的基本法则）

### 4. 势力格局
- 主要国家/势力（名称、立场、实力）
- 势力关系（盟友、敌对、中立）
- 权力平衡（谁是霸主、谁在崛起）

### 5. 钩子潜质（重要！）
在每个维度中埋入"钩子潜质"——能后续展开冲突或反转的暗线：
- 地理：禁地、秘境、未探索区域
- 历史：悬案、被掩盖的真相、预言
- 力量：体系漏洞、 forbidden techniques、失落传承
- 势力：内部暗流、背叛者、隐藏目的

## 输出格式
输出合法JSON，不要markdown包裹：
{
  "worldName": "世界观名称",
  "geography": "地理环境详细描述（含钩子）",
  "history": "历史背景详细描述（含钩子）",
  "powerSystem": "力量/社会体系详细描述（含钩子）",
  "factions": [{"name":"势力名","type":"政权/门派/公司/...","position":"立场","strength":"实力等级","hiddenAgenda":"隐藏目的（钩子）"}],
  "hooks": ["钩子1", "钩子2", ...]
}

## 反幻觉约束
- 所有设定必须与小说类型一致
- 不得引入与题材无关的元素
- 力量体系必须有明确边界和代价`,
      versions: [
        { templateId: 'long-novel-world-building', version: '1.0.0', changelog: ['初始版本，基于两百万字指南Phase 1'], activeSince: '2026-06-23' },
      ],
      variables: ['user_input.genre', 'user_input.direction', 'user_input.targetWords'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'long-novel-character-settings',
      name: '人物设定',
      category: 'long-novel-phase1',
      version: '1.0.0',
      description: '生成主要人物设定，包含性格、背景、动机、成长弧线',
      content: `你是一名资深网文角色设计师，擅长为长篇小说设计立体人物。

## 用户输入
- 世界观设定：{{chain_output.worldview}}
- 小说类型：{{user_input.genre}}
- 目标字数：{{user_input.targetWords}}万字

## 执行要求
请生成5-8个主要人物，每个角色包含以下维度：

### 1. 基础信息
- 姓名、年龄、性别
- 外貌特征（具象化描写）
- 身份地位（在世界中的位置）

### 2. 性格五维（0-100数值）
- 外向性（extraversion）：主动社交 vs 独处
- 宜人性（agreeableness）：信任他人 vs 多疑
- 尽责性（conscientiousness）：计划有序 vs 随性而为
- 神经质（neuroticism）：情绪稳定 vs 易焦虑
- 开放性（openness）：接受新事物 vs 保守传统

### 3. 背景故事
- 成长经历（童年、关键事件）
- 家庭关系（父母、兄弟姐妹）
- 钩子潜质（重要！）：背景中埋入能展开冲突的暗线
  - 例如：隐藏身份、未说出口的秘密、与他人的暗流关系

### 4. 动机与目标
- 表层目标（角色自己知道的）
- 深层需求（角色可能不自知的）
- 恐惧与弱点（能被对手利用的）

### 5. 对话风格
- 口头禅（2-4个具体短语）
- 说话习惯（语速、用词、口音）
- 情绪化表达（愤怒、恐惧、喜悦时如何说话）

### 6. 成长弧线
- 初始状态（故事开始时的性格/能力）
- 成长触发（什么事件促使改变）
- 中期变化（挫折、领悟、蜕变）
- 最终状态（故事结束时的性格/能力）

## 输出格式
输出合法JSON，不要markdown包裹：
{
  "characters": [
    {
      "name": "角色名",
      "age": 25,
      "gender": "男/女",
      "appearance": "外貌描写",
      "identity": "身份地位",
      "personality": {"extraversion": 50, "agreeableness": 50, "conscientiousness": 50, "neuroticism": 50, "openness": 50},
      "background": "背景故事（含钩子潜质）",
      "motivation": {"surfaceGoal": "表层目标", "deepNeed": "深层需求", "fear": "恐惧与弱点"},
      "dialogueStyle": "对话风格描述",
      "dialoguePatterns": ["口头禅1", "口头禅2"],
      "growthArc": {"initial": "初始状态", "trigger": "成长触发", "midChange": "中期变化", "final": "最终状态"}
    }
  ]
}

## 反幻觉约束
- 人物背景必须与世界观一致
- 性格五维必须影响角色行为（不能只是数字）
- 动机必须有层次（表层+深层）`,
      versions: [
        { templateId: 'long-novel-character-settings', version: '1.0.0', changelog: ['初始版本，基于两百万字指南Phase 1'], activeSince: '2026-06-23' },
      ],
      variables: ['chain_output.worldview', 'user_input.genre', 'user_input.targetWords'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'long-novel-outline-initial',
      name: '初始大纲生成',
      category: 'long-novel-phase1',
      version: '1.0.0',
      description: '生成整体大纲，包含核心冲突、主线、分卷规划',
      content: `你是一名资深网文策划，擅长为长篇小说设计完整大纲。

## 用户输入
- 世界观设定：{{chain_output.worldview}}
- 主要人物：{{chain_output.characters}}
- 目标字数：{{user_input.targetWords}}万字
- 小说类型：{{user_input.genre}}

## 执行要求
请生成完整的小说大纲，包含以下部分：

### 1. 核心设定
- **核心冲突**：全书的主矛盾是什么？
- **主线任务**：主角要达成什么目标？
- **主题思想**：小说想表达什么？
- **预期结局**：开放式/圆满/悲剧？

### 2. 分卷规划（灵活决定卷数，3-10卷）
基于剧情复杂度和目标字数，灵活决定卷数：
- 简单故事/字数少：3-5卷
- 中等复杂度：5-8卷
- 高复杂度/字数多：8-10卷

每卷包含：
- 卷号、卷名、核心主题
- 主要事件（3-5个关键情节）
- 出场人物、伏笔埋设
- 结尾钩子（如何过渡到下一卷）

### 3. 伏笔总体规划
- 早期伏笔（第1-2卷埋设）
- 中期伏笔（第3-5卷埋设）
- 后期回收（第6-8卷回收）
- 终极揭秘（最终卷）

### 4. 节奏控制
- 铺垫期（第1卷）：世界展开、人物登场、冲突萌芽
- 发展期（第2-3卷）：冲突升级、人物成长、伏笔埋设
- 高潮期（第4-6卷）：危机爆发、真相逼近、最大反转
- 收尾期（第7-8卷）：决战、真相、结局

## 输出格式
输出合法JSON，不要markdown包裹：
{
  "coreSetting": {
    "coreConflict": "核心冲突",
    "mainQuest": "主线任务",
    "theme": "主题思想",
    "expectedEnding": "预期结局"
  },
  "volumes": [
    {
      "volumeNumber": 1,
      "title": "卷名",
      "theme": "核心主题",
      "keyEvents": ["事件1", "事件2", ...],
      "characters": ["角色1", ...],
      "foreshadowings": [{"item": "伏笔内容", "type": "埋设"}],
      "endingHook": "结尾钩子"
    }
  ],
  "foreshadowingPlan": {
    "early": ["早期伏笔1", ...],
    "mid": ["中期伏笔1", ...],
    "recovery": ["回收位置1", ...],
    "ultimateReveal": ["终极揭秘1", ...]
  },
  "pacing": {
    "setup": "第1卷：铺垫期内容",
    "development": "第2-3卷：发展期内容",
    "climax": "第4-6卷：高潮期内容",
    "resolution": "第7-8卷：收尾期内容"
  }
}

## 重要提示
- 卷数根据剧情需要灵活决定，不要固定8卷
- 每卷章节数不等（15-80章），根据剧情密度分配
- 伏笔必须有埋设位置和回收位置`,
      versions: [
        { templateId: 'long-novel-outline-initial', version: '1.0.0', changelog: ['初始版本，基于两百万字指南Phase 1'], activeSince: '2026-06-23' },
      ],
      variables: ['chain_output.worldview', 'chain_output.characters', 'user_input.targetWords', 'user_input.genre'],
      isActive: true,
    });

    // ==================== Phase 2: 详细规划 (2周) ====================

    this.registerTemplate({
      id: 'long-novel-volume-planning',
      name: '分卷详细大纲',
      category: 'long-novel-phase2',
      version: '1.0.0',
      description: '为每一卷生成详细章节规划，包含每章标题、核心事件、出场人物、伏笔',
      content: `你是一名资深网文章节设计师，擅长为长篇小说设计详细的分卷大纲。

## 用户输入
- 初始大纲：{{chain_output.outline}}
- 世界观设定：{{chain_output.worldview}}
- 主要人物：{{chain_output.characters}}

## 执行要求
请为每一卷生成详细的分卷大纲：

### 每卷详细规划
为初始大纲中的每一卷，生成：
1. **卷标题、核心主题**
2. **章节规划**（根据剧情需要分配章节数，15-80章不等）
   - 章节号、章节标题
   - 核心事件（本章主要发生什么）
   - 出场人物
   - 伏笔埋设/回收
   - 节奏功能（铺垫/蓄力/爆发/过渡/收束）
3. **卷内结构**（起承转合）
   - 开头铺垫（前1/4章节）
   - 发展蓄力（中间1/2章节）
   - 高潮爆发（后1/4章节）
   - 结尾钩子（最后一章）
4. **卷间衔接**（如何自然过渡到下一卷）

### 章节节奏控制
根据大纲的起承转合，安排章节节奏：
- **铺垫章节**：慢节奏，展开世界、介绍人物
- **蓄力章节**：中节奏，冲突积累、伏笔埋设
- **爆发章节**：快节奏，高潮迭起、反转连连
- **过渡章节**：缓冲节奏，人物互动、情感深化
- **收束章节**：中快节奏，解决当前卷问题、留下钩子

## 输出格式
输出合法JSON，不要markdown包裹：
{
  "volumes": [
    {
      "volumeNumber": 1,
      "title": "卷标题",
      "theme": "核心主题",
      "totalChapters": 35,
      "chapters": [
        {
          "chapterNumber": 1,
          "title": "章节标题",
          "coreEvent": "核心事件",
          "characters": ["角色1", ...],
          "foreshadowings": [{"item": "伏笔内容", "type": "埋设/回收"}],
          "pacingFunction": "铺垫/蓄力/爆发/过渡/收束"
        }
      ],
      "structure": {
        "setup": "开头铺垫描述",
        "development": "发展蓄力描述",
        "climax": "高潮爆发描述",
        "hook": "结尾钩子描述"
      },
      "transitionToNext": "如何过渡到下一卷"
    }
  ]
}

## 重要提示
- 章节数根据剧情需要灵活决定，不要平均分配
- 每章必须有明确的核心事件和节奏功能
- 伏笔埋设要分散在各章，不要集中在某几章`,
      versions: [
        { templateId: 'long-novel-volume-planning', version: '1.0.0', changelog: ['初始版本，基于两百万字指南Phase 2'], activeSince: '2026-06-23' },
      ],
      variables: ['chain_output.outline', 'chain_output.worldview', 'chain_output.characters'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'long-novel-character-network',
      name: '人物关系网',
      category: 'long-novel-phase2',
      version: '1.0.0',
      description: '生成人物关系网，包含人物间的复杂关系、情感纽带、利益冲突',
      content: `你是一名资深网文角色设计师，擅长为长篇小说设计复杂的人物关系网。

## 用户输入
- 主要人物设定：{{chain_output.characters}}
- 分卷大纲：{{chain_output.volumes}}

## 执行要求
请生成完整的人物关系网：

### 1. 人物关系矩阵
为每对主要人物定义关系：
- **关系类型**：盟友、敌人、恋人、家人、师徒、上下级、利用、背叛...
- **关系强度**（0-100）：0=陌生人，100=生死之交/不共戴天
- **关系变化**：关系如何随剧情发展而变化？
- **关键事件**：哪些事件改变了人物关系？

### 2. 情感纽带
- **正向情感**：友谊、爱情、亲情、敬意、感恩...
- **负向情感**：仇恨、嫉妒、背叛、误解、竞争...
- **情感变化弧线**：情感如何随剧情发展而变化？

### 3. 利益冲突
- **目标冲突**：人物目标如何相互冲突？
- **资源竞争**：人物争夺什么资源（权力、财富、爱情、复仇...）？
- **立场对立**：人物在关键问题上立场如何对立？

### 4. 关系变化节点
标注关系发生关键变化的章节位置：
- 关系建立（第X章）
- 关系深化（第X章）
- 关系破裂（第X章）
- 关系修复/反转（第X章）

## 输出格式
输出合法JSON，不要markdown包裹：
{
  "characterRelationships": [
    {
      "character1": "角色A",
      "character2": "角色B",
      "relationshipType": "盟友/敌人/...",
      "initialStrength": 50,
      "currentStrength": 80,
      "changeArc": "关系变化描述",
      "keyEvents": [{"chapter": 5, "event": "事件描述", "impact": "对关系的影响"}]
    }
  ],
  "emotionalBonds": [
    {
      "type": "正向/负向",
      "bond": "情感纽带描述",
      "changeArc": "情感变化弧线"
    }
  ],
  "conflictOfInterest": [
    {
      "characters": ["角色A", "角色B"],
      "conflictType": "目标冲突/资源竞争/立场对立",
      "description": "冲突描述"
    }
  ],
  "relationshipChangeNodes": [
    {"chapter": 10, "characters": ["A", "B"], "event": "关系变化事件", "newRelationship": "变化后关系"}
  ]
}

## 重要提示
- 人物关系必须复杂多维（不能非黑即白）
- 关系必须有变化弧线（不能一成不变）
- 关系变化必须有明确的章节节点`,
      versions: [
        { templateId: 'long-novel-character-network', version: '1.0.0', changelog: ['初始版本，基于两百万字指南Phase 2'], activeSince: '2026-06-23' },
      ],
      variables: ['chain_output.characters', 'chain_output.volumes'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'long-novel-foreshadowing-setup',
      name: '伏笔管理系统',
      category: 'long-novel-phase2',
      version: '1.0.0',
      description: '建立伏笔管理系统，追踪伏笔的埋设、发展、回收全过程',
      content: `你是一名资深网文策划，擅长设计和管理长篇小说的伏笔网络。

## 用户输入
- 分卷大纲：{{chain_output.volumes}}
- 人物关系网：{{chain_output.characterNetwork}}

## 执行要求
请建立完整的伏笔管理系统：

### 1. 伏笔清单
为全书规划20-30个伏笔，每个伏笔包含：
- **伏笔ID**：唯一标识符（F-01, F-02, ...）
- **伏笔内容**：具体是什么？
- **埋设位置**：第几卷第几章？
- **埋设方式**：对话提及、物品出现、环境描写、角色行为...
- **发展节点**：伏笔如何逐步发展（暗示→强化→逼近）？
- **回收位置**：第几卷第几章回收？
- **回收方式**：真相揭露、物品使用、对话确认...
- **冲击效果**：回收时对读者/角色的冲击？

### 2. 伏笔分类
- **主线伏笔**：与核心冲突直接相关（5-8个）
- **人物伏笔**：与角色背景/动机相关（8-10个）
- **世界观伏笔**：与世界设定/历史真相相关（5-8个）
- **情感伏笔**：与人物关系/情感变化相关（5-8个）

### 3. 伏笔时间线
按章节顺序排列所有伏笔的埋设和回收：
- 第1卷：埋设伏笔A、B、C...
- 第2卷：强化伏笔A、埋设伏笔D、E...
- ...
- 第X卷：回收伏笔A、B...

### 4. 伏笔密度控制
- **早期**（第1-2卷）：每章埋设0-1个伏笔，节奏舒缓
- **中期**（第3-5卷）：每章埋设1-2个伏笔，节奏加快
- **后期**（第6-8卷）：集中回收伏笔，每章回收2-3个

## 输出格式
输出合法JSON，不要markdown包裹：
{
  "foreshadowings": [
    {
      "id": "F-01",
      "content": "伏笔内容",
      "type": "主线/人物/世界观/情感",
      "setup": {"volume": 1, "chapter": 3, "method": "埋设方式"},
      "development": [{"volume": 2, "chapter": 15, "hint": "强化暗示"}],
      "recovery": {"volume": 5, "chapter": 28, "method": "回收方式", "impact": "冲击效果"}
    }
  ],
  "timeline": [
    {"volume": 1, "chapter": 3, "event": "埋设F-01", "type": "setup"},
    {"volume": 5, "chapter": 28, "event": "回收F-01", "type": "recovery"}
  ],
  "densityControl": {
    "early": "每章0-1个伏笔",
    "mid": "每章1-2个伏笔",
    "late": "每章回收2-3个伏笔"
  }
}

## 重要提示
- 伏笔必须有明确的埋设和回收位置
- 伏笔回收必须有冲击力（不能平淡无奇）
- 伏笔密度要控制（不能前期堆砌、后期遗忘）`,
      versions: [
        { templateId: 'long-novel-foreshadowing-setup', version: '1.0.0', changelog: ['初始版本，基于两百万字指南Phase 2'], activeSince: '2026-06-23' },
      ],
      variables: ['chain_output.volumes', 'chain_output.characterNetwork'],
      isActive: true,
    });

    // ==================== Phase 3: AI创作执行 (5-7个月) ====================

    this.registerTemplate({
      id: 'long-novel-daily-review',
      name: '每日回顾设定',
      category: 'long-novel-phase3',
      version: '1.0.0',
      description: '每日写作前回顾设定（10分钟）：阅读当前卷大纲、人物设定、伏笔管理表',
      content: `你是一名资深网文作者助手，擅长帮助作者在每日写作前快速回顾关键设定。

## 用户输入
- 当前卷大纲：{{user_input.currentVolumeOutline}}
- 主要人物设定：{{user_input.characterSettings}}
- 伏笔管理表：{{user_input.foreshadowingTable}}
- 已完成章节：{{user_input.completedChapters}}

## 执行要求
请生成每日回顾清单（10分钟快速回顾）：

### 1. 当前卷大纲回顾
- **卷主题**：本卷核心主题是什么？
- **当前进度**：已写至第几章？还剩几章？
- **关键事件**：接下来的章节要发生什么关键事件？
- **节奏功能**：当前章节是铺垫/蓄力/爆发/过渡/收束？

### 2. 人物设定回顾
- **出场人物**：本章有哪些角色出场？
- **性格特征**：他们的性格五维如何？如何影响行为？
- **当前状态**：他们在上一章结尾处于什么状态？
- **动机与目标**：他们在本章想要达成什么？

### 3. 伏笔管理回顾
- **待埋设伏笔**：本章需要埋设哪些伏笔？
- **待回收伏笔**：本章需要回收哪些伏笔？
- **已有伏笔状态**：之前埋设的伏笔发展如何？

### 4. 前文连贯性检查
- **上一章结尾**：上一章结尾发生了什么？如何衔接本章？
- **人物状态一致性**：人物状态是否与上一章结尾一致？
- **伏笔连续性**：伏笔发展是否连续？

## 输出格式
输出文本格式（非JSON），便于作者快速阅读：

【每日回顾清单 - 第X章】

## 一、当前卷大纲回顾
- 卷主题：...
- 当前进度：第X章/共Y章
- 接下来关键事件：...
- 本章节奏功能：...

## 二、人物设定回顾
### 出场人物A
- 性格：...
- 上一章结尾状态：...
- 本章目标：...

### 出场人物B
...

## 三、伏笔管理回顾
- 待埋设：F-05（第X章埋设）、F-06（第Y章埋设）
- 待回收：F-01（第X章回收）
- 已有伏笔状态：F-02已埋设、正在发展...

## 四、前文连贯性检查
- 上一章结尾：...
- 衔接方式：...
- 一致性确认：✓

## 预计写作时间：XX分钟
## 预计字数：XXXX字`,
      versions: [
        { templateId: 'long-novel-daily-review', version: '1.0.0', changelog: ['初始版本，基于两百万字指南Phase 3'], activeSince: '2026-06-23' },
      ],
      variables: ['user_input.currentVolumeOutline', 'user_input.characterSettings', 'user_input.foreshadowingTable', 'user_input.completedChapters'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'long-novel-chapter-prompt-gen',
      name: '生成章节提示词',
      category: 'long-novel-phase3',
      version: '1.0.0',
      description: '生成章节提示词（20分钟）：基于大纲和回顾清单，生成AI写作提示词',
      content: `你是一名资深网文AI提示词工程师，擅长为长篇小说章节生成高质量的AI写作提示词。

## 用户输入
- 每日回顾清单：{{chain_output.dailyReview}}
- 本章大纲：{{user_input.chapterOutline}}
- 出场人物：{{user_input.characters}}
- 伏笔要求：{{user_input.foreshadowingRequirements}}

## 执行要求
请生成本章的AI写作提示词（供AI生成内容使用）：

### 提示词结构
1. **身份设定**：AI应该扮演什么角色？
2. **任务描述**：本章要完成什么任务？
3. **上下文**：前文发生了什么？当前情境如何？
4. **章节大纲**：本章详细大纲（核心事件、冲突、转折）
5. **人物行为要求**：每个出场人物在本章应该如何行为？
6. **伏笔要求**：本章需要埋设/回收哪些伏笔？如何自然融入剧情？
7. **写作要求**：
   - 视角（第一人称/第三人称有限视角/全知视角）
   - 字数（目标字数范围）
   - 风格（语言风格、节奏控制）
   - 禁忌（不要写什么）
8. **输出格式**：AI应该输出什么格式的内容？

### 提示词质量要求
- **具体性**：不要模糊指令，要具体描述
- **可执行性**：AI能够理解并执行
- **约束性**：明确告诉AI不要做什么（避免跑题）

## 输出格式
输出文本格式（可直接输入AI的提示词）：

【章节AI写作提示词 - 第X章】

## 身份
你是一名资深网文写手，擅长写[小说类型]。

## 任务
请写出第X章的内容。

## 前文摘要
[前文发生了什么]

## 本章大纲
- 章节标题：...
- 核心事件：...
- 冲突：...
- 转折：...

## 出场人物及行为要求
### 人物A
- 性格：...
- 本章目标：...
- 行为要求：...

## 伏笔要求
- 埋设：F-05（通过对话自然提及）
- 回收：F-01（通过物品使用回收）

## 写作要求
- 视角：...
- 目标字数：...
- 风格：...
- 禁忌：不要...

## 输出格式
请直接输出本章正文，不要输出分析。

【提示词结束】

## 预计AI生成时间：XX分钟
## 预计人工修改时间：XX分钟`,
      versions: [
        { templateId: 'long-novel-chapter-prompt-gen', version: '1.0.0', changelog: ['初始版本，基于两百万字指南Phase 3'], activeSince: '2026-06-23' },
      ],
      variables: ['chain_output.dailyReview', 'user_input.chapterOutline', 'user_input.characters', 'user_input.foreshadowingRequirements'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'long-novel-ai-generation',
      name: 'AI生成内容',
      category: 'long-novel-phase3',
      version: '1.0.0',
      description: '使用AI生成内容（30分钟）：将提示词输入AI，生成第一版内容，检查是否符合要求',
      content: `你是一名资深网文作者助手，擅长评估AI生成的内容是否符合要求。

## 用户输入
- 章节提示词：{{chain_output.chapterPrompt}}
- 本章大纲：{{user_input.chapterOutline}}
- 写作要求：{{user_input.writingRequirements}}

## 执行要求
请评估AI生成的内容（假设AI已根据提示词生成内容）：

### 评估维度
1. **大纲吻合度**（0-10分）：
   - 是否按大纲推进？
   - 核心事件是否完整？
   - 冲突和转折是否到位？

2. **人物一致性**（0-10分）：
   - 人物行为是否符合性格设定？
   - 对话是否符合对话风格？
   - 人物状态是否连贯？

3. **伏笔处理**（0-10分）：
   - 伏笔是否自然融入剧情？
   - 埋设是否隐蔽？回收是否合理？
   - 有没有遗漏伏笔？

4. **写作质量**（0-10分）：
   - 语言风格是否符合要求？
   - 节奏控制是否得当？
   - 有没有AI痕迹（套路化表达、重复用词、逻辑跳跃）？

5. **字数达标**（0-10分）：
   - 是否达到目标字数？
   - 内容是否充实（不是注水）？

### 通过标准
- 总分 ≥ 70分
- 大纲吻合度 ≥ 7分
- 人物一致性 ≥ 7分
- 没有重大逻辑错误

### 输出格式
输出评估报告和修改建议：

【AI生成内容评估报告 - 第X章】

## 一、评分
- 大纲吻合度：X/10
- 人物一致性：X/10
- 伏笔处理：X/10
- 写作质量：X/10
- 字数达标：X/10
- **总分：X/50**

## 二、通过/不通过
- **结果**：通过/不通过（需修改）
- **理由**：...

## 三、具体问题
### 问题1：...
- 位置：第X段
- 问题：...
- 修改建议：...

### 问题2：...
...

## 四、修改优先级
1. **必须修改**（影响剧情逻辑）：...
2. **建议修改**（提升写作质量）：...
3. **可选修改**（锦上添花）：...

## 预计修改时间：XX分钟`,
      versions: [
        { templateId: 'long-novel-ai-generation', version: '1.0.0', changelog: ['初始版本，基于两百万字指南Phase 3'], activeSince: '2026-06-23' },
      ],
      variables: ['chain_output.chapterPrompt', 'user_input.chapterOutline', 'user_input.writingRequirements'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'long-novel-human-revision',
      name: '人工修改和优化',
      category: 'long-novel-phase3',
      version: '1.0.0',
      description: '人工修改和优化（1-2小时）：修正不符合设定的内容、调整语言风格、增加细节描写、确保节奏合理、检查伏笔设置',
      content: `你是一名资深网文编辑，擅长人工修改和优化AI生成的内容。

## 用户输入
- AI生成内容：{{chain_output.aiGeneratedContent}}
- 评估报告：{{chain_output.evaluationReport}}
- 修改建议：{{chain_output.revisionSuggestions}}
- 本章大纲：{{user_input.chapterOutline}}
- 人物设定：{{user_input.characterSettings}}
- 伏笔管理表：{{user_input.foreshadowingTable}}

## 执行要求
请根据评估报告和建议，对AI生成内容进行人工修改和优化：

### 修改优先级
1. **必须修改**（影响剧情逻辑）：
   - 不符合大纲的情节
   - 人物行为OOC（Out Of Character）
   - 伏笔遗漏或处理不当
   - 逻辑错误/矛盾

2. **建议修改**（提升写作质量）：
   - 语言风格调整（更贴合人物/场景）
   - 节奏优化（太快的放慢、太慢的加快）
   - 增加细节描写（环境、动作、心理）
   - 强化冲突和张力

3. **可选修改**（锦上添花）：
   - 金句/妙语
   - 幽默元素
   - 象征/隐喻

### 修改检查清单
- [ ] 情节是否符合大纲？
- [ ] 人物行为是否符合性格？
- [ ] 对话是否自然（符合身份、推动剧情）？
- [ ] 环境描写是否到位（代入感）？
- [ ] 节奏是否得当（不拖沓、不跳跃）？
- [ ] 伏笔是否妥善处理？
- [ ] 有没有AI痕迹（套路化表达）？
- [ ] 字数是否达标？
- [ ] 与前文是否连贯？
- [ ] 结尾是否留钩子？

### 输出格式
输出修改后的完整章节内容（标注主要修改点）：

【第X章 - 修改后版本】

## 主要修改点
1. **修改1**：原内容... → 修改后...（理由：...）
2. **修改2**：...
...

## 完整章节内容
[修改后的完整章节内容]

## 修改后自检
- [ ] 情节符合大纲
- [ ] 人物行为一致
- [ ] 对话自然
- [ ] 环境描写到位
- [ ] 节奏得当
- [ ] 伏笔妥善处理
- [ ] AI痕迹减少
- [ ] 字数达标
- [ ] 前文连贯
- [ ] 结尾有钩子

## 预计保存时间：XX分钟`,
      versions: [
        { templateId: 'long-novel-human-revision', version: '1.0.0', changelog: ['初始版本，基于两百万字指南Phase 3'], activeSince: '2026-06-23' },
      ],
      variables: ['chain_output.aiGeneratedContent', 'chain_output.evaluationReport', 'chain_output.revisionSuggestions', 'user_input.chapterOutline', 'user_input.characterSettings', 'user_input.foreshadowingTable'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'long-novel-save-record',
      name: '保存和记录',
      category: 'long-novel-phase3',
      version: '1.0.0',
      description: '保存本章内容、更新伏笔管理表、记录下章需要注意的内容（10分钟）',
      content: `你是一名资深网文作者助手，擅长帮助作者保存章节内容并更新管理表格。

## 用户输入
- 修改后的章节内容：{{chain_output.revisedChapter}}
- 伏笔管理表（修改前）：{{user_input.foreshadowingTableBefore}}
- 本章完成情况：{{user_input.chapterCompletion}}

## 执行要求
请完成保存和记录工作：

### 1. 保存本章内容
- 保存到文件：[小说名]_第X卷_第Y章_[章节标题].txt
- 文件编码：UTF-8
- 格式：标题、作者、正文

### 2. 更新伏笔管理表
- 标记已埋设的伏笔（F-05: 已埋设，位置：第X章）
- 标记已回收的伏笔（F-01: 已回收，位置：第X章，效果：...）
- 更新伏笔状态（发展中→即将回收）

### 3. 记录下章注意事项
- **下章大纲**：第Y+1章的核心事件是什么？
- **出场人物**：哪些角色出场？
- **伏笔任务**：需要埋设/回收哪些伏笔？
- **衔接要求**：如何从第Y章结尾自然过渡到第Y+1章开头？
- **注意事项**：有什么需要特别关注的（人物状态变化、伏笔连续性、节奏控制）？

### 输出格式
输出保存和记录结果：

【保存和记录结果 - 第X章】

## 一、保存结果
- 文件名：...
- 保存位置：...
- 文件大小：XX KB
- 字数统计：XXXX字
- **保存成功：✓**

## 二、伏笔管理表更新
### 已埋设伏笔
- F-05: 已埋设，位置：第X章，方式：对话提及

### 已回收伏笔
- F-01: 已回收，位置：第X章，方式：物品使用，效果：揭示真相

### 伏笔状态更新
- F-02: 发展中 → 即将回收（预计第X+3章回收）

（显示更新后的完整伏笔管理表）

## 三、下章注意事项
### 第Y+1章大纲
- 章节标题：...
- 核心事件：...
- 节奏功能：...

### 出场人物
- 人物A：...
- 人物B：...

### 伏笔任务
- 埋设：F-06（第Y+1章埋设）
- 回收：F-02（第Y+1章回收）

### 衔接要求
- 第Y章结尾：...
- 第Y+1章开头：...

### 注意事项
- 人物A状态变化：...
- 伏笔F-02回收要自然：...
- 节奏控制：本章是过渡章节，节奏放慢...

## 四、每日写作总结
- 今日完成：第X章，XXXX字
- 累计完成：第X卷，共Y章，ZZZZZ字
- 预计完成当前卷还需：W天
- 明日计划：第Y+1章

## 预计下章写作时间：XX分钟`,
      versions: [
        { templateId: 'long-novel-save-record', version: '1.0.0', changelog: ['初始版本，基于两百万字指南Phase 3'], activeSince: '2026-06-23' },
      ],
      variables: ['chain_output.revisedChapter', 'user_input.foreshadowingTableBefore', 'user_input.chapterCompletion'],
      isActive: true,
    });

    // ==================== Phase 4: 后期完善 (1个月) ====================

    this.registerTemplate({
      id: 'long-novel-overall-revision',
      name: '整体修改',
      category: 'long-novel-phase4',
      version: '1.0.0',
      description: '整体修改（第1-2周）：检查情节逻辑、人物一致性、节奏调整、伏笔回收、语言风格',
      content: `你是一名资深网文主编，擅长对长篇小说进行整体修改和 quality check。

## 用户输入
- 已完成的所有章节：{{user_input.allChapters}}
- 初始大纲：{{user_input.initialOutline}}
- 人物设定：{{user_input.characterSettings}}
- 伏笔管理表：{{user_input.foreshadowingTable}}

## 执行要求
请对全书进行整体修改（重点关注以下问题）：

### 1. 情节逻辑检查
- **矛盾之处**：有没有前后矛盾的情节？
- **不合理之处**：有没有不合逻辑/违背世界观的情节？
- **未完成的故事线**：有没有开篇埋下但后来遗忘的故事线？

### 2. 人物一致性检查
- **行为OOC**：人物行为是否符合性格设定？
- **动机不清晰**：人物做出某个重大决定的动机是否充分？
- **成长弧线断裂**：人物成长是否连贯（不跳跃）？

### 3. 节奏调整
- **拖沓章节**：有没有节奏太慢、水分太多的章节？
- **跳跃章节**：有没有节奏太快、缺少铺垫的章节？
- **张弛度**：整体节奏是否张弛有度（不全程高能、也不全程平淡）？

### 4. 伏笔回收检查
- **遗漏回收**：有没有埋下但忘记回收的伏笔？
- **回收不当**：有没有回收太早/太晚/太草率的伏笔？
- **新埋伏笔**：后期是否需要新埋一些伏笔（为番外/续作做准备）？

### 5. 语言风格统一
- **风格不一致**：有没有前半部分和后半部分语言风格不一致的？
- **AI痕迹**：有没有明显的AI生成痕迹（套路化表达、重复用词）？
- **阅读体验**：整体阅读体验是否流畅？

### 输出格式
输出整体修改报告：

【整体修改报告】

## 一、情节逻辑问题
### 问题1：[位置] 问题描述
- 位置：第X卷第Y章
- 问题：前后矛盾/不合理/故事线未完成
- 具体描述：...
- 修改建议：...

### 问题2：...
...

## 二、人物一致性问题
### 问题1：[人物A] 行为OOC
- 位置：第X卷第Y章
- 问题：人物行为与性格设定不符
- 具体描述：...
- 修改建议：...

### 问题2：...
...

## 三、节奏问题
### 问题1：[第X卷] 节奏拖沓
- 位置：第X卷第Y-Y+5章
- 问题：节奏太慢、水分太多
- 具体描述：...
- 修改建议：...

### 问题2：...
...

## 四、伏笔回收问题
### 问题1：[F-03] 遗漏回收
- 伏笔内容：...
- 埋设位置：第X卷第Y章
- 问题：全书结束仍未回收
- 修改建议：在第Z卷第W章回收

### 问题2：...
...

## 五、语言风格问题
### 问题1：[第X卷] 风格不一致
- 位置：第X卷
- 问题：与前半部分语言风格不一致
- 具体描述：...
- 修改建议：...

### 问题2：...
...

## 六、修改优先级汇总
1. **必须修改**（影响阅读体验）：问题1、问题3、问题5...
2. **建议修改**（提升质量）：问题2、问题4...
3. **可选修改**（锦上添花）：问题6...

## 预计修改时间：XX小时`,
      versions: [
        { templateId: 'long-novel-overall-revision', version: '1.0.0', changelog: ['初始版本，基于两百万字指南Phase 4'], activeSince: '2026-06-23' },
      ],
      variables: ['user_input.allChapters', 'user_input.initialOutline', 'user_input.characterSettings', 'user_input.foreshadowingTable'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'long-novel-detail-optimization',
      name: '细节优化',
      category: 'long-novel-phase4',
      version: '1.0.0',
      description: '细节优化（第3-4周）：优化对话、增强描写、强化冲突、深化情感、完善结尾',
      content: `你是一名资深网文细节优化专家，擅长提升长篇小说的细腻度和感染力。

## 用户输入
- 整体修改报告：{{chain_output.overallRevisionReport}}
- 需要优化的章节：{{user_input.chaptersToOptimize}}

## 执行要求
请根据整体修改报告，对重点章节进行细节优化：

### 1. 对话优化
- **符合身份**：不同身份的人物说话方式是否不同（贵族vs平民、老人vs小孩、受过教育vs文盲）？
- **推动剧情**：对话是否推动剧情（不是废话）？
- **潜台词**：对话是否有潜台词（话里有话）？
- **口语化**：对话是否自然（不是书面语）？

### 2. 描写增强
- **环境描写**：是否有足够的感官细节（视觉、听觉、嗅觉、触觉、味觉）？
- **动作描写**：是否有足够的动作细节（不是"他走了进去"，而是"他推开门，脚步声在空旷的走廊里回响"）？
- **心理描写**：是否有足够的心理活动（不是"他很生气"，而是"他感到一阵怒火窜上心头，拳头不自觉地握紧"）？

### 3. 冲突强化
- **张力**：冲突场景是否有足够的张力（不是"他们吵了起来"，而是具体的争吵内容、肢体语言、情绪升级）？
- **代价**：冲突是否让人物付出代价（不是吵完就没事，而是关系破裂、失去信任、付出生命）？
- **升级**：冲突是否逐步升级（不是一直同一个水平的冲突，而是小冲突→中冲突→大冲突）？

### 4. 情感深化
- **共鸣**：情感描写是否能让读者共鸣（不是"她很伤心"，而是具体的表现：泪珠砸在手背上、咬住嘴唇不让自己哭出声）？
- **克制**：最好的情感描写是克制的（不是嚎啕大哭，而是默默转身、肩膀微微颤抖）？
- **层次**：情感是否有层次（不是单一的悲伤/愤怒，而是悲伤中带着愤怒、愤怒中带着失望）？

### 5. 结尾完善
- **钩子**：章节结尾是否有钩子（让读者想看下一章）？
- **余味**：章节结尾是否有余味（读者读完会思考/回味）？
- **不中断**：不要在最精彩的地方中断（那会显得刻意），要在精彩之后的"余波"处中断。

### 输出格式
输出细节优化报告：

【细节优化报告 - 第X章】

## 一、对话优化
### 原对话：
"A：你为什么这么做？\nB：因为我恨你。"
### 优化后：
"A：你为什么这么做？声音在颤抖。\nB：因为十五年前的那个晚上，你父亲杀了我全家。（停顿）我以为你早就知道了。"
### 优化说明：
- 增加了动作描写（声音颤抖）
- 增加了潜台词（我以为你早就知道了→ 你一直装作不知道？）
- 对话更有张力

## 二、描写增强
### 原描写：
"他走进房间。"
### 优化后：
"他推开门，一股霉味扑面而来。月光从破败的窗棂里洒进来，照在布满灰尘的桌上。他的脚步声在空旷的房间里回响。"
### 优化说明：
- 增加了环境描写（霉味、月光、灰尘）
- 增加了感官细节（嗅觉、视觉、听觉）
- 氛围更到位

## 三、冲突强化
...

## 四、情感深化
...

## 五、结尾完善
...

## 优化后完整章节（节选关键段落）
[优化后的完整章节内容]

## 预计优化时间：XX分钟/章`,
      versions: [
        { templateId: 'long-novel-detail-optimization', version: '1.0.0', changelog: ['初始版本，基于两百万字指南Phase 4'], activeSince: '2026-06-23' },
      ],
      variables: ['chain_output.overallRevisionReport', 'user_input.chaptersToOptimize'],
      isActive: true,
    });

    // ==================== 发布策略 & 读者互动 ====================

    this.registerTemplate({
      id: 'long-novel-publishing-strategy',
      name: '发布策略',
      category: 'long-novel-publishing',
      version: '1.0.0',
      description: '选择发布平台、制定发布策略、与读者互动',
      content: `你是一名资深网文运营专家，擅长制定小说发布策略和读者互动方案。

## 用户输入
- 小说类型：{{user_input.genre}}
- 目标读者：{{user_input.targetAudience}}
- 已完成章节：{{user_input.completedChapters}}

## 执行要求
请制定发布策略和读者互动方案：

### 1. 发布平台选择
根据小说类型推荐合适平台：
- **起点中文网**：适合男频小说（玄幻、仙侠、科幻、历史、都市）
- **晋江文学城**：适合女频小说（言情、宫廷、穿越、系统）
- **番茄小说**：适合快节奏爽文（系统流、重生流、复仇流）
- **纵横中文网**：适合多种类型（武侠、奇幻、科幻）

### 2. 发布策略
- **初期**（1-50章）：
  - 日更2章，快速积累读者
  - 积极参与平台活动（新书推荐、新人榜）
  - 与读者互动，收集反馈
- **中期**（51-300章）：
  - 稳定日更1章
  - 根据读者反馈调整后续情节
  - 参与平台推荐活动（分类推荐、编辑推荐）
- **后期**（301-400章）：
  - 保持稳定更新
  - 准备完结和番外
  - 规划下一部作品

### 3. 读者互动方式
- **章节末尾提问**：与读者互动，收集意见
- **评论区回复**：及时回复读者评论
- **定期调查**：了解读者喜好和需求
- **粉丝群维护**：建立核心读者群体

### 4. 反馈处理策略
- **认真分析反馈**：找出问题所在
- **适当调整情节**：根据合理反馈调整后续情节
- **加强与读者沟通**：解释创作意图、致谢建议
- **保持自信**：坚持自己的创作理念（不是所有反馈都要听）

## 输出格式
输出发布策略和读者互动方案：

【发布策略和读者互动方案】

## 一、发布平台推荐
- **主平台**：[平台名]（理由：...）
- **辅平台**：[平台名]（理由：...）

## 二、发布策略
### 初期（1-50章）
- 更新频率：日更2章
- 平台活动：...
- 互动策略：...

### 中期（51-300章）
- 更新频率：日更1章
- 平台活动：...
- 互动策略：...

### 后期（301-400章）
- 更新频率：...
- 完结准备：...
- 下一部作品规划：...

## 三、读者互动方案
### 互动方式
1. 章节末尾提问：...
2. 评论区回复：...
3. 定期调查：...
4. 粉丝群维护：...

### 反馈处理策略
1. 分析反馈：...
2. 调整情节：...
3. 加强沟通：...
4. 保持自信：...

## 四、预期效果
- 1个月内：积累XX个收藏
- 3个月内：进入分类推荐榜
- 6个月内：获得编辑推荐
- 完结时：总收藏XXX，总推荐XXX

## 预计执行时间：XX天`,
      versions: [
        { templateId: 'long-novel-publishing-strategy', version: '1.0.0', changelog: ['初始版本，发布策略'], activeSince: '2026-06-23' },
      ],
      variables: ['user_input.genre', 'user_input.targetAudience', 'user_input.completedChapters'],
      isActive: true,
    });

    this.registerTemplate({
      id: 'long-novel-reader-interaction',
      name: '读者互动管理',
      category: 'long-novel-publishing',
      version: '1.0.0',
      description: '管理读者互动，处理反馈，调整后续情节',
      content: `你是一名资深网文读者互动管理专家，擅长处理读者反馈并据此优化后续情节。

## 用户输入
- 读者反馈：{{user_input.readerFeedback}}
- 当前情节走向：{{user_input.currentPlotDirection}}
- 初始大纲：{{user_input.initialOutline}}

## 执行要求
请分析读者反馈，决定是否需要调整后续情节：

### 1. 反馈分类
- **剧情建议**：读者建议后续情节如何发展
- **人物评价**：读者对人物的喜好/厌恶
- **节奏反馈**：读者觉得节奏太快/太慢
- **逻辑质疑**：读者指出情节逻辑问题
- **情感共鸣**：读者被某个情节打动/不满

### 2. 反馈分析
对每类反馈进行分析：
- **反馈数量**：多少读者提出相同反馈？
- **反馈质量**：反馈是否合理？是否符合人物/世界观？
- **反馈优先级**：哪些反馈必须响应？哪些可以忽略？

### 3. 调整决策
- **调整情节**：根据合理反馈调整后续情节（但不能偏离核心大纲）
- **解释说明**：在章节末尾或番外中解释创作意图（化解读者误解）
- **坚持原计划**：如果反馈不合理，坚持原定大纲（但要通过剧情"证明"角色行为的合理性）

### 4. 互动回复
- **感谢建议**：感谢读者的积极参与
- **解释决策**：解释为什么采纳/不采纳某个建议
- **剧透适度**：适度透露后续情节的"诱饵"（但不能剧透关键反转）
- **情绪安抚**：如果读者不满，要安抚情绪（但不能妥协原则）

## 输出格式
输出反馈分析报告和调整方案：

【读者反馈分析报告】

## 一、反馈分类统计
- 剧情建议：XX条
- 人物评价：XX条（正面XX，负面XX）
- 节奏反馈：XX条
- 逻辑质疑：XX条
- 情感共鸣：XX条

## 二、重点反馈分析
### 反馈1：[内容]
- 反馈类型：...
- 反馈数量：XX人提出
- 合理性分析：...
- 决策：采纳/不采纳
- 理由：...

### 反馈2：...
...

## 三、后续情节调整方案
### 调整1：[原定情节] → [调整后情节]
- 调整理由：基于读者反馈XX
- 调整位置：第X卷第Y章
- 对大纲的影响：...

### 调整2：...
...

## 四、读者互动回复模板
### 章节末尾回复
"感谢大家的积极反馈！关于XX问题，我认真考虑了大家的建议，决定在后续情节中...（适度透露）。但XX方向我不会采纳，因为...（解释理由）。继续追更，会有惊喜哦！"

### 评论区回复
"[读者名]，感谢你的建议！关于XX，其实我早就埋了伏笔（在第X章），后续会揭晓真相。期待你的持续关注！"

## 五、调整风险评估
- 风险1：调整情节可能偏离初始大纲 → 应对：只调整细节，不改变核心冲突
- 风险2：调整情节可能让老读者不适应 → 应对：在章节末尾解释调整理由
- 风险3：...

## 预计调整时间：XX小时`,
      versions: [
        { templateId: 'long-novel-reader-interaction', version: '1.0.0', changelog: ['初始版本，读者互动管理'], activeSince: '2026-06-23' },
      ],
      variables: ['user_input.readerFeedback', 'user_input.currentPlotDirection', 'user_input.initialOutline'],
      isActive: true,
    });

    // ==================== 常见问题解决提示词 ====================

    this.registerTemplate({
      id: 'long-novel-problem-solving',
      name: '常见问题解决',
      category: 'long-novel-problem-solving',
      version: '1.0.0',
      description: '解决写作过程中的常见问题：写作速度跟不上、情节卡文、读者反馈不佳、失去创作动力',
      content: `你是一名资深网文写作教练，擅长帮助作者解决写作过程中的常见问题。

## 用户输入
- 当前问题：{{user_input.currentProblem}}
- 问题详细描述：{{user_input.problemDescription}}

## 常见问题及解决方案

### 问题1：写作速度跟不上
**表现**：写不够日更字数、写作速度太慢
**解决方案**：
1. **增加每天写作时间**：固定时段写作（如每天早上2小时）
2. **使用语音输入提高效率**：语音转文字比打字快3倍
3. **提前储备章节**：周末多写几章，作为平日库存
4. **调整更新计划**：如果实在写不够，可以降低日更字数（但不能断更）

### 问题2：情节卡文
**表现**：不知道接下来写什么、情节发展不下去
**解决方案**：
1. **回到大纲，重新梳理情节**：看看是不是偏离了大纲
2. **增加新的冲突或角色**：引入新矛盾、新人物打破僵局
3. **暂时跳过当前情节，先写后面内容**：不一定要按顺序写
4. **寻求读者或其他作者的建议**：在粉丝群/作者群征求意见

### 问题3：读者反馈不佳
**表现**：收藏不涨、推荐不多、差评出现
**解决方案**：
1. **认真分析反馈，找出问题所在**：是情节问题、人物问题、还是节奏问题？
2. **适当调整后续情节**：根据合理反馈调整（但不能偏离核心大纲）
3. **加强与读者的沟通**：在章节末尾解释创作意图、致谢建议
4. **保持自信，坚持自己的创作理念**：不是所有反馈都要听

### 问题4：失去创作动力
**表现**：不想写、提不起兴趣、觉得写不下去
**解决方案**：
1. **回顾最初的创作热情**：想想为什么开始写这本书
2. **设定小目标，逐步完成**：不要想着"还有300章"，想着"今天写完这章"
3. **与其他作者交流，获取动力**：加入作者群，互相鼓励
4. **适当休息，调整状态**：如果实在写不下去，可以休息几天（但不能放弃）

## 输出格式
输出问题分析和解决方案：

【问题分析报告】

## 一、当前问题
- 问题类型：...
- 问题表现：...
- 问题严重程度：轻微/中等/严重

## 二、根本原因分析
- 原因1：...
- 原因2：...
- ...

## 三、解决方案
### 方案1：[方案描述]
- 执行步骤：...
- 预计效果：...
- 执行难度：容易/中等/困难

### 方案2：...
...

## 四、方案选择建议
- **推荐方案**：方案X（理由：...）
- **备选方案**：方案Y（如果方案X无效，尝试方案Y）

## 五、执行时间表
- 第1天：...
- 第2-3天：...
- 第4-7天：...

## 六、效果评估标准
- 如何判断问题是否解决？
- 如果方案无效，下一步怎么办？

## 预计解决问题时间：XX天`,
      versions: [
        { templateId: 'long-novel-problem-solving', version: '1.0.0', changelog: ['初始版本，常见问题解决'], activeSince: '2026-06-23' },
      ],
      variables: ['user_input.currentProblem', 'user_input.problemDescription'],
      isActive: true,
    });

    // ==================== 成功案例分析提示词 ====================

    this.registerTemplate({
      id: 'long-novel-case-study',
      name: '成功案例分析',
      category: 'long-novel-case-study',
      version: '1.0.0',
      description: '分析成功案例（如《诡秘之主》《全职高手》《雪中悍刀行》），提取可借鉴之处',
      content: `你是一名资深网文分析师，擅长分析成功案例并提取可借鉴的写作技巧。

## 用户输入
- 案例名称：{{user_input.caseName}}
- 案例类型：{{user_input.caseType}}

## 成功案例分析

### 案例1：《诡秘之主》（爱潜水的乌贼）
- **成功要素**：
  1. 详细的世界观设定（22条非凡途径、完整的神话体系）
  2. 复杂的人物关系（塔罗会成员之间的博弈与合作）
  3. 巧妙的伏笔设置（几乎每个细节都是伏笔，回收时震撼）
- **可借鉴之处**：
  1. 重视世界观构建（不要敷衍了事）
  2. 注重细节描写（环境、动作、心理）
  3. 合理设置伏笔（前期埋设、后期回收、冲击力强）

### 案例2：《全职高手》（蝴蝶蓝）
- **成功要素**：
  1. 鲜明的人物形象（叶修的淡定、黄少天的话痨、韩文清的严肃...）
  2. 精彩的竞技描写（荣耀游戏的操作细节、团队战术）
  3. 良好的节奏控制（训练→比赛→训练→比赛，张弛有度）
- **可借鉴之处**：
  1. 突出人物个性（不要千篇一律）
  2. 注重专业细节（写什么领域就要懂什么领域）
  3. 保持节奏明快（不要拖沓）

### 案例3：《雪中悍刀行》（烽火戏诸侯）
- **成功要素**：
  1. 优美的语言（文笔好，有大量金句）
  2. 深刻的人物（徐凤年、姜泥、李淳罡...每个角色都有血有肉）
  3. 宏大的世界观（庙堂、江湖、北凉、离阳...多方势力博弈）
- **可借鉴之处**：
  1. 提升语言功底（多读经典、多练笔）
  2. 深化人物塑造（给每个角色一个"魂"）
  3. 构建宏大世界观（不要局限于小打小闹）

## 输出格式
输出案例分析报告：

【成功案例分析报告 - 《XX》】

## 一、作品基本信息
- 作者：...
- 类型：...
- 字数：...
- 状态：已完结/连载中

## 二、成功要素分析
### 要素1：[要素名称]
- 具体表现：...
- 为什么成功：...

### 要素2：...
...

## 三、可借鉴之处
### 借鉴1：[借鉴内容]
- 如何借鉴：...
- 应用到自己的作品：...

### 借鉴2：...
...

## 四、对比分析
- 我的作品与《XX》的差距：...
- 我可以立即改进的3个点：...
- 需要长期提升的能力：...

## 五、行动计划
- 第1步：...
- 第2步：...
- 第3步：...

## 预计提升时间：XX天`,
      versions: [
        { templateId: 'long-novel-case-study', version: '1.0.0', changelog: ['初始版本，成功案例分析'], activeSince: '2026-06-23' },
      ],
      variables: ['user_input.caseName', 'user_input.caseType'],
      isActive: true,
    });

    // ==================== 写作工具推荐提示词 ====================

    this.registerTemplate({
      id: 'long-novel-writing-tools',
      name: '写作工具推荐',
      category: 'long-novel-tools',
      version: '1.0.0',
      description: '推荐写作工具（码字软件、大纲工具、AI工具、语音输入）和资源（同类作品、写作教程、在线课程、写作社群）',
      content: `你是一名资深网文工具推荐专家，擅长为网文作者推荐合适的写作工具和学习资源。

## 用户输入
- 作者需求：{{user_input.authorNeeds}}
- 当前使用的工具：{{user_input.currentTools}}

## 工具推荐

### 1. 码字软件
- **小黑屋**：强制码字，不能上网（适合自制力差的作者）
- **快乐码字**：云同步，多设备切换（适合在多设备写作的作者）
- **橙瓜码字**：界面简洁，专注写作（适合喜欢简洁界面的作者）

### 2. 大纲工具
- **XMind**：思维导图，梳理情节（适合视觉化思考的作者）
- **幕布**：大纲式笔记，层级清晰（适合文字型大纲的作者）
- **MindMaster**：在线思维导图，多人协作（适合团队创作的作者）

### 3. AI工具
- **豆包**：字节跳动出品的AI助手（适合中文创作）
- **ChatGPT**：OpenAI出品的AI助手（适合英文创作、信息查询）
- **Claude**：Anthropic出品的AI助手（适合长文本分析、逻辑推理）

### 4. 语音输入
- **讯飞输入法**：语音识别准确率高（适合语音码字）
- **微信语音输入**：微信内置语音输入（适合手机写作）

## 资源推荐

### 1. 同类作品
- 研究同类型爆款小说的结构和技巧（拆解成功案例）

### 2. 写作教程
- 《小说写作教程》：基础写作技巧
- 《故事》：好莱坞编剧理论（适用于所有叙事作品）
- 《救猫咪》：商业片剧本结构（适用于快节奏网文）

### 3. 在线课程
- 各种写作平台的写作课程（如起点写作课堂、晋江写作培训）

### 4. 写作社群
- 加入写作交流群，获取反馈和支持（如QQ群、微信群、豆瓣小组）

## 输出格式
输出工具和资源推荐报告：

【写作工具和学习资源推荐报告】

## 一、写作工具推荐
### 1. 码字软件
- **推荐1**：[软件名]（理由：...，适用人群：...）
- **推荐2**：...
...

### 2. 大纲工具
- **推荐1**：[工具名]（理由：...，适用人群：...）
- **推荐2**：...
...

### 3. AI工具
- **推荐1**：[工具名]（理由：...，适用人群：...）
- **推荐2**：...
...

### 4. 语音输入
- **推荐1**：[工具名]（理由：...，适用人群：...）
- **推荐2**：...
...

## 二、学习资源推荐
### 1. 同类作品
- **推荐1**：《XX》（可借鉴之处：...）
- **推荐2**：...
...

### 2. 写作教程
- **推荐1**：《XX》（适合学习：...）
- **推荐2**：...
...

### 3. 在线课程
- **推荐1**：[课程名]（平台：...，适合学习：...）
- **推荐2**：...
...

### 4. 写作社群
- **推荐1**：[社群名]（平台：...，适合：...）
- **推荐2**：...
...

## 三、工具组合方案
### 方案1：极致专注型
- 码字软件：小黑屋
- 大纲工具：XMind
- AI工具：豆包
- 语音输入：讯飞输入法

### 方案2：云端协作型
...

### 方案3：轻量便捷型
...

## 四、预算估算
- 工具1：XX元/月
- 工具2：XX元/月
- 课程：XX元
- **总预算**：XX元/月

## 预计上手时间：XX天`,
      versions: [
        { templateId: 'long-novel-writing-tools', version: '1.0.0', changelog: ['初始版本，写作工具推荐'], activeSince: '2026-06-23' },
      ],
      variables: ['user_input.authorNeeds', 'user_input.currentTools'],
      isActive: true,
    });

    // ==================== 质量门禁提示词 ====================

    this.registerTemplate({
      id: 'long-novel-quality-gate',
      name: '质量门禁检查',
      category: 'long-novel-quality',
      version: '1.0.0',
      description: '章节质量门禁：检查大纲吻合度、人物一致性、伏笔处理、写作质量、字数达标',
      content: `你是一名资深网文质检专家，擅长对章节内容进行多维度质量检查。

## 用户输入
- 章节内容：{{user_input.chapterContent}}
- 本章大纲：{{user_input.chapterOutline}}
- 人物设定：{{user_input.characterSettings}}
- 伏笔管理表：{{user_input.foreshadowingTable}}

## 执行要求
请对章节内容进行质量门禁检查：

### 检查维度
1. **大纲吻合度**（0-10分）：
   - 是否按大纲推进？
   - 核心事件是否完整？
   - 冲突和转折是否到位？

2. **人物一致性**（0-10分）：
   - 人物行为是否符合性格设定？
   - 对话是否符合对话风格？
   - 人物状态是否连贯？

3. **伏笔处理**（0-10分）：
   - 伏笔是否自然融入剧情？
   - 埋设是否隐蔽？回收是否合理？
   - 有没有遗漏伏笔？

4. **写作质量**（0-10分）：
   - 语言风格是否符合要求？
   - 节奏控制是否得当？
   - 有没有AI痕迹（套路化表达、重复用词、逻辑跳跃）？

5. **字数达标**（0-10分）：
   - 是否达到目标字数？
   - 内容是否充实（不是注水）？

### 通过标准
- 总分 ≥ 70分
- 大纲吻合度 ≥ 7分
- 人物一致性 ≥ 7分
- 没有重大逻辑错误

### 输出格式
输出质量门禁检查报告：

【质量门禁检查报告 - 第X章】

## 一、评分详情
| 维度 | 得分 | 权重 | 加权得分 |
|------|------|------|----------|
| 大纲吻合度 | X/10 | 1.0 | X |
| 人物一致性 | X/10 | 1.0 | X |
| 伏笔处理 | X/10 | 0.8 | X |
| 写作质量 | X/10 | 0.8 | X |
| 字数达标 | X/10 | 0.5 | X |
| **总分** | | | **X/50** |

## 二、通过/不通过
- **结果**：✓ 通过 / ✗ 不通过
- **理由**：...

## 三、详细反馈
### 1. 大纲吻合度（X/10）
- **符合点**：...
- **不符合点**：...
- **修改建议**：...

### 2. 人物一致性（X/10）
- **符合点**：...
- **不符合点**：...
- **修改建议**：...

### 3. 伏笔处理（X/10）
- **处理得当**：...
- **处理不当**：...
- **修改建议**：...

### 4. 写作质量（X/10）
- **优点**：...
- **问题**：...
- **AI痕迹检测**：[无/轻微/严重]（具体问题：...）
- **修改建议**：...

### 5. 字数达标（X/10）
- **目标字数**：XXXX字
- **实际字数**：XXXX字
- **达标情况**：达标/未达标
- **修改建议**：...

## 四、重大问题（必须修改）
1. **问题1**：...
2. **问题2**：...

## 五、建议修改（提升质量）
1. **建议1**：...
2. **建议2**：...

## 六、可选修改（锦上添花）
1. **建议1**：...
2. **建议2**：...

## 预计修改时间：XX分钟`,
      versions: [
        { templateId: 'long-novel-quality-gate', version: '1.0.0', changelog: ['初始版本，质量门禁检查'], activeSince: '2026-06-23' },
      ],
      variables: ['user_input.chapterContent', 'user_input.chapterOutline', 'user_input.characterSettings', 'user_input.foreshadowingTable'],
      isActive: true,
    });

    // ====================  daily-weekly-monthly review prompts ====================

    this.registerTemplate({
      id: 'long-novel-weekly-review',
      name: '每周总结和调整',
      category: 'long-novel-review',
      version: '1.0.0',
      description: '每周日进行总结：检查本周写作进度、回顾已完成章节的连贯性、调整下周写作计划、更新伏笔管理表、根据读者反馈调整后续情节',
      content: `你是一名资深网文写作教练，擅长帮助作者进行每周总结和计划调整。

## 用户输入
- 本周写作进度：{{user_input.weeklyProgress}}
- 已完成章节：{{user_input.completedChapters}}
- 伏笔管理表：{{user_input.foreshadowingTable}}
- 读者反馈：{{user_input.readerFeedback}}

## 执行要求
请进行每周总结和计划调整：

### 总结内容
1. **检查本周写作进度**：
   - 计划写作：X章，实际完成：Y章
   - 计划字数：XXXX字，实际完成：YYYY字
   - 进度评估：超前/正常/滞后

2. **回顾已完成章节的连贯性**：
   - 情节是否连贯（没有跳跃）？
   - 人物状态是否一致（没有突变）？
   - 伏笔是否连续（没有遗漏）？

3. **调整下周写作计划**：
   - 如果本周滞后，下周如何追赶？
   - 如果本周超前，下周可以放慢节奏、增加细节？
   - 是否需要调整日更字数？

4. **更新伏笔管理表**：
   - 本周埋设了哪些伏笔？
   - 本周回收了哪些伏笔？
   - 哪些伏笔即将回收（需要准备）？

5. **根据读者反馈调整后续情节**：
   - 本周收到哪些重要反馈？
   - 是否需要调整后续情节？
   - 如何回应读者反馈（章节末尾/评论区）？

### 输出格式
输出每周总结报告：

【每周写作总结报告 - 第X周】

## 一、本周进度总结
- 计划写作：X章，实际完成：Y章 → 评估：超前/正常/滞后
- 计划字数：XXXX字，实际完成：YYYY字 → 评估：达标/未达标
- **总体评估**：进度正常/需要加快/可以放慢

## 二、连贯性检查
- 情节连贯性：✓ 连贯 / ✗ 不连贯（问题：...）
- 人物一致性：✓ 一致 / ✗ 不一致（问题：...）
- 伏笔连续性：✓ 连续 / ✗ 不连续（问题：...）

## 三、下周计划调整
- 写作目标：X章，XXXX字
- 日更计划：每天Y章，ZZZZ字
- 重点章节：[章节描述]（需要特别注意：...）
- 风险预警：[潜在风险]（应对策略：...）

## 四、伏笔管理表更新
（显示更新后的伏笔管理表）

## 五、读者反馈处理
- 本周收到反馈：XX条
- 重要反馈：[反馈内容] → 决策：采纳/不采纳 → 调整方案：...
- 回复计划：章节末尾回复/评论区回复

## 六、下周重点任务
1. [任务1]
2. [任务2]
3. [任务3]

## 预计下周写作时间：XX小时`,
      versions: [
        { templateId: 'long-novel-weekly-review', version: '1.0.0', changelog: ['初始版本，每周总结'], activeSince: '2026-06-23' },
      ],
      variables: ['user_input.weeklyProgress', 'user_input.completedChapters', 'user_input.foreshadowingTable', 'user_input.readerFeedback'],
      isActive: true,
    });

    // ==================== 参考"魂穿北洋，领众破局"的提示词 ====================

    this.registerTemplate({
      id: 'long-novel-reference-manual-writing',
      name: '参考手工编写小说',
      category: 'long-novel-reference',
      version: '1.0.0',
      description: '参考"魂穿北洋，领众破局"手工编写的小说，学习其写作技巧和质量控制方法',
      content: `你是一名资深网文写作技巧提取专家，擅长从优秀作品中提炼可复用的写作技巧。

## 用户输入
- 参考作品：《魂穿北洋，领众破局》
- 参考章节：{{user_input.referenceChapters}}

## 执行要求
请从《魂穿北洋，领众破局》的手工编写章节中，提炼写作技巧：

### 分析维度
1. **开篇技巧**：
   - 如何开篇（穿越瞬间、危机降临、悬念设置）？
   - 前300字是否有强钩子？
   - 如何建立主角身份和处境？

2. **情节推进技巧**：
   - 如何通过"目标→诱因→行动→阻碍→误判→反转→代价→钩子"的节奏推进情节？
   - 如何设置递进式反转（不是只在结尾反转一次）？
   - 如何埋设和回收伏笔？

3. **人物塑造技巧**：
   - 如何通过对话展现人物性格（不是直接告诉读者"他是个勇敢的人"，而是通过具体对话和行为）？
   - 如何展现人物的成长弧线（初始状态→触发事件→变化→最终状态）？
   - 如何写人物之间的冲突和张力？

4. **环境描写技巧**：
   - 如何写历史场景（让读者有代入感）？
   - 如何写人物动作的感官细节（视觉、听觉、嗅觉、触觉）？
   - 如何写紧张氛围（不只是"他很紧张"，而是具体的生理反应：手心出汗、心跳加速、喉咙发干）？

5. **语言风格技巧**：
   - 如何用词精准（不用"他走了进去"，而用"他推开门，脚步声在空旷的走廊里回响"）？
   - 如何控制节奏（短句加快节奏、长句放慢节奏）？
   - 如何避免AI痕迹（套路化表达、重复用词、逻辑跳跃）？

### 输出格式
输出写作技巧提炼报告：

【写作技巧提炼报告 - 基于《魂穿北洋，领众破局》】

## 一、开篇技巧
### 技巧1：[技巧名称]
- 原文示例：[引用原文]
- 技巧分析：...
- 如何借鉴：...

### 技巧2：...
...

## 二、情节推进技巧
### 技巧1：[技巧名称]
- 原文示例：[引用原文]
- 技巧分析：...
- 如何借鉴：...

### 技巧2：...
...

## 三、人物塑造技巧
### 技巧1：[技巧名称]
- 原文示例：[引用原文]
- 技巧分析：...
- 如何借鉴：...

### 技巧2：...
...

## 四、环境描写技巧
### 技巧1：[技巧名称]
- 原文示例：[引用原文]
- 技巧分析：...
- 如何借鉴：...

### 技巧2：...
...

## 五、语言风格技巧
### 技巧1：[技巧名称]
- 原文示例：[引用原文]
- 技巧分析：...
- 如何借鉴：...

### 技巧2：...
...

## 六、可立即应用的3个技巧
1. **技巧A**：...
2. **技巧B**：...
3. **技巧C**：...

## 七、需要长期练习的能力
1. **能力A**：...
2. **能力B**：...
3. **能力C**：...

## 预计提升时间：XX天`,
      versions: [
        { templateId: 'long-novel-reference-manual-writing', version: '1.0.0', changelog: ['初始版本，参考手工编写小说'], activeSince: '2026-06-23' },
      ],
      variables: ['user_input.referenceChapters'],
      isActive: true,
    });

    // ==================== 所有新模板注册完毕 ====================
    // 下面是原有的公共 API 代码...
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

    // 平台风格映射
    Handlebars.registerHelper('platformLabel', (key: string) => {
      const map: Record<string, string> = {
        zhihu: '知乎盐选',
        tomato: '番茄短篇',
        qidian: '起点脑洞',
        douyin: '抖音故事',
        rule_horror: '规则怪谈',
      };
      return map[key] || key;
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
