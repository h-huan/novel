import type { SystemWorkflowRule } from './system-workflow-rule.types';

/**
 * Machine-readable projection of QUALITY_EXECUTION.md.
 * Public rule semantics originate in QUALITY_EXECUTION.md; production consumers
 * read this registry instead of re-declaring public rule text or thresholds.
 */
export const SYSTEM_WORKFLOW_RULESET_VERSION = 77;

const ALL_SCENES = ['*'] as const;
const WRITING_SCENES = ['writing', 'polish', 'review'] as const;

const rule = (value: SystemWorkflowRule): SystemWorkflowRule => value;

export const SYSTEM_WORKFLOW_RULES: readonly SystemWorkflowRule[] = [
  rule({
    id: 'GOV-001', name: 'Rule ID 与唯一来源', category: 'governance', level: 'P0', status: 'active', blocking: false,
    scenarios: ALL_SCENES, consumers: ['api', 'ui', 'test'],
    summary: '所有小说公共规则必须在 QUALITY_EXECUTION.md 以稳定 Rule ID 登记，并由本 Registry 做唯一机器映射；其它代码只能消费，不能维护第二套规则语义、阈值或修复要求。',
    implementationRefs: ['QUALITY_EXECUTION.md', 'server/shared/src/system-workflow-rules.registry.ts'],
    testRefs: ['server/src/modules/module-standards/public-rule-source.spec.ts'],
  }),
  rule({
    id: 'GOV-002', name: '规则等级与生命周期', category: 'governance', level: 'P0', status: 'active', blocking: false,
    scenarios: ALL_SCENES, consumers: ['api', 'ui', 'test'], dependencies: ['GOV-001'],
    summary: 'P0 为不变量，P1 为有证据 Hard Gate，P2 为语义质量，P3 为策略建议；生产只消费 active，迁移完成后删除 deprecated/replaced 副本。',
    implementationRefs: ['server/shared/src/system-workflow-rule.types.ts', 'server/shared/src/system-workflow-rules.registry.ts'],
  }),
  rule({
    id: 'GOV-003', name: '消费者登记与反向覆盖', category: 'governance', level: 'P0', status: 'active', blocking: false,
    scenarios: ALL_SCENES, consumers: ['test'], dependencies: ['GOV-001'],
    summary: '公共 blocking、threshold、repair、retry、save 决策必须归属 Rule ID；active 规则必须登记实际消费者与实现位置。',
    implementationRefs: ['server/src/modules/module-standards/public-rule-source.spec.ts'],
  }),
  rule({
    id: 'GOV-004', name: '规则依赖与变更影响', category: 'governance', level: 'P0', status: 'active', blocking: false,
    scenarios: ALL_SCENES, consumers: ['api', 'ui', 'test'], dependencies: ['GOV-003'],
    summary: '规则声明依赖；上游变更必须重新验证所有下游 Prompt、Gate、Repair、Save、UI 与测试。',
    implementationRefs: ['server/shared/src/system-workflow-rules.registry.ts', 'server/src/modules/module-standards/module-standards.service.ts'],
  }),
  rule({
    id: 'GOV-005', name: 'Ruleset 快照', category: 'governance', level: 'P0', status: 'active', blocking: true,
    scenarios: ALL_SCENES, consumers: ['prompt', 'semantic_gate', 'repair', 'persistence', 'test'], dependencies: ['GOV-001'],
    summary: '一次生成→评审→修复→保存链必须持有同一 rulesetVersion 与 digest；规则变化后旧评审不得与新规则混用。',
    evidencePolicy: '比较 run/context/constitution/chapter/ruleset 快照；版本或 digest 不同即旧评审失效。',
    implementationRefs: ['server/src/modules/module-standards/standard-directive.cache.ts', 'server/src/modules/generation-metrics/generation-metrics.service.ts'],
    directives: { generation: '记录当前 rulesetVersion 与规则摘要指纹，后续评审和修复必须使用同一快照。', review: '若输入绑定的 ruleset 快照与当前候选不一致，不得复用旧评审。', save: '仅接受与当前候选同一 ruleset 快照的通过结果。' },
  }),

  rule({
    id: 'AUTH-001', name: 'Creative Constitution 唯一项目约束', category: 'authority', level: 'P0', status: 'active', blocking: true,
    scenarios: ALL_SCENES, consumers: ['prompt', 'deterministic_gate', 'semantic_gate', 'repair', 'persistence'], dependencies: ['GOV-005'],
    summary: '每个项目只有一份可执行 Creative Constitution；兼容字段只能是投影，不能成为第二事实源。',
    implementationRefs: ['server/src/modules/project/creative-constitution.ts'],
    directives: { generation: '始终继承当前 Creative Constitution，不得从旧字段或历史输出重新猜测项目约束。', review: '按生成时同一 Constitution revision 评审。', repair: '修复不得改变 Constitution 或故事身份。', save: 'revision 变化时旧评审失效。' },
  }),
  rule({
    id: 'AUTH-002', name: 'Canon 事实权威优先级', category: 'authority', level: 'P0', status: 'active', blocking: true,
    scenarios: ALL_SCENES, consumers: ['prompt', 'semantic_gate', 'repair', 'persistence'], dependencies: ['AUTH-001'],
    summary: '生成、评审、修复与保存使用同一事实权威和同一优先级；RAG/摘要是派生证据，不能覆盖 Canon。',
    implementationRefs: ['server/src/modules/canon/canon-policy.ts', 'server/src/modules/generation-metrics/dependency-context.ts'],
    directives: { generation: '若资料源冲突，不自行二选一；按 Canon 优先级解析，无法安全局部化时阻断。', review: '事实冲突必须指出互斥来源与证据。', repair: '不得用派生摘要覆盖正式 Canon。' },
  }),
  rule({
    id: 'AUTH-003', name: '作者确认事实保护', category: 'authority', level: 'P0', status: 'active', blocking: true,
    scenarios: ALL_SCENES, consumers: ['repair', 'persistence', 'semantic_gate'], dependencies: ['AUTH-002'],
    summary: '作者确认的正文、题材、角色、章纲、状态、伏笔不得被模型静默覆盖；正式事实变更需差异、影响、确认与复检。',
    implementationRefs: ['server/src/modules/canon'],
  }),
  rule({
    id: 'AUTH-004', name: '世界观冻结', category: 'authority', level: 'P0', status: 'active', blocking: true,
    scenarios: ['world_building', 'outline', ...WRITING_SCENES], consumers: ['prompt', 'repair', 'persistence'], dependencies: ['AUTH-002'],
    summary: '当前产品规则下，首次通过并写入的世界观被冻结，不作为自动修复目标。',
    implementationRefs: ['server/src/modules/canon', 'server/src/chain/chain.controller.ts'],
    directives: { repair: '世界观不作为自动修复目标；与其冲突且无法安全局部修复时阻断并人工裁决。' },
  }),

  rule({
    id: 'ARCH-001', name: '唯一小说主链', category: 'architecture', level: 'P0', status: 'active', blocking: false,
    scenarios: ALL_SCENES, consumers: ['api', 'test'], dependencies: ['AUTH-001'],
    summary: '灵感→Constitution→骨架→世界/角色→卷章→ChapterPlan→上下文→首稿→确定性 Gate→语义 Gate→局部修复→Accepted Canon 为唯一主链；禁止平行 Story/Chapter/Quality/Context 系统。',
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/modules/generation-metrics/generation-metrics.service.ts'],
  }),
  rule({
    id: 'ARCH-002', name: 'ChapterPlan 唯一章节合同', category: 'architecture', level: 'P0', status: 'active', blocking: true,
    scenarios: ['outline', ...WRITING_SCENES, 'foreshadowing', 'timeline'], consumers: ['prompt', 'deterministic_gate', 'semantic_gate', 'repair'], dependencies: ['ARCH-001', 'AUTH-002'],
    summary: 'ChapterPlan 是唯一章节执行合同；生成、评审、修复共同消费同一份合同，不得另建第二套 ChapterContract。',
    implementationRefs: ['server/src/modules/generation-metrics/chapter-contract-context.ts', 'server/src/chain/chapter-outline-coordinate.ts'],
    directives: { generation: '逐项执行入口状态、推进目标、必经节拍、禁写事实、知识边界、状态变化、伏笔任务、出口状态和接力点。', review: '逐项验收 ChapterPlan，不用模糊“基本一致”替代。' },
  }),
  rule({
    id: 'ARCH-003', name: '统一章节坐标', category: 'architecture', level: 'P0', status: 'active', blocking: true,
    scenarios: ['outline', 'writing', 'review', 'foreshadowing', 'timeline', 'summary', 'state_extraction'], consumers: ['prompt', 'deterministic_gate', 'semantic_gate', 'test'], dependencies: ['ARCH-002'],
    summary: 'chapterIndex/chapterNumber 是从 1 开始的全书故事章号；数据库 order 是从 0 开始的同级内部排序，多卷可重置；正文以 outline_id 绑定章纲，禁止凭 order 猜故事章号。',
    implementationRefs: ['server/shared/src/chapter-coordinates.ts', 'server/src/chain/chapter-outline-coordinate.ts'],
    directives: { generation: '正文、伏笔、时间线统一使用 1-based 全书故事章号；不得因内部 order 改成 0-based 或减 1。', review: '章节定位以故事章号和 outline_id 为准。' },
  }),
  rule({
    id: 'ARCH-004', name: '长篇滚动规划', category: 'architecture', level: 'P2', status: 'active', blocking: false,
    scenarios: ['outline', 'writing'], consumers: ['prompt', 'semantic_gate'], dependencies: ['ARCH-002'],
    summary: '长篇冻结核心承诺/终局方向，维护卷级目标并只细化近期窗口；禁止固定每 N 章爆点等机械公式。',
    details: [
      '短篇保持单主线高密度推进；长篇按卷控制升级与兑现，但不得因长篇身份强制新增支线。',
      '章节目标字数、节奏和回报类型服从当前平台与长短篇参数，不以固定频率硬塞爽点/反转。',
      'chapterFunction/goalArc 缺失或无法识别时不得按章号、末章/倒数第二章位置或循环模板猜职责；职责必须来自 ChapterPlan/明确生成结果并经架构审查。',
    ],
    parameterRefs: ['server/src/chain/chain.controller.ts#LONG_DETAIL_OUTLINE_WINDOW', 'server/src/chain/chain.controller.ts#LONG_OUTLINE_ROLLOUT_TRIGGER'],
    implementationRefs: ['server/src/chain/chain.controller.ts'],
    directives: { generation: '节奏服从章节职责和因果推进，不使用固定章数公式生成爆点/反转模板。' },
  }),
  rule({
    id: 'ARCH-005', name: '章节责任与规则授权判据', category: 'architecture', level: 'P1', status: 'active', blocking: true,
    scenarios: ['idea_generate', 'outline', 'writing', 'review'], consumers: ['prompt', 'semantic_gate', 'repair', 'test'], dependencies: ['ARCH-002', 'AUTH-004', 'CTX-005'],
    summary: '章节规划、故事卡、边界审查和修复共用同一组 CR-1～CR-7 判据；规则触发、能力范围、跨章边界、动机/程序与长期授权必须有上层逐字证据，判据之外的疑虑不得升级为冲突。',
    details: [
      '上层规则中的 AND 条件、枚举项和精确人数/数量/证据组合/时点必须无损继承；条件未满足时只能写尚未生效的行动，不得提前兑现效果。',
      '审查只能按 CR 判据与已确认世界规则/执行标准判定；给不出被违反规则的逐字证据不得写成 blocking 冲突。',
      '修复只替换被证据证明违规的机制，保留未被指出的问题章、人物、真相、核心反转和结局；不得以同义改写保留原违规机制。',
    ],
    clauses: [
      { id: 'CR-1', label: '能力授权边界', text: '每个异常/超自然效果必须能在已确认世界规则中找到对主体、对象、载体与动作范围的逐字授权；未授权即禁止。规则若只作用于感知、记忆或身份痕迹，不得扩写为改写现实设备、记录、档案、监控或物证。一个异常效果只允许执行规则明确赋予的最小动作，不得自行增加规则未授予的能力。' },
      { id: 'CR-2', label: '触发条件与时点', text: '规则规定的前置动作、次数、人数、数量、证据组合、代价和时点必须在该章真实成立；A+B+C、两名/三份/第N次等不可被缩写或模糊，条件未满足不得出现效果，信息不得早于其在故事时间线上发生之前被知晓。' },
      { id: 'CR-3', label: '跨章边界', text: '同一推进任务不得由两章重复承担；后续章计划完成的揭示、反转或回收不得提前兑现；每章只承担一个不可替代的推进任务。' },
      { id: 'CR-4', label: '设定驱动重复豁免', text: '若已确认故事闭环或世界规则规定某机制反复发生，该重复本身不是冲突；只有重复没有带来新的推进、代价、信息或状态变化时才构成问题。' },
      { id: 'CR-5', label: '动机、立场与泄密', text: '人物改变立场、交出关键材料或对手泄密，必须有当前章或前文可见触发与既有动机；不得靠普通试探、巧合或凭空告知直接获得秘密。' },
      { id: 'CR-6', label: '证据、程序与权利生效', text: '涉及法律、行政、所有权、继承、档案校验或系统权限移交的效果，必须写明来源、生效条件、人数/数量、证据组合和时点；上层明确的程序要件不得在故事卡、章纲或正文压缩时省略，身份关系材料本身不能自动等同已生效权利。' },
      { id: 'CR-7', label: '遗留授权与长期机制', text: '既有授权、记录或自动响应必须说明发生时点、持续机制，以及本章为何在此刻生效。' },
    ],
    contracts: {
      scopeDiscipline: '只按 CR-1～CR-7 与已确认世界规则/执行标准判定；没有与判据或已确认规则直接冲突就不得引入一般常识风险、题材偏好或其它作品类比作为 blocking。',
      repairBoundary: '每章只承担独有推进任务；后续章反转不得提前；规则必须满足明确触发条件；设定规定反复发生的机制保留其重复性，只修推进、代价或信息增量；物品、份数、人员与信息来源保持可追溯。',
      losslessInheritance: '所有会改变规则是否生效的 AND 条件、枚举项、人数/数量、证据组合、时点与必要动作必须无损下传；部分条件满足只能写申请、调查、补证、等待等未生效动作。',
    },
    evidencePolicy: 'blocking 必须引用原文可定位证据与被违反的 CR 条款/已确认规则；规则文本不存在或条件尚未满足时不得靠“感觉不合理”重写。',
    implementationRefs: ['server/shared/src/index.ts', 'server/src/chain/chain.controller.ts'],
    directives: { generation: '保留上层规则触发条件与授权边界；本章只完成 ChapterPlan 的独有推进任务。', review: '逐项按 CR-1～CR-7 审查，给出逐字规则证据；判据之外不得自创冲突。', repair: '只修经证据确认的违规机制，保留其它故事事实与章节分工。' },
  }),

  rule({
    id: 'CTX-001', name: '上下文来源与优先级', category: 'context', level: 'P0', status: 'active', blocking: true,
    scenarios: ALL_SCENES, consumers: ['prompt', 'semantic_gate', 'repair'], dependencies: ['AUTH-002', 'ARCH-002'],
    summary: '当前 ChapterPlan/全文事实与最近承接优先；角色、地点、组织、RAG 等按需加载，不能让宽泛背景挤掉当前章。',
    implementationRefs: ['server/src/modules/generation-metrics/dependency-context.ts'],
  }),
  rule({
    id: 'CTX-002', name: '有界长篇上下文', category: 'context', level: 'P0', status: 'active', blocking: true,
    scenarios: ['outline', ...WRITING_SCENES], consumers: ['prompt', 'semantic_gate', 'test'], dependencies: ['CTX-001'],
    summary: '项目越长不能退化成整表扫描；明确 ID 直接读取，全书规则进入共享预算并保留截断元数据，最近剧情优先。',
    implementationRefs: ['server/src/modules/generation-metrics/dependency-context.ts'],
  }),
  rule({
    id: 'CTX-003', name: '当前章资料完整性', category: 'context', level: 'P0', status: 'active', blocking: true,
    scenarios: WRITING_SCENES, consumers: ['prompt', 'semantic_gate'], dependencies: ['CTX-001'],
    summary: '当前章相关角色、地点、组织、伏笔、时间线、最近正文与状态必须按 ChapterPlan 实际引用加载；缺资料不能靠模型猜。',
    implementationRefs: ['server/src/modules/generation-metrics/dependency-context.ts', 'server/src/chain/chain.controller.ts'],
  }),
  rule({
    id: 'CTX-004', name: '事实台账只作增量索引', category: 'context', level: 'P0', status: 'active', blocking: true,
    scenarios: ['outline', ...WRITING_SCENES, 'timeline', 'state_extraction'], consumers: ['semantic_gate', 'persistence', 'test'], dependencies: ['AUTH-002'],
    summary: '事实台账必须有稳定 factId；模型只更新已有 ID 或追加新事实，遗漏条目由服务端保留，摘要不能替代原始事实。',
    implementationRefs: ['server/src/chain/outline-fact-ledger.ts'],
  }),
  rule({
    id: 'CTX-005', name: '可计算事实一致性', category: 'context', level: 'P1', status: 'active', blocking: true,
    scenarios: ALL_SCENES, consumers: ['deterministic_gate', 'semantic_gate', 'test'], dependencies: ['AUTH-002', 'CTX-004'],
    summary: '时间、数量、次数、倒计时、年龄、库存、位置、物品状态等只有在确认是同一结构化事实且可安全计算时才能确定性阻断；自由文本猜测同一事实只能升级语义审查。',
    evidencePolicy: '确定性检查必须拿到稳定 identity、事实种类、数值/单位、来源与关系；仅靠题材关键词、单一正则或“全篇只有一个数字”不足以证明同一事实。',
    implementationRefs: ['server/src/chain/source-fact-consistency.ts', 'server/src/chain/source-countdown-consistency.ts'],
    directives: { review: '能结构化且可复算的冲突必须指出 identity、两侧数值/状态与来源；自由文本可能冲突只作为语义评审证据。', repair: '事实源冲突按 Canon 优先级或最小影响修复，不让正文自行二选一。' },
  }),

  rule({
    id: 'CTX-006', name: '组织地点与空间连续性', category: 'context', level: 'P1', status: 'active', blocking: true,
    scenarios: ['organization_map', 'outline', 'writing', 'review'], consumers: ['prompt', 'semantic_gate', 'deterministic_gate'], dependencies: ['CTX-003'],
    summary: '组织/地点只为剧情需要建立；组织层级不得循环，地点进入条件、距离与移动成本必须与时间线和人物位置一致。',
    details: ['不为“世界丰富”生成无剧情作用的组织/地点；空间移动必须有可解释的时间成本。'],
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/modules/generation-metrics/dependency-context.ts'],
  }),
  rule({
    id: 'CTX-007', name: '伏笔生命周期与知识边界', category: 'context', level: 'P1', status: 'active', blocking: true,
    scenarios: ['foreshadowing', 'outline', 'writing', 'review'], consumers: ['prompt', 'semantic_gate', 'persistence'], dependencies: ['CTX-003'],
    summary: '伏笔必须具有稳定生命周期状态、埋设/推进/回收位置与未结负债；推进不得越过角色和读者知识边界。',
    details: ['短篇少而集中；长篇可跨卷但必须持续可追踪。完结/卷末能够枚举仍未回收的有效负债，关键反转有前置证据。'],
    implementationRefs: ['server/src/chain/foreshadowing-contract.ts', 'server/src/chain/chain.controller.ts'],
  }),
  rule({
    id: 'CTX-008', name: '时间线与因果单一当前值', category: 'context', level: 'P1', status: 'active', blocking: true,
    scenarios: ['timeline', 'outline', 'writing', 'review'], consumers: ['prompt', 'deterministic_gate', 'semantic_gate', 'persistence'], dependencies: ['CTX-005'],
    summary: '时间、因果、位置和可计数状态按事件前提→结果演进；倒计时、年龄、名单/资源数量等同一事实保持单一当前值与变化证据。',
    implementationRefs: ['server/src/chain/source-fact-consistency.ts', 'server/src/chain/chain.controller.ts'],
  }),

  rule({
    id: 'GEN-001', name: '六个必填执行维度', category: 'generation', level: 'P1', status: 'active', blocking: true,
    scenarios: ALL_SCENES, consumers: ['prompt', 'deterministic_gate', 'persistence'], dependencies: ['AUTH-001'],
    summary: '创作执行维度固定为：平台 / 分类 / 基调 / 文风 / 流派 / 视角。任一必填维度缺失即“标准未执行”，必须阻断；不得用隐藏默认值、平台推荐或模型猜测补齐。',
    implementationRefs: ['server/shared/src/execution-standard-dimensions.ts', 'server/src/modules/project/creative-constitution.ts'],
  }),
  rule({
    id: 'GEN-002', name: '灵感继承', category: 'generation', level: 'P0', status: 'active', blocking: true,
    scenarios: ['idea_generate', 'world_building', 'character_design', 'outline', 'writing', 'review'], consumers: ['prompt', 'persistence', 'semantic_gate'], dependencies: ['AUTH-001'],
    summary: '灵感卡确认后，创建项目必须继承最终平台、分类、基调、文风、流派、作品/情节标签、POV、核心钩子与故事事实。题材池、淘汰候选、筛选理由仅用于诊断，不得注入确认题材的后续生成/评审上下文。单卡失败不能清空其它已通过卡；不足明确显示缺额，不用弱题材补数。',
    implementationRefs: ['server/src/chain/idea-discovery-contract.ts', 'server/src/chain/chain.controller.ts'],
  }),
  rule({
    id: 'GEN-003', name: '公共规则只由 Registry 注入', category: 'generation', level: 'P0', status: 'active', blocking: false,
    scenarios: ALL_SCENES, consumers: ['prompt', 'test'], dependencies: ['GOV-001'],
    summary: '生成、续写、流式生成、章纲、人物设计、局部精修等入口只传任务、参数与项目数据。公共写作合同由 Rule Registry 按场景注入；调用者不得复制公共规则、阈值或修复文案。任务输出 JSON schema、字段格式等局部接口合同可以留在调用者，但不得借接口合同维护第二套小说公共规则。',
    implementationRefs: ['server/src/modules/module-standards/standard-directive.cache.ts', 'server/src/chain/real-llm.service.ts'],
  }),
  rule({
    id: 'GEN-004', name: '正文执行 ChapterPlan', category: 'generation', level: 'P1', status: 'active', blocking: true,
    scenarios: ['writing', 'polish', 'review'], consumers: ['prompt', 'semantic_gate', 'repair'], dependencies: ['ARCH-002'],
    summary: '首稿与续写必须按当前 ChapterPlan 的必经事件、禁写事实、状态边界和出口状态逐项执行。历史产出不得改写本章目标；局部篇幅补足只能锚定原文和合同，不得借扩写改变剧情事实。',
    details: [
      '收尾只执行本章合同一次；终章按合同结局或余韵收束，以兑现已承诺内容为优先，不得为了统一模板强制制造续章悬念。',
    ],
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/chain/chapter-length-expansion.ts'],
  }),
  rule({
    id: 'GEN-005', name: '结构化输出与小说规则分离', category: 'generation', level: 'P0', status: 'active', blocking: true,
    scenarios: ['review', 'summary', 'state_extraction'], consumers: ['prompt', 'deterministic_gate', 'test'], dependencies: ['GEN-003'],
    summary: '评审、审计、摘要、状态提取属于结构化结论，不是小说正文；只按各自字段/证据合同验收，不能套正文篇幅、段落、对话比例或正文精修规则。被评审的正文仍须通过完整质量 Gate。',
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/chain/hardline-scanner.ts'],
  }),
  rule({
    id: 'GEN-006', name: '角色动机、声音与知识边界', category: 'generation', level: 'P2', status: 'active', blocking: false,
    scenarios: ['character_design', 'outline', 'writing', 'review'], consumers: ['prompt', 'semantic_gate'], dependencies: ['AUTH-002', 'CTX-003'],
    summary: '主要角色应有行动目标、可追溯动机和可区分声音；角色只能使用已见证、被告知或合理推断的事实，关系与成长变化须由事件和选择推动。不得把所有题材强制写成同一种悲惨、热血或牺牲情绪模板。',
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/modules/character'],
  }),
  rule({
    id: 'GEN-007', name: '正文篇幅与场景扩写边界', category: 'generation', level: 'P1', status: 'active', blocking: true,
    scenarios: ['writing', 'polish'], consumers: ['prompt', 'deterministic_gate', 'repair'], dependencies: ['GEN-004', 'PLAT-002'],
    summary: '正文按每次调用的真实 ChapterPlan 目标和验收区间收敛。篇幅不足只允许在既定场景内补足行动、阻碍、选择与结果；不得抬高目标、写后章、重复解释或在已经完成收尾后新增事件。篇幅上限也不得通过截掉收尾或必需事件达成。',
    details: [
      '## 5. 质量 Gate',
    ],
    implementationRefs: ['server/src/chain/chapter-length-expansion.ts', 'server/src/chain/chain.controller.ts'],
  }),

  rule({
    id: 'QLT-001', name: 'Blocking 优先', category: 'quality', level: 'P1', status: 'active', blocking: true,
    scenarios: ['idea_generate', 'outline', ...WRITING_SCENES], consumers: ['deterministic_gate', 'semantic_gate', 'persistence'], dependencies: ['GOV-005'],
    summary: '存在任一有证据的 Blocking 问题就不能因为综合分高而交付。缺少材料/上下文/证据时标记未评估或证据不足，不得伪造通过。分数只能辅助排序和定位。',
    implementationRefs: ['server/src/modules/writing-quality', 'server/src/chain/real-llm.service.ts'],
  }),
  rule({
    id: 'QLT-002', name: '确定性阻断必须可证伪', category: 'quality', level: 'P1', status: 'active', blocking: true,
    scenarios: WRITING_SCENES, consumers: ['deterministic_gate', 'semantic_gate'], dependencies: ['QLT-001'],
    summary: '确定性 Gate 只处理结构、明确事实互斥、可验证算术、客观边界、可定位硬红线等机器能稳定判断的问题。所有确定性阻断必须带 ruleId、定位和证据；启发式信号不得伪装为确定事实。',
    implementationRefs: ['server/src/chain/hardline-scanner.ts', 'server/src/modules/writing-quality/platform-quality-rules.ts'],
  }),
  rule({
    id: 'QLT-003', name: '语义 Gate', category: 'quality', level: 'P2', status: 'active', blocking: false,
    scenarios: ['idea_generate', 'outline', ...WRITING_SCENES], consumers: ['prompt', 'semantic_gate'], dependencies: ['QLT-002'],
    summary: '人物声音、推进有效性、场景节奏、空洞反思、关系变化、反转兑现、读者承诺等需要语义理解的问题交给完整语义 Gate。语义结论必须附正文证据；评审未完成不能视为通过。',
    implementationRefs: ['server/src/chain/real-llm.service.ts', 'server/src/chain/chain.controller.ts'],
  }),
  rule({
    id: 'QLT-004', name: '语言启发式边界', category: 'quality', level: 'P1', status: 'active', blocking: true,
    scenarios: WRITING_SCENES, consumers: ['prompt', 'deterministic_gate', 'semantic_gate', 'repair', 'test'], dependencies: ['QLT-002'],
    summary: '标点种类少、偶然等长段、缺少动作/停顿/语气词、全局转场词频、单纯段长相似不能单独构成语言 Hard Gate。只有实际重复、重复对答、相邻叙述段机械转场等可定位证据才能进入确定性阻断；其余交给语义评审。',
    implementationRefs: ['server/src/chain/hardline-scanner.ts'],
  }),
  rule({
    id: 'QLT-005', name: '实质重复检测', category: 'quality', level: 'P1', status: 'active', blocking: true,
    scenarios: WRITING_SCENES, consumers: ['deterministic_gate', 'semantic_gate', 'repair'], dependencies: ['QLT-004'],
    summary: '重复检测必须证明同构叙述、重复短语/意象、重复问答或其它实际内容重复；不能仅靠句长、标点或某个常用词频推断“AI 痕迹”。同一问题不得在确定性扫描与语义评审重复计数。',
    implementationRefs: ['server/src/chain/hardline-scanner.ts'],
  }),
  rule({
    id: 'QLT-006', name: '灵感吸引力不得按固定 N-of-M 关键词阻断', category: 'quality', level: 'P2', status: 'active', blocking: true,
    scenarios: ['idea_generate'], consumers: ['prompt', 'semantic_gate', 'test'], dependencies: ['GEN-002', 'QLT-003'],
    summary: '短篇钩子必须保留主角具体行动或明确选择，并由具体故事锚点、因果冲突/关系/信息差和可兑现方向形成阅读承诺。异常、压力、关系等信号可以按故事自然组合；不得用“4 类命中至少 3 类”之类固定计数作为 Hard Gate。关键词只能作为风险证据；若服务器绑定的结构化题材证据或完整语义审查明确证明行动/选择、因果升级、反转效果、持续追问或兑现方向不足，则语义 Gate 可以阻断。',
    implementationRefs: ['server/src/chain/idea-discovery-contract.ts', 'server/src/chain/idea-appeal-gate.service.ts'],
  }),
  rule({
    id: 'QLT-007', name: '标题与首屏独立语义审查', category: 'quality', level: 'P2', status: 'active', blocking: true,
    scenarios: ['idea_generate'], consumers: ['prompt', 'semantic_gate', 'repair'], dependencies: ['QLT-003'],
    summary: '标题与首屏不能以字段齐全、字面重合或自述新颖证明点击欲望；应锚定本故事具体人物/关系/处境/规则/代价/异常或信息差。空标题或明确通用套名可直接阻断；除此之外，标题/首屏是否兑现阅读承诺必须由完整语义证据判断，字面重合度与关键词命中只能作风险信号。Gate 点名标题时只允许沿原故事修标题表达，不得换题、改人物或提前泄露终局反转。',
    implementationRefs: ['server/src/chain/idea-appeal-gate.service.ts', 'server/src/chain/idea-discovery-contract.ts'],
  }),
  rule({
    id: 'QLT-008', name: '平台指标中的代理信号', category: 'quality', level: 'P2', status: 'active', blocking: false,
    scenarios: WRITING_SCENES, consumers: ['deterministic_gate', 'semantic_gate', 'repair'], dependencies: ['PLAT-002'],
    summary: '开篇钩子窗口、对话/段落比例、推进候选间隔等平台指标可产生风险提示；只有 Creative Constitution 或统一平台规则明确规定为硬边界时才可阻断。推进关键词间隔本身必须标记为 proxy risk，并由语义评审确认是否真实无推进。',
    implementationRefs: ['server/src/modules/writing-quality/platform-quality-rules.ts'],
  }),
  rule({
    id: 'QLT-009', name: '原创性', category: 'quality', level: 'P1', status: 'active', blocking: true,
    scenarios: ALL_SCENES, consumers: ['prompt', 'semantic_gate'], dependencies: ['AUTH-001'],
    summary: '类型母题可复用，但具体世界观、机制、角色关系、关键桥段和表达必须原创。撞名或核心机制组合高度相似应报告风险；不得保存或注入大段现实作品原文作为模仿材料。',
    implementationRefs: ['server/src/chain/chain.controller.ts'],
  }),
  rule({
    id: 'QLT-010', name: '质量报告与版本证据绑定', category: 'quality', level: 'P0', status: 'active', blocking: true,
    scenarios: WRITING_SCENES, consumers: ['semantic_gate', 'persistence', 'api', 'ui', 'test'], dependencies: ['GOV-005', 'CTX-001'],
    summary: '质量报告必须绑定正文、上下文、Creative Constitution revision、ChapterPlan/章纲定位和 ruleset 快照。任一输入变化后，旧报告必须失效或 superseded，不能继续参与修复或保存判断。',
    implementationRefs: ['server/src/modules/generation-metrics/generation-metrics.service.ts', 'server/src/modules/writing-quality'],
  }),
  rule({
    id: 'QLT-011', name: '正文语言验收必须显式完成', category: 'quality', level: 'P1', status: 'active', blocking: true,
    scenarios: ['review', 'writing', 'polish'], consumers: ['prompt', 'semantic_gate', 'persistence', 'test'], dependencies: ['QLT-003', 'QLT-004'],
    summary: '正文评审必须显式给出结构化字段 `prosePassed`（布尔值）作为语言验收结果。缺少 `prosePassed` / 语言结论，或语言不通过但没有逐字阻断证据，都表示评审未完成；不能被大纲通过、综合分或模型总 `pass` 覆盖。',
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/modules/writing-quality'],
  }),
  rule({
    id: 'QLT-012', name: '架构对齐问题的阻断证据', category: 'quality', level: 'P1', status: 'active', blocking: true,
    scenarios: ['outline', 'review', 'writing'], consumers: ['prompt', 'semantic_gate', 'deterministic_gate', 'test'], dependencies: ['ARCH-002', 'QLT-002'],
    summary: '只有明确事实互斥、必需事件缺失、事件顺序错位、后章边界越界或执行标准未落实，才能作为架构 Blocking。仅有“与大纲有出入”“缺少过渡”“口径不一致”等泛化措辞不能自动升级。',
    details: [
      '正文验收必须从当前 ChapterPlan / 详细章节合同中提取具体必需事件，按出现顺序逐项判断是否 covered 并引用正文证据；同一场景的重复描述应合并，合同明确要求的收尾也属于必需事件。',
    ],
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/chain/outline-consistency.ts'],
  }),
  rule({
    id: 'QLT-013', name: '章节必须产生真实推进', category: 'quality', level: 'P2', status: 'active', blocking: false,
    scenarios: ['writing', 'review'], consumers: ['prompt', 'semantic_gate'], dependencies: ['GEN-004'],
    summary: '章节应在目标、信息、关系、资源、风险、状态或伏笔中至少一项产生可识别真实变化。不得用推进关键词频率、固定字数窗口或标点密度代替语义推进判断。',
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/modules/writing-quality/platform-quality-rules.ts'],
  }),
  rule({
    id: 'QLT-014', name: 'POV、文风与可发布正文边界', category: 'quality', level: 'P2', status: 'active', blocking: false,
    scenarios: ['writing', 'review', 'polish'], consumers: ['prompt', 'semantic_gate', 'repair'], dependencies: ['AUTH-001'],
    summary: '叙述服从已确认 POV 与文风，不建立白描、短句、情绪直述、形容词或正常修辞的全作品禁令。正文只输出可发布故事内容，不输出方法论标题、模型过程或创作点评；故事内人物正常写字、记录、辨认笔迹不属于元叙述。',
    details: [
      '## 6. 修复规则',
    ],
    implementationRefs: ['server/src/chain/hardline-scanner.ts', 'server/src/chain/chain.controller.ts'],
  }),

  rule({
    id: 'RPR-001', name: '最小局部修复', category: 'repair', level: 'P0', status: 'active', blocking: true,
    scenarios: ['polish', 'review', 'writing'], consumers: ['prompt', 'repair', 'test'], dependencies: ['QLT-001'],
    summary: '自动修复只改可唯一定位的问题片段；无法定位或证明改善时保留原稿，禁止整章重写、换模型或降严重度兜底。',
    details: [
      '同等可修方案优先选择改动范围与下游影响更小者；锁定正文不得自动精修或自动解锁。',
      '局部语言修复既要通过确定性复扫，也要通过完整故事验收；不能只因表面命中减少就接纳。',
    ],
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/modules/generation-metrics/repair-learning.ts'],
    directives: { repair: '只修改证据锚定片段；无法证明更好时返回失败并保留原稿。' },
  }),
  rule({
    id: 'RPR-002', name: '修复禁止补造事实', category: 'repair', level: 'P0', status: 'active', blocking: true,
    scenarios: ['polish', 'review', 'writing'], consumers: ['prompt', 'repair', 'semantic_gate', 'test'], dependencies: ['AUTH-002', 'RPR-001'],
    summary: '修复不得凭空增加事件、时间、地点、动作、身体反应、感官、物品状态或关系变化；只能重排、压缩、消歧或改写已有事实。',
    details: [
      '降AI/语言精修不为制造变化强加五感、停顿、沉默、身体反应或无关对话；原文已符合标准时允许不改。',
      '不得凭空补“隔了一天”等时间事实，也不得为了换词强加感官或身体动作。',
    ],
    implementationRefs: ['server/src/modules/writing-quality/platform-quality-rules.ts', 'server/src/chain/chain.controller.ts'],
    directives: { repair: '优先重排/压缩/消歧现有材料；若达标必须新增未经原文/Canon 支持的事实，停止自动修复并升级处理。' },
  }),
  rule({
    id: 'RPR-003', name: '修复单调改善与回滚', category: 'repair', level: 'P0', status: 'active', blocking: true,
    scenarios: ['polish', 'review', 'writing'], consumers: ['repair', 'semantic_gate', 'test'], dependencies: ['RPR-001', 'RPR-002'],
    summary: '接受修复要求 Blocking 减少、最高严重度不增加、无新 Blocking/问题族/硬红线且不破坏 Constitution/ChapterPlan/事实，否则回滚并停止。',
    implementationRefs: ['server/src/chain/chain.controller.ts'],
  }),
  rule({
    id: 'RPR-004', name: '评审输出修复与小说修复分离', category: 'repair', level: 'P0', status: 'active', blocking: true,
    scenarios: ['review'], consumers: ['repair', 'test'], dependencies: ['GEN-005'],
    summary: '审查 JSON/字段不合规只修审查输出；不能借修复报告改小说/章纲/Canon。',
    implementationRefs: ['server/src/chain/chain.controller.ts'],
  }),

  rule({
    id: 'WF-001', name: '模型成功不等于业务成功', category: 'workflow', level: 'P0', status: 'active', blocking: true,
    scenarios: ALL_SCENES, consumers: ['deterministic_gate', 'semantic_gate', 'persistence', 'test'], dependencies: ['QLT-001'],
    summary: 'LLM/解析/generation run 成功不能替代 Gate、事务写入和业务状态成功；不同失败原因分别记录。',
    implementationRefs: ['server/src/modules/generation-metrics/generation-metrics.service.ts', 'server/src/chain/real-llm.service.ts', 'server/src/chain/chain.controller.ts'],
  }),
  rule({
    id: 'WF-002', name: '受控业务重试', category: 'workflow', level: 'P1', status: 'active', blocking: true,
    scenarios: ALL_SCENES, consumers: ['retry', 'semantic_gate', 'test'], dependencies: ['WF-001'],
    summary: '业务重试只用于可修结构错误或有新质量证据的可修失败；不可重试 Gate/重复失败签名立即停止，不得无限尝试。',
    implementationRefs: ['server/src/chain/chain.controller.ts'],
  }),
  rule({
    id: 'WF-003', name: '网络恢复集中在 Provider', category: 'workflow', level: 'P0', status: 'active', blocking: false,
    scenarios: ALL_SCENES, consumers: ['retry', 'test'], dependencies: ['WF-002'],
    summary: '网络/传输恢复只由 Provider 层集中负责，业务层不得再乘法叠加网络重试。',
    implementationRefs: ['server/src/chain/real-llm.service.ts'],
  }),
  rule({
    id: 'WF-004', name: '验收后才写 Accepted Canon', category: 'workflow', level: 'P0', status: 'active', blocking: true,
    scenarios: WRITING_SCENES, consumers: ['persistence', 'semantic_gate', 'test'], dependencies: ['GOV-005', 'RPR-003'],
    summary: '只有通过当前 ruleset/context/ChapterPlan 验收的候选才能事务写入正文/Accepted Canon；失败候选和过期评审不得污染正式事实。',
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/modules/generation-metrics/generation-metrics.service.ts'],
  }),
  rule({
    id: 'WF-005', name: '部分成功保留与断点恢复', category: 'workflow', level: 'P0', status: 'active', blocking: true,
    scenarios: ['idea_generate', 'outline', 'writing'], consumers: ['persistence', 'test'], dependencies: ['AUTH-002', 'WF-004'],
    summary: '批量流程单项失败不得清空已通过项；恢复必须从同一持久化权威读取，不能从旧 Prompt/临时缓存重新解释故事。',
    implementationRefs: ['server/src/chain/idea-discovery-contract.ts', 'server/src/chain/chain.controller.ts'],
  }),
  rule({
    id: 'WF-006', name: '语义评审幂等与过期失效', category: 'workflow', level: 'P0', status: 'active', blocking: true,
    scenarios: ['review', 'writing', 'polish'], consumers: ['semantic_gate', 'retry', 'persistence', 'test'], dependencies: ['QLT-010'],
    summary: '正文/上下文/Constitution/ChapterPlan/ruleset 全部未变化时复用当前有效语义评审；任一输入变化即失效并重评，禁止无新信息重复付费评审。',
    implementationRefs: ['server/src/modules/generation-metrics/generation-metrics.service.ts', 'server/src/chain/chain.controller.ts'],
  }),

  rule({
    id: 'PLAT-001', name: '分类总体量统一判据', category: 'platform', level: 'P1', status: 'active', blocking: true,
    scenarios: ['idea_generate', 'outline', 'writing', 'review'], consumers: ['deterministic_gate', 'api', 'ui', 'test'], dependencies: ['AUTH-001'],
    summary: '分类目标总字数统一使用 shared categoryWordScaleStanding 及单位兼容逻辑；页面、创建、生成和 Gate 同源。',
    parameterRefs: ['server/shared/src/category-word-scale.ts'],
    implementationRefs: ['server/shared/src/category-word-scale.ts', 'server/src/modules/writing-quality/platform-quality-rules.ts'],
  }),
  rule({
    id: 'PLAT-002', name: '平台参数单源', category: 'platform', level: 'P1', status: 'active', blocking: true,
    scenarios: WRITING_SCENES, consumers: ['deterministic_gate', 'prompt', 'repair', 'test'], dependencies: ['AUTH-001'],
    summary: '单章字数、段落、对话、开篇窗口、章尾、推进间隔等数值由唯一平台参数实现维护；Prompt/Scanner/Repair 不复制第二套阈值。',
    parameterRefs: ['server/src/chain/platform-benchmarks.ts'],
    implementationRefs: ['server/src/chain/platform-benchmarks.ts', 'server/src/modules/writing-quality/platform-quality-rules.ts'],
  }),
  rule({
    id: 'PLAT-003', name: '平台事实与样本证据边界', category: 'platform', level: 'P2', status: 'active', blocking: false,
    scenarios: ['idea_generate', 'outline', 'writing', 'review'], consumers: ['prompt', 'semantic_gate', 'learning', 'api', 'ui'], dependencies: ['PLAT-001', 'LEARN-001'],
    summary: '平台事实/分类候选必须来自可核来源；未知项明确未知。本地高质量样本不能冒充商业爆款，样本不足回退静态基线并展示证据不足。',
    implementationRefs: ['server/src/chain/platform-benchmarks.ts', 'server/src/modules/generation-metrics/repair-learning.ts'],
  }),


  rule({
    id: 'LEARN-001', name: '历史诊断不是规则', category: 'learning', level: 'P0', status: 'active', blocking: false,
    scenarios: ALL_SCENES, consumers: ['learning', 'test'], dependencies: ['GOV-001'],
    summary: '历史失败、质量问题、知识点和修复记录是诊断数据，不能自动变成 Hard Gate、事实权威或强制写作要求。',
    implementationRefs: ['server/src/modules/generation-metrics/repair-learning.ts', 'server/src/modules/generation-metrics/generation-metrics.service.ts'],
  }),
  rule({
    id: 'LEARN-002', name: '策略学习不得反写 Hard Gate', category: 'learning', level: 'P0', status: 'active', blocking: false,
    scenarios: ALL_SCENES, consumers: ['learning', 'test'], dependencies: ['LEARN-001'],
    summary: '历史学习只在当前规则允许的候选策略中排序/选择，只使用已接受修复；不得修改 Rule ID、等级、blocking、阈值、Canon、Constitution 或平台标准。',
    implementationRefs: ['server/src/modules/generation-metrics/repair-learning.ts'],
  }),
] as const;

export function activeSystemWorkflowRules(): readonly SystemWorkflowRule[] {
  return SYSTEM_WORKFLOW_RULES.filter((item) => item.status === 'active');
}

export function getSystemWorkflowRule(id: string): SystemWorkflowRule | null {
  return SYSTEM_WORKFLOW_RULES.find((item) => item.id === id) ?? null;
}

export function systemWorkflowRulesForScenario(scene: string): readonly SystemWorkflowRule[] {
  return activeSystemWorkflowRules().filter((item) => item.scenarios.includes('*') || item.scenarios.includes(scene));
}

export function systemWorkflowRuleDependencies(id: string): readonly SystemWorkflowRule[] {
  const root = getSystemWorkflowRule(id);
  if (!root) return [];
  const ids = new Set(root.dependencies ?? []);
  return activeSystemWorkflowRules().filter((item) => ids.has(item.id));
}

export function systemWorkflowRuleDependents(id: string): readonly SystemWorkflowRule[] {
  return activeSystemWorkflowRules().filter((item) => (item.dependencies ?? []).includes(id));
}

export function assertSystemWorkflowRuleRegistry(): void {
  const ids = new Set<string>();
  const params = new Map<string, string>();
  for (const item of SYSTEM_WORKFLOW_RULES) {
    if (!/^[A-Z]+-\d{3}$/.test(item.id)) throw new Error(`Invalid system Rule ID: ${item.id}`);
    if (ids.has(item.id)) throw new Error(`Duplicate system Rule ID: ${item.id}`);
    ids.add(item.id);
    if (!item.implementationRefs.length) throw new Error(`System rule ${item.id} has no implementationRefs`);
    for (const parameterRef of item.parameterRefs ?? []) {
      const owner = params.get(parameterRef);
      if (owner && owner !== item.id) throw new Error(`Parameter source ${parameterRef} is owned by both ${owner} and ${item.id}`);
      params.set(parameterRef, item.id);
    }
  }
  for (const item of SYSTEM_WORKFLOW_RULES) {
    for (const dependency of item.dependencies ?? []) {
      if (!ids.has(dependency)) throw new Error(`System rule ${item.id} depends on missing ${dependency}`);
    }
    if (item.status === 'replaced' && (!item.replacedBy || !ids.has(item.replacedBy))) {
      throw new Error(`Replaced system rule ${item.id} has invalid replacedBy`);
    }
  }
}

assertSystemWorkflowRuleRegistry();
