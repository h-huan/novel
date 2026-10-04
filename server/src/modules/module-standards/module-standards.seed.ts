import { buildCanonPolicyDirective } from '../canon/canon-policy';

/**
 * 执行标准的机器映射。
 *
 * 唯一规范文档：仓库根 QUALITY_EXECUTION.md。
 * 本文件不是第二份规范，只把规范中的稳定约束映射到模型场景；确定性硬规则、章节责任、
 * 平台基准与 Creative Constitution 仍由对应代码实现。禁止在运行时由 LLM/数据库改写本映射。
 */

export const SEED_BASELINE_VERSION = 67;

/** 唯一 Canon 规则文本由机器策略生成；旧调用点继续用这个名字，但不能再定义第二套顺序。 */
export const STORY_FACT_PRIORITY = buildCanonPolicyDirective();

export interface SeedModuleStandard {
  module_key: string;
  module_name: string;
  category: 'creation' | 'quality' | 'crosscut';
  scenarios: string[];
  business_tables: string[];
  purpose: string;
  steps: Array<{ name: string; goal: string }>;
  requirements: string[];
  rules: string[];
  quality_bar: string;
  inputs: string[];
  outputs: string[];
}

const ALL_GENERATION_SCENES = [
  'idea_generate', 'outline', 'world_building', 'character_design', 'organization_map',
  'foreshadowing', 'timeline', 'writing', 'polish', 'review', 'summary', 'state_extraction', 'daily',
];

export const SEED_MODULE_STANDARDS: SeedModuleStandard[] = [
  {
    module_key: 'quality_loop',
    module_name: '质量闭环',
    category: 'crosscut',
    scenarios: ALL_GENERATION_SCENES,
    business_tables: ['generation_runs', 'writing_quality_reports', 'writing_quality_issues', 'generation_repairs', 'generation_lessons'],
    purpose: '让每次生成都服从唯一故事权威、同一上下文证据和可回滚的质量 Gate。',
    steps: [
      { name: '继承权威', goal: '读取 Creative Constitution、世界观、当前 ChapterPlan 与冻结上下文，并按事实层级解析冲突' },
      { name: '确定性先检', goal: '先检查结构、时间、数量、章节边界、硬红线，再把剩余语义问题交给模型' },
      { name: '证据评审', goal: '问题必须定位到事实源与正文证据，未知项不得伪造分数' },
      { name: '单调修复', goal: '只做可定位局部修复；复检后问题集合必须严格改善，否则回滚并停止' },
    ],
    requirements: [
      'Blocking 问题不能被综合分抵消；上下文或 Creative Constitution 变化会使旧评审失效',
      '生成与评审使用同一章节事实选择规则和可追溯上下文，不得各读一套事实',
      '自动修复不得整章重写，不得换模型或降低严重度来换取通过',
      '锁定正文属于编辑保护：禁止自动改；若与更高层 Canon 冲突，不得判锁定正文自动胜出，必须交由作者裁决',
      '只有已接受的真实修复才能沉淀经验；失败稿不得写入 Canon',
    ],
    rules: [
      '修复前后比较必须严格单调：Blocking 总量下降、最高严重度不增加、不得引入新的 Blocking 问题；否则回滚',
      '相同 content/context/constitution/rules/chapter 指纹不得重复付费评审；输入发生变化才重新评估',
      '配置缺失、证据不足、资料源冲突都应显式阻断，禁止隐藏默认值和默认高分',
      '世界观一旦建立永不作为自动或人工修复目标；其它冲突按影响范围、修改单元、下游依赖数量与时间态计算总成本，优先修改最小代价且未锁定的局部依赖，禁止雪崩式重写',
      '任何冲突处理或人工 Canon 修改保存后必须重新执行一致性校验；仍存在的问题不得仅凭“已解决”状态隐藏',
      'Gate 失败必须留下 project/chapter/run/rule/evidence，便于机器验收和人工追踪',
    ],
    quality_bar: '事实、结构、证据与修复结果可追溯；Hard Gate 全通过后才允许交付。',
    inputs: ['Creative Constitution', '世界观 Canon', 'ChapterPlan', '冻结上下文', '当前生成结果'],
    outputs: ['QualityIssue', 'Gate 状态', '局部修复结果', '可追溯证据'],
  },
  {
    module_key: 'inspiration',
    module_name: '灵感发现',
    category: 'creation',
    scenarios: ['idea_generate'],
    business_tables: ['generation_runs', 'projects'],
    purpose: '生成原创、可执行、平台定位明确的故事卡，并把最终选择固化为项目创作宪法。',
    steps: [
      { name: '平台与类型', goal: '先确定目标平台与长短篇，再生成候选故事卡' },
      { name: '差异化发散', goal: '职业/关系/压力/机制/时间/真相/代价多轴拉开差异' },
      { name: '事实自检', goal: '时间、数量、规则机制在创建项目前必须自洽' },
      { name: '完整定稿', goal: '用户选中的卡连同执行维度与标签一起进入 Creative Constitution' },
    ],
    requirements: [
      '故事卡显式给出平台、分类、基调、文风、流派、POV、作品标签/情节标签、核心钩子、核心冲突、目标体量',
      '书名必须从本故事的具体人物关系、处境、规则、代价、异常事实或信息差中提取至少一个可识别钩子，并制造明确张力或悬念；禁止用可替换到任意故事的空泛套名（如“命运之X”“重生之X”“X的人生”“X之路”“X传奇”“爱与救赎”）充当吸引力，且不得在标题直接泄露终局反转',
      '同批候选的书名必须体现不同故事身份，不得只做同义词替换或统一模板换词',
      '任何创建必需维度缺失都必须阻断，不得静默补默认值',
      '新颖性来自组合与机制差异，不得模仿知名作品的具体人物、情节表达或独特设定组合',
    ],
    rules: [
      '故事卡定稿后，后续世界观、大纲、角色、正文、精修均从 Creative Constitution 读取同一组标签与故事事实',
      '题材母题可以通用，但具体冲突机制、人物关系、场景组合和反转必须原创',
      '平台事实与分类候选必须来自已核来源；未知项明确标注未知，不冒充官方完整清单',
    ],
    quality_bar: '选中的故事卡可直接创建项目，标题能识别本故事且具备张力，标签完整、事实自洽、与同批及历史项目有可解释差异。',
    inputs: ['用户方向', '目标平台', '长短篇', '历史项目差异信息'],
    outputs: ['完整故事卡', 'Creative Constitution 初始事实'],
  },
  {
    module_key: 'outline',
    module_name: '小说架构与章纲',
    category: 'creation',
    scenarios: ['outline'],
    business_tables: ['outlines', 'projects'],
    purpose: '把故事卡与创作宪法展开成全书骨架、卷规划和可执行 ChapterPlan。',
    steps: [
      { name: '全书骨架', goal: '锁定主线、阶段目标、人物弧、核心承诺与结局方向' },
      { name: '分卷规划', goal: '长篇按卷控制升级与兑现；短篇保持单主线高密度推进' },
      { name: '章节合同', goal: '每章明确入口状态、目标、必经节拍、禁止事实、知识边界、状态迁移、伏笔任务、出口状态与下一章接力点' },
      { name: '边界复核', goal: '本章不得提前消费下一章或未来卷的核心任务' },
    ],
    requirements: [
      '架构必须继承 Creative Constitution 的平台、分类、基调、文风、流派、POV 与标签',
      '已确认世界观硬规则与边界高于后续卷纲、章纲和 ChapterPlan；下层只能补充，不能反向修改世界规则',
      '世界规则中写明的并列前置条件、精确人数/数量、证据组合与触发时点在故事卡、章纲和 ChapterPlan 下传时必须无损保留，不得用摘要、省略或模糊复数改变生效条件',
      '章节目标字数、节奏和回报类型服从目标平台与长短篇基准，但不得机械固定爆点间隔',
      'ChapterPlan 是正文执行合同，不另建第二份章节权威',
    ],
    rules: [
      '世界规则、人物状态、伏笔生命周期、时间线必须在章纲阶段先自洽',
      '终章以收束和兑现为优先，不强制下一章钩子或新增长期伏笔',
      '空间、时间、知识边界和章节职责冲突必须在章纲阶段修正，不把矛盾推给正文 Gate',
    ],
    quality_bar: '任一章节都能回答“从什么状态进入、必须发生什么、不能发生什么、结束后改变了什么”。',
    inputs: ['Creative Constitution', '世界观 Canon', '已确认故事事实', '平台基准'],
    outputs: ['全书/卷骨架', 'ChapterPlan', '章节目标与接力关系'],
  },
  {
    module_key: 'worldbuilding',
    module_name: '世界观设定',
    category: 'creation',
    scenarios: ['world_building'],
    business_tables: ['world_settings', 'world_system_profiles', 'world_rules'],
    purpose: '建立服务冲突、具备边界与代价、可长期保持一致的世界规则。',
    steps: [
      { name: '建立框架', goal: '只生成支撑当前故事所需的时代、社会、空间与运行机制' },
      { name: '规则结构化', goal: '明确条件、作用对象、授权路径、限制、代价与例外' },
      { name: '故事对齐', goal: '逐条检查与 Creative Constitution、骨架和人物能力是否冲突' },
    ],
    requirements: [
      '规则一旦确认不得为剧情方便临时改写',
      '项目创建阶段首次世界观通过上层事实审查并写入后立即冻结；同一项目内自动生成、修复、冲突处理和人工编辑都不得再修改世界观',
      '后续资料与冻结世界观冲突时，必须在章纲、未来计划、状态、伏笔、时间线或未接受正文中选择总影响成本最低的局部修复点；若无安全修复点则人工裁决而不是改世界观',
      '长篇分层揭示，短篇只保留核心冲突所需设定',
    ],
    rules: ['同一主体同一条件下不得同时得到互斥结果', '作用于他人的规则必须说明谁执行、对谁生效、凭什么生效'],
    quality_bar: '每条核心规则都能说明边界、代价、例外和首次使用位置。',
    inputs: ['Creative Constitution', '全书骨架'],
    outputs: ['世界设定', '世界规则'],
  },
  {
    module_key: 'character',
    module_name: '角色设计',
    category: 'creation',
    scenarios: ['character_design'],
    business_tables: ['characters', 'character_extended_profiles', 'character_relationships', 'character_evolution_events'],
    purpose: '建立动机、声音、知识边界和成长路径清晰的角色系统。',
    steps: [
      { name: '角色核心', goal: '身份、欲望、恐惧、缺陷、目标、底线与错误决策模式' },
      { name: '声音区分', goal: '建立用词、句长、态度、回避方式与关系语气差异' },
      { name: '知识边界', goal: '明确当前知道/不知道什么，禁止越权获取未来信息' },
      { name: '成长与关系', goal: '状态改变必须由事件和选择推动' },
    ],
    requirements: ['主要角色必须有行动目标而非纯工具人', '人物行为、语言和关系变化必须能追溯到已有动机与事件'],
    rules: ['角色不得共享同一种解释型旁白腔', '角色不能知道未见证、未被告知、未合理推断的事实'],
    quality_bar: '主要角色的选择可由其目标、恐惧、知识和关系状态解释，跨章不漂移。',
    inputs: ['Creative Constitution', '骨架', '世界规则'],
    outputs: ['角色档案', '知识边界', '关系与成长状态'],
  },
  {
    module_key: 'organization',
    module_name: '组织与地点',
    category: 'creation',
    scenarios: ['organization_map'],
    business_tables: ['organizations', 'map_points', 'location_knowledge_profiles'],
    purpose: '只建立剧情真正需要的势力与地点，保证层级、距离、资源和利益关系可执行。',
    steps: [
      { name: '必要性筛选', goal: '短篇不堆组织，长篇按主线需要逐步扩展' },
      { name: '关系建模', goal: '明确组织目标、资源、上下级和冲突关系' },
      { name: '空间约束', goal: '地点距离、进入条件和移动成本与时间线一致' },
    ],
    requirements: ['组织不得循环隶属', '地点和势力必须能在架构中找到剧情用途'],
    rules: ['不为“世界丰富”生成无剧情作用的组织/地点', '空间移动必须符合时间成本'],
    quality_bar: '组织关系与地点约束能直接支撑章节行动，不产生空间连续性硬伤。',
    inputs: ['世界规则', '骨架', '角色'],
    outputs: ['组织结构', '地点知识'],
  },
  {
    module_key: 'foreshadowing',
    module_name: '伏笔管理',
    category: 'creation',
    scenarios: ['foreshadowing'],
    business_tables: ['foreshadowings', 'foreshadowing_threads', 'foreshadowing_lifecycle_events', 'foreshadowing_chapter_tasks'],
    purpose: '管理伏笔的埋设、推进、误导、回收与未结负债。',
    steps: [
      { name: '登记', goal: '明确内容、作用域、埋设章和预期回收点' },
      { name: '推进', goal: '按章节任务逐步增加信息，不提前泄底' },
      { name: '回收', goal: '兑现时改变读者对前文的理解，并关闭负债' },
    ],
    requirements: ['伏笔必须有生命周期状态', '完结/卷末必须能列出仍未回收的有效负债'],
    rules: ['短篇少而集中，长篇允许跨卷但必须持续可追踪', '伏笔推进不得越过角色与读者知识边界'],
    quality_bar: '关键反转有前置证据，未回收伏笔可枚举、可解释。',
    inputs: ['骨架', 'ChapterPlan', '时间线'],
    outputs: ['伏笔生命周期', '章节伏笔任务'],
  },
  {
    module_key: 'timeline',
    module_name: '时间与因果',
    category: 'creation',
    scenarios: ['timeline'],
    business_tables: ['timeline_events', 'timeline_causality_links', 'timeline_three_line_events', 'timeline_chapter_tasks'],
    purpose: '统一故事时间、叙事顺序、因果和数量状态，防止跨章硬伤。',
    steps: [
      { name: '事件登记', goal: '记录时间、地点、参与者、前提和结果' },
      { name: '因果链接', goal: '明确触发条件与后果，不允许结果早于前提' },
      { name: '章节对齐', goal: '与人物位置、伏笔、世界规则和 ChapterPlan 双向校验' },
    ],
    requirements: ['可计算的时间和数量必须计算，不让模型凭感觉补齐', '同一角色不能在同一时段无解释地出现在互斥地点'],
    rules: ['倒计时、年龄、名单数量、资源数量等状态变化必须有单一当前值和变化证据'],
    quality_bar: '事件顺序、空间移动、时间差和数量变化均可复算。',
    inputs: ['骨架', 'ChapterPlan', '角色/世界/伏笔状态'],
    outputs: ['时间线', '因果链', '可计算状态'],
  },
  {
    module_key: 'body',
    module_name: '正文生成',
    category: 'creation',
    scenarios: ['writing'],
    business_tables: ['chapters', 'outlines'],
    purpose: '严格按 Creative Constitution、世界观、ChapterPlan 和冻结上下文生成本章正文。',
    steps: [
      { name: '读取合同', goal: '确认本章入口、目标、必经节拍、禁写事实、知识边界与出口状态' },
      { name: '正文生成', goal: '用场景行动和人物选择完成任务，不靠总结说明替代剧情' },
      { name: '边界检查', goal: '不提前消费未来章任务，不改写已确认事实' },
      { name: '质量入库', goal: 'Hard Gate 通过后才保存为正文 Canon' },
    ],
    requirements: [
      '正文必须继承故事卡最终平台/分类/基调/文风/流派/POV/标签，不得在写作阶段重新猜定位',
      '最近正文、当前人物状态、相关伏笔/规则/时间线优先于宽泛背景资料，但不得覆盖更高层 Creative Constitution 与世界观硬规则',
      '已锁定正文禁止自动修改；锁定正文与更高层 Canon 冲突时必须人工裁决，不允许自动选择任一侧',
      '篇幅按 ChapterPlan 目标收敛；禁止用重复解释、同义改写或机械段落凑字数',
    ],
    rules: [
      '人物只能使用其当前知识；空间、时间、数量和物品状态必须连续',
      '段落长短服务场景节奏，禁止连续等长段、客服式问答、模板化生理反应和过量总结升华',
      '章节必须产生可识别变化：目标、信息、关系、资源、风险、状态或伏笔至少一项实际推进',
    ],
    quality_bar: '正文与架构一致、事实连续、人物声音可辨、段落自然，并在平台节奏下完成本章职责。',
    inputs: ['Creative Constitution', '世界观 Canon', 'ChapterPlan', '冻结上下文'],
    outputs: ['通过 Gate 的章节正文'],
  },
  {
    module_key: 'polish',
    module_name: '局部精修',
    category: 'quality',
    scenarios: ['polish'],
    business_tables: ['chapters', 'generation_repairs'],
    purpose: '在不改变故事身份和章节职责的前提下，只修有证据的问题。',
    steps: [
      { name: '定位', goal: '每个修复必须绑定唯一原文锚点和问题证据' },
      { name: '局部替换', goal: '修改最小必要范围，不整章重写' },
      { name: '复检', goal: '重新跑确定性与语义 Gate，并比较新旧问题集合' },
    ],
    requirements: ['修复不得引入新 Blocking', '修复不得改变 Creative Constitution、世界观、ChapterPlan 或已确认事实', '锁定正文不得自动精修或自动解锁'],
    rules: ['不能唯一定位原文就不自动改', '无单调改善立即回滚并停止自动修复', '同等可修复方案优先选择改动范围与下游影响更小的一项'],
    quality_bar: '修复后阻断问题严格减少且没有新硬伤，故事身份保持。',
    inputs: ['原正文', 'QualityIssue', '冻结上下文'],
    outputs: ['局部补丁', '复检结果'],
  },
  {
    module_key: 'review',
    module_name: '质量评审与状态抽取',
    category: 'quality',
    scenarios: ['review', 'summary', 'state_extraction', 'daily'],
    business_tables: ['writing_quality_reports', 'writing_quality_issues', 'state_items', 'chapter_summaries'],
    purpose: '从真实正文与同一事实上下文提取可追溯问题、摘要和状态，不制造新事实。',
    steps: [
      { name: '确定性检查', goal: '先处理可计算、可枚举、可正则/结构判断的问题' },
      { name: '语义检查', goal: '只评估需要语义判断的剩余维度，并引用具体证据' },
      { name: '状态抽取', goal: '只从已接受正文抽取人物/关系/伏笔/时间线变化候选' },
      { name: '阻断判定', goal: 'Hard Gate 失败即不可交付，不被均分掩盖' },
    ],
    requirements: ['不得根据不存在的上下文推断事实', '摘要不能成为比正文更高权威的事实源', '冲突人工处理保存后必须重新检测，不得仅更新 issue.status'],
    rules: ['架构一致、人物知识、世界规则、时间数量、伏笔和 POV 属于 Hard Gate', '语言/节奏/平台/AI 痕迹等软维度必须给证据而不是给无来源概率'],
    quality_bar: '每个结论都能回到原文和事实源；Hard Gate 与软评分分离。',
    inputs: ['正文', 'Creative Constitution', '世界观 Canon', 'ChapterPlan', '冻结上下文'],
    outputs: ['质量报告', '状态候选', '章节摘要'],
  },
  {
    module_key: 'platform_fit',
    module_name: '平台适配与经验优化',
    category: 'crosscut',
    scenarios: ['idea_generate', 'outline', 'writing', 'polish', 'review'],
    business_tables: ['quality_benchmark_samples', 'writing_quality_reports'],
    purpose: '在不改写硬标准和项目创作宪法的前提下，用平台基线与已接受真实样本优化软策略。',
    steps: [
      { name: '读取基线', goal: '平台静态事实/行业基线来自 platform-benchmarks' },
      { name: '读取实证', goal: '只使用来源清楚、质量已确认的同平台/同类型本地样本' },
      { name: '软策略调整', goal: '优化节奏、对话密度、回报类型、钩子等软指标，不修改 hard rules' },
    ],
    requirements: ['本地高质量样本不得冒充商业爆款', '样本不足时回退静态基线并明确证据不足'],
    rules: ['平台自优化只能改变软策略/经验权重，不能改变 Creative Constitution、Hard Gate、严重度或唯一执行标准'],
    quality_bar: '平台建议有来源、有样本量、有回退路径，不越权修改硬标准。',
    inputs: ['平台基线', '已接受样本', 'Creative Constitution'],
    outputs: ['平台软策略建议', '可审计经验指标'],
  },
];