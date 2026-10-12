import type { SystemWorkflowRule } from './system-workflow-rule.types';

/**
 * Machine-readable projection of QUALITY_EXECUTION.md.
 * Public rule semantics originate in QUALITY_EXECUTION.md; production consumers
 * read this registry instead of re-declaring public rule text or thresholds.
 */
/** 连续修复的升级边界；这是流程预算，不是正文质量阈值。 */
export const UPSTREAM_REPAIR_ROUTING_LIMITS = { sameFamilyAfterAttempts: 1, maxLocalAttemptsBeforeDiagnosis: 2, maxSourceRepairModelCalls: 3 } as const;
export const UPSTREAM_REPAIR_ROUTING_POLICY = '同类缺陷经局部修复仍存在、问题集合增长或局部修复进入连续循环时，先回查章节合同、上下文装配、生成执行与审查协议，再决定处理阶段。不得只因有局部改善持续下游修复；上游诊断必须引用本次输入与正文证据，不能把猜测当已确认源冲突。诊断未完成时保留草稿与原质量结论；修改已确认上游事实须按原作者确认与锁定规则处理，不能自动重写正文或回写Canon。质量候选回滚时须同时显示原稿保留与候选复检的实际阻断或未知维度，不只重复修复前的旧缺陷。失败候选的事实不得进入Canon，其必要条件诊断须作为只读反馈传给下一次源头修订，依赖未通过的候选仅在内存继续修订，锚点取本轮候选位置目录，原Canon作为提交原值校验基线；整体复检通过后才原子提交。原因相同的必要依赖修改一起保留，只有显式声明的互斥备选组才做成本择一；相同或无变化候选不重复复检。每个源头修订任务共用物理模型调用预算，扩容、网络恢复和协议纠错不能重置预算；耗尽或候选复检仍失败时如实停止，不能把停止当验收成功。';
export const SYSTEM_WORKFLOW_RULESET_VERSION = 190;
/** Default language acceptance floor; project score policy remains explicitly configurable. */
export const DEFAULT_LANGUAGE_SCORE_FLOOR = 70;

/** QLT-014拥有自然正文表达的唯一完整政策；其它场景通过Registry消费。 */
export const NATURAL_PROSE_POLICY = '正文先让读者看懂谁在做什么、为什么改变处境，人物、时间、地点、物件状态和知情边界保持一致。自然表达服从已选文风、时代与人物身份：适合口语的地方可用省略、语气词、停顿、改口和简短应答，句子与段落随意思长短变化；叙述不必句句工整、对称或像汇报，但不能牺牲可理解的主谓、指代与必要因果。标点跟着语义和语气，不规定种类配额、不拆成单字句、不机械只用逗号句号，也不为制造变化堆标点。连续列举的动作、记录或物件按实际句意连写，不把每个词拆成独立句制造紧张；问句、打断与停顿使用符合语气的标点，不靠统一替换逗号句号或添加破折号修饰文风。排比与反复须有强调、递进、对照或人物情绪的实际作用；相邻或反复出现的同构列举、三段式总结、否定再转折若只把已知信息说齐、说满，合并叙事功能。保留有作用的修辞，不规定排比数量，也不将正常列举、偶然齐整或人物有意复述判为AI痕迹。人物可以迟疑、误判或说不周全的话，须符合当时所知与处境；不为模仿人写而故意加入错字、病句或事实矛盾。验证和复盘中的每次尝试须处理不同疑问或改变判断：首次确认异常、他人无法复现、对手回避各有作用，可以保留；反复退出、重开或换词说同一状态而没有新增信息时，合并其叙事功能，不能为篇幅堆验证动作。已经由行动、对白或物证让读者理解的信息，不再用总结句、心理自述或旁白换词复述；用删除检验判断解释作用：去掉后仍能理解当下选择、必要前提和结果，且没有新增证据、状态变化或人物立场时，压缩重复说明；后一次提及若改变选择、提醒局面变化或形成反差则保留，不按重复词频一律删除。理解下一步选择确实需要的心理、前提和衔接要保留，未到期谜底不解释。对白承担真实交流意图，允许回避、试探、答非所问和潜台词，读者仍能理解必要意图；不让每个人轮流完整说明背景或精确回答所有问题。逻辑修复先更正错误行动、知情顺序或判断范围，不用枚举所有排除项、逐段补程序与旁白免责代替有效路径；正常必要衔接保留，修复候选同样按删除检验检查重复解释。降低AI痕迹针对有证据的重复解释、模板句式、整齐成串的同构动作、同质声音与无作用细节；表达清楚、句子通顺或偶尔规整本身不是缺陷，不用随机换词、添动作或故意写错取代真实叙事。';
export const READER_ENGAGEMENT_POLICY = '长短篇共同追求高点击倾向、高完整阅读倾向、高传播倾向和高代入感，评审逐项定位当前阶段实际原文，分别说明成立机制、薄弱处或证据不足，不用关键词计数、总分或模型自述代替读者证据，不预测实测点击率、完读率或传播率。点击：标题与首屏呈现读者能懂的具体欲望、利益、反常关系或问题，首屏兑现标题承诺，不能靠虚假危机或提前泄露答案吸引点击。完整阅读：主角主动选择引出可信后果、有效对手、变化的筹码与阶段兑现，爽点来自有铺垫、有代价且由人物行动赢得的局面改变，如反制、夺回主动权、关系回应、成长或认知反转；须核对本阶段实际兑现及人物感受，不能把预告、围观喝彩或旁白宣布当成兑现，也不强制每章打脸、暴富或机械反转。悬念随信息和行动推进，必要因果清楚，重复解释和注水减少；短篇围绕主线形成全篇闭环与终局回收，长篇以可持续的人物欲望、关系发展、成长或利益博弈支撑不同阶段的局部闭环与下一阶段新问题，不把同一谜底反复延迟，不要求每章解决全书冲突。传播：由具体人物选择、关系转变、可复述的独特处境、公平伏笔或余味引出读者愿意讨论、推荐或分享的内容，讨论来自真实取舍与意义，不强制金句、道德争吵、狗血或猎奇，不用情绪刺激替代故事。深度通过人物具体取舍、关系的矛盾与变化、选择留下的后果和有铺垫的余味体现；在传播与代入判断中核对这些实际作用，不将说教、悲惨程度、概念堆砌或旁白总结当深度，不强迫所有类型沉重化。代入：读者能理解人物想要什么、为何在乎、眼前能知道什么与做不了什么，生活细节、场景动作、关系互动和心理随事件成立；普通生活与幻想世界均用可理解的愿望和代价建立情感连接，不强制贫穷、病亲、牺牲、悲剧或固定情绪配额。规划阶段先明确各阶段行动前后有什么局面改变、由谁选择、对手怎样响应、人物获得什么可用筹码或关系回应。开篇建立具体欲望和主动选择，前期允许小兑现，不能把全部正向变化推到高潮，连续受挫不能只累计罚款、病情或跑手续。新线索只有改变可行行动、人物判断、关系或博弈筹码，才构成阶段回报；拿到结论但处境与选择完全不变，不自动判高爽点。回报可以是认知反转、情感回应、脱困或夺回部分主动权，不强制每章打脸或获利。结局代价须与已选基调和主线承诺相称，牺牲不能替代救人、问责、成长或关系的实际兑现；允许苦涩结局，不把代价越大当质量越高。题材阶段评潜力和计划，正文阶段核对实际体验及到期承诺，不把未写情节当成已实现效果。题材规划中决定主线与终局的标题悬念、核心线索和关系承诺须说明其真实作用、推进与到期回收，完整卡在ending或scopeBreakdown写清对应兑现安排，不让关键开篇线索到结局凭空消失；不要求解释无关细节或正文提前揭示答案。所选类型、分类与流派的核心阅读期待须由人物互动、选择和后果落实，不能只贴标签或到结尾才加一段不影响主线的表态；允许非婚姻结局与情绪留白，但仍须兑现本作品已建立的关系变化。正文评审须核对点击承诺是否真实兑现、哪些重复说明或因果障碍妨碍读完、什么具体选择或关系变化值得复述与分享；每项给出本次原文和机制。自然语气服务理解与代入，不以工整程度判断商业潜力，也不把语病当传播点。';

export const IDEA_REVIEW_EVIDENCE_POLICY = '题材评审的证据由服务器为实际卡片的故事字段建立编号目录；模型选择本卡证据编号并解释阅读机制，程序按编号回填连续原文，不让模型重新生成引文。编号只能指向当前卡的实际故事字段，不能引用另一卡、执行标准、锁定前胚子或自造路径；无效编号不得用自写引文兜底。引文校验错误须点明卡片position和具体字段，只纠正审查证据与结论，不改写小说、不降低四项目标及事实关卡；weak与unknown仍不能标高倾向，协议失败保持未评估。';

export const IDEA_PRESELECTION_REVIEW_POLICY = '完整题材卡生成前，已选胚子须分开独立复核原池事实继承与同批核心差异，汇总两类全部问题后再进行一次修正或原池重选，不能把生成者自称差异当作已通过筛选。比较人物欲望、关系、主动选择、对手制约、因果升级、反转改变与兑现代价，共享主题不等于同一故事，只换职业、道具、名字或分类不算实质差异。问题须绑定对应题材的两段连续原文与具体理由，错引、编造或不自洽结论先纠正评审。锁定前允许一次原池重选，由服务器按原位置保留未被指出问题的选择；模型只提交问题位置的替换与完整筛选证据，不重写正常项。已证实同构项须换选原池其它可用身份，不能保留原身份只换表述；仅来源偏移允许沿原身份纠正展开。候选须与保留项及其它换选项对照完整因果链，原池骨架和分类不可改变，禁止扩大池、补生或改分类制造差异；修正或重选后再次分别独立复核，未通过不得生成完整卡。结构化须读取同批胚子作为差异边界，仅展开自己的因果链。最终验收不能通过换题或新增机制消除原胚子重合，缺量仍不得报成功。';

export const STORY_CAUSAL_STATE_POLICY = '区分既有场景状态与本次新声称的能力或结果：同一行动句、紧邻上下文或正常语义已明确蕴含的参与者、地点、物件归属和留在现场等状态，可以作为前提，不要求另补一句重复交代。只报撤掉所需机制后仍无法由原文成立的实际缺口，不能因前提没有单列就报gap。既有地点不等于新获得的限制能力，既有任务已经按时完成也不能被后续动作倒改为超时；这些改变仍须真实机制。把对手困住、救下、夺回或使其无法离开等完成性措辞本身只声明效果，不自动证明对手的正常反应能力已经失效；必须找到改变该能力的具体操作与对象机制，不能把反锁、控制等效果词当作操作机制的全部证据。既有位置、参与者的自然蕴含不能推广为未交代的限制手段；已确认机构权限下的普通处置也不额外补无关手续。已确认世界规则可证明对象的操作机制与允许条件，当前章节实际动作可证明该机制被触发，两类证据须合起来核对；不能因为世界规则不在正文里重复，就认定已确认机制缺失。世界允许某种授权不等于人物已取得该授权，但固定的物件结构不需要再次获得或重述。';
export const STORY_CAUSAL_REVIEW_POLICY = STORY_CAUSAL_STATE_POLICY + '先确认正文确实声称当前行动导致所配对的结果，再核对该因果关系。先前已完成的结果不能配成后来指令的新结果；后发生的行动不能让已完成任务变成超时或失败，另有未完成任务时须在当前计划中明确，不能临时假定。提醒、确认既有状态或重复要求不必新增事件。错配属于评审账目问题，应沿正文重新选择已有关键行动结果，不能据错配要求正文新增投诉、惩罚、授权或其它后果。缺少必要条件仍须保留真实gap；不把故事已经成立的正常状态或尚未到期的计划当缺口。口头承诺、预计办理时限与计划不等于结果已经兑现，不要求为未到期承诺补系统流程解释。引用协议纠错只替换点名无效条目，保留其它已验证行，不因修引文重新发现或新增别的因果链。先核对关键行动如何导致已声称的结果：分别定位行动、结果和必要桥接条件，检查权限、传播、执行者动机、对手反应与时间先后。展示改字、公布证据、揭晓身份或获得线索，不自动等于获救、停刑、胜诉、夺回资产或对手认罪。已确认结局方向与计划要达到的状态不是实现机制的证据；受他人能力或机构决定制约时，不能以同一句目标、prerequisites中的目标复述或未选择的若干可行方案证明兑现，规划须选择实际路径并交代必要触发。明确授权的虚构机制仍按其规则执行，不强加现实流程。取得材料的权限、材料实际内容、内容与目标的对应关系、最终处置是不同条件；凡故事将线索转成身份认定、归责或机构决定，须核对材料如何排除关键歧义并关联目标，以及谁依据什么实际完成处置，不能把取得材料这一项当成整条结果链成立。按已声称的实际结果核对全部必要环节，不能只抽查最容易成立的一项；不要求列出无关程序、所有理论可能或未到期谜底。上游修订须同步核对受影响行动到出口状态的必要条件链，不能仅补一个权限或证据名称后重复原结论。用反事实检查：若撤掉主角行动，结果是否仍会发生；若对手按已知利益行动，结果是否仍成立。可直接理解的日常结果无需多余程序解释；改变生命、权利或机构决定的结果必须有足以成立的条件，不以主角希望或旁白断言替代。缺口与留白分开：只报影响当前行动理解或已到期结果的必要前提，不要求解释能力起源或未到期谜底。';

export const SHORT_STORY_QUALITY_POLICY = '短篇按当前阶段核对阅读承诺：异常要落在可理解的生活利益或关系风险；设定主要提供信息、限制或代价，关键胜负由主角选择与可复盘行动产生。反转应改变目标、筹码、关系或代价，不能仅换身份、换道具或推翻早先成立的规则；伏笔可回看且不提前替读者点明答案。人物关系用有区别的互动和利益建立，不能只贴亲情、贫穷或病弱标签；对手有可理解的利益和有效反应，不为主角获胜失去已有能力。阶段兑现、挫折和呼吸段随情节组织，不按固定字数塞反转、对白或打脸；终局按全篇职责兑现核心承诺并保留真实代价，不用公开证据一次解决所有问题。语言要易懂、语气符合人物与时代，必要心理和因果可直说，重复解释才收敛；正常长短句、常用语气词和自然标点不构成AI痕迹。核对专业操作的物件、载体转换与连续时间，不能把样张、原件、模具和成品混为一物，不能用虚构工序支撑关键结果；只交代理解行动所需的细节，资料不足不编造精确流程。平台案例只作有来源的参考，不复刻样本剧情，不把经验偏好当官方硬阈值，不据文本分数预测商业爆款或读完率。';

export const CHARACTER_VOICE_POLICY = "每个参与情节的角色都应有与其身份、欲望、关系和经历相符的专属行事风格与对话风格，不只区分主角；次要或临时角色按实际戏份提供足够区分，不为填档案扩写无关身世。新建角色时把风格落为可执行的表达偏好、交流策略和压力反应，写入当前人物档案；已有档案以作者当前确认内容为准，缺失处只提出待确认候选，不自动补写设定。口语、地方话、傲娇、高冷、自卑等是可组合的风格方向，不能只贴标签：可从选词、直白或含蓄程度、停顿与改口、回避或试探、对不同对象的态度、言行反差体现。傲娇可以嘴硬而行动关心，高冷可以克制但有明确立场，自卑可以在特定关系中退让而在熟悉领域有主见；这些只是可能的表现，不是固定台词或每句必须出现的模板。地方话须符合已确认地域、时代与经历，适度使用可理解的词汇和语气，不凭身份猜口音、不堆生僻谐音或以地域制造刻板印象。风格独属于人物的组合与选择方式，不要求每个角色都使用互不重叠的词、独占某种性格或每句台词都显著不同。角色生成、章纲、正文、评审与修复沿同一当前档案和关系状态执行；情绪、成长或关系变化可以改变表达，须有事件依据，不能无故换声。人物声音按已确认身份、关系、目标和当前处境组织：区别体现在关注什么、回避什么、怎样理解问题及应对冲突，也可体现语域与表达偏好。同一人物面对亲人、陌生人、上级及不同情绪时可以改变表达，变化须符合关系与处境；不固定分配永远短句、永远反问等模板。对白先服务当前交流意图，允许省略、打断、转移话题、答非所问和沉默，读者须能理解必要意图与行动；保留自然长短句、停顿、语气词和正常标点，不以词频、句长或简短应答单独判AI痕迹。叙述遵守已选视角与文风，对白贴合人物，区分人物不得牺牲清晰或强塞口头禅、方言和身份刻板标签。人物年龄、性别等结构化事实只接受该人物明确字段或明确标注，不从他人称谓、代词、年龄段或关系叙述猜填精确值；未知保留未知。资料缺失与正文缺陷分别记录：声音资料为空本身不证明正文同质；有正文证据仍可审查实际对白，无法确认说话人或依据时标为未评估。补充声音设定仅从已确认人物资料形成待审核候选，缺乏依据留空，不从旧资料恢复作者清空的特征。质检人物声音同质须给出具体人物、不同人物的两段连续逐字对白和语义解释，说明表达或应对方式为何不符合当前人物与场景，核对有意呼应、关系变化和情绪影响；单次句式相似不单独构成缺陷。修复须保留人物意图、说话人、知情边界、关系状态、必要因果和行动结果，不引入新人物、事件或设定；不得为区别而改写其他人物。规则适用于所有题材，验证覆盖不同身份、关系、情绪和交流场景，不将某本小说的人名、情节或台词写成执行规则。";
export const CONTINUITY_SCOPE_POLICY = '按全书故事章号确定跨章核对范围：第1章没有前章时，continuity返回not_applicable并明确不存在前章，不因缺少不存在的前章标unknown。首章已有背景与本章内部人物所知、状态、因果仍按实际正文及确认资料核对，不借跨章不适用豁免事实检查。第2章及后续章必须核对紧邻前章；未提供完整来源时标unknown，不能因来源遗漏或新一卷内部排序重新从零开始而报不适用。';
export const SOURCE_QUALITY_POLICY = '生成与验收按六项源头核对共用当前已确认资料：promise核对标题/主线/阶段与终局承诺及已兑现、部分兑现、未兑现，章纲计划不等于正文结果；未来目标、结局结果与计划中的方法不自动证明器件性质、身体约束、证据能力或权限；必要能力须由独立已确认机制支撑，不能引用待证计划自身当能力来源。结局要求人物交出或使用材料不等于他已经取得材料，取得路径与交付结果分别核对，不能把目标改写为人物已拥有的事实；章纲修订改变行动、结果或必要条件时，核对同一章的叙述内容、内嵌行动、结构化场景、人物前后状态与相邻章及人物、地点、组织、伏笔中的执行描述依赖；保留核心结局不等于旧方法与新方法可以同时作为当前执行计划。重复保存的同义承诺必须同步，不能只修其中一份。候选未整体通过前不提升为已确认事实。' + CONTINUITY_SCOPE_POLICY + 'continuity逐条对照本章回忆与已确认前章原文，不能用一条正确的记忆代替全章核对；核对行动前所知、载具/地点/物件及交割、资金入口/变化/出口，同一对象与口径才能结算，销售额不当净收入、不重复扣本金或继承未知精确值；agency核对行动主体、决定权限及必要配合，对手宣称不能自动成为有效决定，主体在时段内具有许可不等于对象持续处于某物理状态，也不将该许可自动扩展给其他主体；未见某类记录不能证明不存在其他记录、路径或正常权限；账号或终端的定向推送限制接收与登录访问，不限制旁人正常观看同一屏幕。已经显示的信息，正常截图、拍摄、复制与转发会保留当时内容；静态副本不会继续刷新倒计时。若要让旁人同屏看不见、截图丢失某行或转发后改变像素，必须有已确认的特殊技术或能力依据，不由定向推送自动推出。机制断言位于字数理由、亮点或情绪说明时仍按实际声称核对，不以字段用途免检，不用篇幅标准证明路径或能力。来源边界按每个风险声称逐项建立固定编号；同一章的一条正确描述不能覆盖其它字段中的互斥描述，修订后的原风险位置仍须复核。关键行动到结果逐项建固定引用编号并核对必要条件，一条正常的权限或进入动作不能替代其它排他性推断、约束对手或处置结果的证明；仅对影响理解与结果的必要条件举证，普通动作不增加手续。每次改变载体核对接收权限、复制内容与动态刷新三种不同效果，不为保留悬念追加未授权效果；professional核对法律/医疗/金融等关键结果的证据来源、适用前提、执行主体和实际生效状态，提出申请不等于已批准、材料需验证不等于无用，不凭缺少见证者或私下交付一票否决，不编造程序；progression核对选择引起局面改变、对手反应、筹码/关系变化和阶段回报，灾难数量、收集资料或反复跑手续不自动算推进，补齐职业手续或回顾损失不能冒充新的筹码、关系或选择后果，不按固定字数塞反转；voice核对人物随目标、交流对象、关系与压力变化的表达，固定短句、固定动作和重复口头禅不能代替人物风格。只核对影响本阶段行动理解与已声称结果的必要条件，日常直接因果不补手续，不为填六项而解释谜底或无关细节。认定缺口或冲突须引用当前正文与相应来源，并说明实际影响；正文错误、来源冲突与未知信息分开，源冲突不得靠局部正文补丁二选一。有证据的关键缺口保持原质量门，缺证据或审查缺项标未完成，综合高分不能覆盖；点击、完整阅读、传播、代入逐项记录本阶段supported/weak/unknown及原文机制，不据评分宣称实测商业成功。已有确认资料变动后按依赖重新装配和复检，不自动改写已确认小说；验证覆盖不同题材和反例，不将某篇事实、术语或情节设为通用禁令。' + '日常物件按已说明的普通用途使用，不要求世界观逐件另授用途；取得、交付与使用条件应核对当前计划中已有的角色行动与资源。未执行计划可补充既有人物的普通行动来完成合理取得，不能写成既往已发生事实。普通用途与额外性质分开：可操作不自动证明额外权限、排他效果或限制他人行动；不靠新增器件性质圆回。当前计划只能举证行动前提与资源来源，不能以其结果断言自证世界能力；原文断言未改但真实必要条件已改时仍走完整复检，不因字面未变一律否决，也不因改了其它词就宣称原缺口解决。关键结果专项必须引用具体行动或独立必要条件的实际原文；成立结论缺少该引文或只引用待证结果时，视为审查未完成，不把结果字段或其重复句当机制证据。普通直接因果可引用对应行动，不要求新增手续。';
export const CHARACTER_VOICE_COMPARISON_ISSUE_TYPES = ['same_voice_characters'] as const;

export const IDEA_CARD_GENERATION_CONCURRENCY = 2;

/** Naming constraint on fictional story content, not on routing/platform metadata. */
export const FICTION_NAMING_POLICY = {
  prohibitedNames: ['豆包', 'ChatGPT', 'DeepSeek', '文心一言', '通义千问', '腾讯元宝', 'Kimi', '美团', '饿了么', '微信', '抖音'],
  narrativeFields: ['title', 'alternateTitles', 'workingTitle', 'storyCore', 'protagonistSituation', 'openingEvent', 'activeChoice', 'escalation', 'reversalEffect', 'payoff', 'irreplaceableCarrier', 'secondOrderConsequence', 'readerQuestion', 'differentiation', 'hook', 'description', 'setting', 'protagonist', 'characters', 'coreConflict', 'conflict', 'uniquePoint', 'uniqueSelling', 'mainReversal', 'ending', 'noveltyProof', 'scopeBreakdown'],
} as const;

export const CROSS_STAGE_REVIEW_POLICY = '先区分已发生事实、已授权世界机制、作者显式锁定的硬性方法与尚未发生的解决计划。ending、endingDirection、人物arc等字段中的未来方法没有单独锁定且缺少必要能力依据时，不是必须还原的世界规则或已发生事实；可在未执行计划中选择有现有权限与条件的等效路径，保留已确认角色、关键事件、各阶段承诺的成果、结局结果与代价。已确认scopeBreakdown的outcome须逐项核对候选的实际行动与结果；合法等效手段不能把确定成果降成嫌疑、申请或希望，条件不足须修订上游取得路径，不能删除兑现或仅列为建议，不赋予新能力，不改已发生事实。原方法确有缺口仍记录并修订，不以原方案文本自证能力；合法替代方法与原意图不同本身不构成事实互斥，但所有当前执行描述与依赖必须同步，未同步仍阻断。跨模块审查只将已确认事实互斥、下层改变上层规则、改写主线或结局的无关剧情列为阻断。contradictions必须说明互斥来源、字段、原文和因果影响；unrelatedInventions必须指出新增事实的来源字段与原文、违反的已确认边界及主线影响。基准没有逐项列出某个背景细节，不等于该细节违背基准；截断显示不等于完整资料缺失。重复建模、别名、未被当前章纲使用但不改变故事的背景地点或资料冗余放warnings，不强制每个地图点都成为独立场景。新增动机或推定真相若改变已确认人物选择、因果或揭示安排仍阻断，不得借warnings放行。consistent当且仅当两个阻断数组均为空、固定阶段兑现清单也全部保留时为true；结论与数组互斥是评审协议错误，先纠正评审，不据此修订Canon。世界观只作为冻结参照，不得通过删除世界观条目来消除整理建议。';

export const STORY_ENTITY_MODELING_POLICY = '只按既定事件链实际需要建模，不设地点或组织数量配额。factions/organizations只收录真实的集体、机构或有组织关系的势力；当户、旧事相关人等单个人物身份只放characters，不把个人复制成独立组织。没有独立势力时factions返回空数组；locations只列故事已确认或既定事件必需的地点，不为满足数量补充背景点。已冻结的地点清单仍原名继承，整理建议不能改写世界观。';

export const TEMPORAL_FACT_CONTINUITY_POLICY = "整章时间审查按有界编号批次返回检查行，保留全章正文与全局时钟目录，跨批可引用但不得重编号；后续批次须接收前批读数身份绑定，同一对象复用timerId原值，不凭名称相似强制合并；一次协议纠错也须保留并提供其它行身份。明确ge或le单侧经过约束可核对兼容性，不能仅因另一侧未知宣称完全无法核算；合并后一次核对全量覆盖、身份和算术，任一批缺失或失败不得放行。局部修订复检故障须记录为审查未完成，不能沿用已修正的旧正文缺陷作为最终失败原因。时长跨日只沿正文绑定起止事件及明确日期计算：今天、明天、后天、昨天等相对日期由程序定位，明确次日同一钟点不能算为零分钟；未知日期不猜造跨日。修订精确时刻为自然概述时，仍须保留原文已确认的上午下午、日期和事件时段，不得改成新的清早或夜晚；这些自然时段也须纳入时间语义复检。原文明确经过秒数或分钟也可作为同一事件的时间约束，用elapsedDurationRef/elapsedQuantityIndex绑定服务端目录数量，不编造钟表端点；宽泛估计保留未知。生成含连续倒计时与钟点的场景前先沿已确认起点组织同一时间基准；每次读数随实际经过推进，不为加强紧迫感临时编造互斥的钟点或读数。钟表使用原文独立编号绑定，避免同段多个钟点选错下标；未明示时段的12小时口语钟点保留候选，按已确认同日先后检查可兼容区间，不擅自指定上午或下午。HH:MM:SS先作为独立数字读数核对事件身份，不能当钟表；同一计时器后续读数须绑定前次读数及钟表起止或上下界，由程序复算读数差，不逐点supported冒充连续性验证。没有边界保持未知，不编造暂停、重置、变速或跨日；时间专项按登记的提示投影只消费时间、事实来源及协议修复规则，整章完整质量门仍在独立整章审查执行；不让标题、人物声音、平台评分等无关任务混入时钟核对。时间协议按本次目录生成完整必填骨架，一次纠错只替换未验证或遗漏条目并保留已验证结论。后续倒计时仍未知不能算全量时间验收通过，只在既定一次边界复核内检查已提供的回溯钟点和先后约束，仍未验证时保持未评估并保留正文，不以未知当无缺陷；分钟钟表保留秒级分辨率余量。时间跨度须沿同一对象核对起点、终点、已知经过时长与原文依据：返岗、入职、返乡、获得物品等起点不能晚于声称已持续的活动或持有期限。区分档案记录的年代、他人积累的历史与人物本人参加/持有的时长，不能相互替代。章节状态必须由本章实际事件或已确认前章接力支持，不能把后章动作提前记为本章已完成。当前时点只按原文明示的日期、相对间隔和状态变化推进，不按章节数猜经过几年；未知时长保留未知，不为增强分量编造精确年数，也不凭空补时间跳跃。章节引用以服务端chapterNumber为准；引文存在于其他章节不代表声明的位置正确，错章引用须重审评审结果，不能据此修复小说。时长数值与明确时钟的数值类型从原文程序提取，不能把精确值重新解释为上界；审查确认同一事件起止点及叙述时刻后引用目录，由程序复算约束是否满足。未确认的边界不补数，跨日不擅自环绕；算术或覆盖合同错误允许一次专项纠错，仍未验证即未完成。章节验收时间分支只消费已验证的temporalAudit；普通章节审查保留前文接力、非数值事件先后、世界规则、一般事实与语言验收；时钟算术的事件身份核对独立执行并引用当前目录，不另维护自由文本时间判定，以免正确计算又被另一份错误结论覆盖。时间冲突证据使用服务端目录编号回填，禁止模型转录或拼接引文。时间审查须逐项覆盖服务端时间原文目录，分别说明对象、起止点、精确/近似/上下界、可计算结果及未知边界，不把所有时间判断折叠进总体通过。没有“大约”“多”等近似依据的精确时长，不得仅以口语或粗略为由豁免可证实错误；角色故意说错或误判须有正文依据。起止钟点写为几点多或出头时仍有可核对区间，不能仅因缺精确分钟把同一已确认事件声明为完全无边界；用目录minuteBounds保留保守区间，普通历时与倒计时共用区间计算。三四秒、五六分钟等相邻中文数字的口语数量保留范围，不拼接成34秒或56分钟；明确三十四秒和阿拉伯数字34秒仍按精确数量核对，不将口语化要求当作算术豁免。区间有交集不强报矛盾，全部区间均不兼容时仍阻断；事件身份未确认不得凭邻近强行绑定。宽泛时段词与精确时钟不自动互斥，地点季节等依据不足时不编造固定分界；专项时钟核对已接管后，不仅凭措辞建议中的“时间不一致”再创建第二个算术阻断。涉及时长矛盾时列明两处连续原文、起点与终点及可支持的算式或上下界。先区分精确值、近似值、上界、下界和日期区间：不到/不超过是上界，至少/已经超过是下界，不能当精确值比较。两个区间有交集或更紧区间包含于原约束时，不因数字不同判事实互斥；实际时长满足原上界时，不能把更紧且真实的上界判为改坏合同。核对同一事件、同一起止点与叙述时刻，入库到操作的间隔不等于到章末的全部间隔；必要起止点未知时保持未确认。跨日相对日期与小时倒计时可能兼容，须先按当前时点换算，不能只因“明天”和“几小时后”词面不同判冲突。合同明确要求呈现倒计时而正文只给宽泛日期时，可以报必要事件或压力条件未充分呈现，但不能虚构互斥时点。修复只纠正已证实错误，不为数值统一改写仍成立的上下界；仅凭“后来”“月底”等不能推定绝对年份。有证据的矛盾在生成接力和最终保存前使用同一判据；最终才发现的候选矛盾须先收集各批次证据再进行一轮有界局部修复，不继承已判冲突批次的状态更新，并从首批重新核对全部候选及累计台账，未复验通过不得保存。";

export const PLATFORM_MEASUREMENT_REVIEW_POLICY = '对白比例、字数、段长等数值及区间由同源测量器提供，不得估算或与其他文本版本的测量混用；没有测量结果不得虚构比例。数值问题必须引用本次对应测量行的value、target和status，仍保留真实平台偏差；对白口吻与功能、人物声音和节奏另按实际正文语义判断。openingHook、endingHook等词面检测只用于定位风险，未命中不等于缺少钩子；语义复核有有效异常、冲突或继续阅读理由时，记录原文与机制，不因检测status为bad/warn重复阻断，也不改写检测值。经验区间偏差须结合场景职责与实际阅读影响判断，不能强塞无关对白凑比例。';

export const OUTLINE_STATE_ACCUMULATION_POLICY = '累计状态必须从第一次实际触发开始逐项结算，不能因代价后来才揭示而漏记早先事件。明确触发单位（每次动作、每场或每个对象）、事件次数、单次变化、入口状态与出口状态，按同一规则核对全部前章；章节数、比赛场数不等于动作次数。重复触发的效果与代价在每次都生效，除非上层明确授权例外；规划阶段须安排首次触发及其后果，不能把首次代价留到下一章重新起算。数量不明确时保留未知或有证据的下界，不得猜出精确总数；列举部分事件不能冒充累计总量。原始资料优先于台账摘要，更新摘要不得覆盖历史事件；核查当前全部字段和前章原文，不能只因更新已有factId就认定事实保持。' + '物件、原件、副本、记录内容与人物知晓是不同对象和状态；结合上下文区分掌握信息与实际持有载体，不以手里有线索等口语表述证明占有实物，不以称呼相似认定同一对象互斥，也不臆造复制、交付来解冲突。真正同一实体或版本的明确排他状态仍须核对发生时刻与两处实际证据后阻断。';
/** 独立提示词的兼容组合；自动注入分别由CTX-005、CTX-008承载。 */
export const OUTLINE_STATE_CONTINUITY_POLICY = OUTLINE_STATE_ACCUMULATION_POLICY + TEMPORAL_FACT_CONTINUITY_POLICY;

export const WORLD_SOURCE_COMPLETENESS_POLICY = '世界观只补全支撑既定事件的必要信息。未确认且非必要的历史届数、起始年月、组织沿革、资源总量等不为填满字段编造精确值，可保留未知、空字符串或空数组；必须存在的核心规则、故事前提和事件地点仍完整。允许补充必要细节不等于允许新增会改变因果、能力、代价或结局的规则。';

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
    summary: '每项需求调整与问题修复都须举一反三：追溯规则与数据源头，排查同一机制的相关场景、模块和输入类型，不能只修当前小说或当前报错入口。规则声明依赖；上游变更必须重新验证所有下游 Prompt、Gate、Repair、Save、UI 与测试。',
    details: ['先明确需求适用范围和失败证据，检查生成、上下文装配、审查、修复、保存及展示的同类路径，按受影响消费者记录已检查、已修复、未验证或不适用及原因；用不同题材、身份、关系或输入形态的代表性案例和反例验证可复用机制。修复共用规则或实现，消除重复、冲突定义并保持质量门；不把单篇人名、剧情、台词或一次失败的特例写成普遍规则，不将限定需求强推全部作品，不据举一反三擅改已确认故事或无关功能。连续局部修复仍失败时按 RPR-005 回查上游，验证未完成不得声称全链路有效。'],
    testRefs: ['server/src/modules/module-standards/module-standards.service.spec.ts'],
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
    details: [WORLD_SOURCE_COMPLETENESS_POLICY],
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
    scenarios: ['idea_generate', 'outline', 'writing', 'review'], consumers: ['prompt', 'semantic_gate', 'repair', 'test'], dependencies: ['ARCH-002', 'AUTH-004', 'CTX-005', 'QLT-003'],
    summary: '章节规划、故事卡、边界审查和修复共用 CR-1～CR-7 授权判据与QLT-003必要因果判据；规则触发、能力范围、跨章边界、动机/程序与长期授权必须有上层逐字证据。必要结果缺口须引用实际行动与结果，判据之外的疑虑不得升级为冲突。',
    details: [
      '框架规划各入口的生成与审查必须共用同一份已确认来源快照；世界来源同时包含规则、约束、社会规则与规则系统，不能按少数字段投影丢掉边界。故事目标或结局方向不自动赋予实现手段的权限、物理效果和成立条件，不能只在审查时追加世界、角色、伏笔与必要条件。前序章节职责、进入条件、累计时间与出口状态须传递到后续展开；无法解析的上游结构不得当作完成继续下游。',
      '本次已通过的前序职责与卷纲须作为chapter_plan来源同时传入评审和引文校验，未保存的规划不等于缺少依据；不能让评审读到前序输出、校验却只查旧数据库章纲。',
      '框架展开正文前，有双边原文证据的必要因果条件缺口必须解决，不能因评审给低或中严重度而随总分放行；保留原评分与严重度，按框架未对齐停止下游。普通自主动作不追加无来源程序，可共享信息不自行判为独占物件，时间区间相交不自行判事件先后互斥。',
      '高潮、爆发与解决场景须使用QLT-003同源的行动—条件—结果账目核对，覆盖实际章号并检查对手正常反应；结果断言不能自证成立条件，不能临时改变普通物件性质或让对手失去已有行动能力。真实缺口返回上游规划，不进入正文局部修补循环。',
      '职责规划的规则授权与条件有效性须在卷纲、细纲展开前逐章举证审查，不能只返回通过标记；世界允许某机制不能代替当前规划中的实际取得动作，已取消或过期条件必须有取得路径与生效依据，不能只重复资源名称。确有源证据时仅作一次职责修订并复审，不改冻结世界与故事结局；未通过不得转到下游反复补局部内容。',
      '上层规则中的 AND 条件、枚举项和精确人数/数量/证据组合/时点必须无损继承；条件未满足时只能写尚未生效的行动，不得提前兑现效果。',
      '故事卡结局必须是明确的冲突解决、人物选择与代价，场景结果必须是具体状态变化；不得把剧情概要冒充结局，也不得用“完成阶段并进入下一阶段”占位。已确认题材缺少这些字段时进入现有受来源约束的规划与审核，不能按字段非空宣称完整。',
      '审查只能按 CR 判据与已确认世界规则/执行标准判定；给不出被违反规则的逐字证据不得写成 blocking 冲突。',
      '修复只替换被证据证明违规的机制，保留未被指出的问题章、人物、真相、核心反转和结局；不得以同义改写保留原违规机制。',
    ],
    clauses: [
      { id: 'CR-1', label: '能力授权边界', text: '每个异常/超自然效果必须能在已确认世界规则中找到对主体、对象、载体与动作范围的逐字授权；未授权即禁止。规则若只作用于感知、记忆或身份痕迹，不得扩写为改写现实设备、记录、档案、监控或物证；显示既存的旧记录可以。一个异常效果只允许执行规则明确赋予的最小动作，不得自行增加规则未授予的能力。' },
      { id: 'CR-2', label: '触发条件与时点', text: OUTLINE_STATE_CONTINUITY_POLICY + '规则规定的前置动作、次数、人数、数量、证据组合、代价和时点必须在该章真实成立；A+B+C、两名/三份/第N次等不可被缩写或模糊，不得把未明写当作已满足，条件未满足不得出现效果，信息不得早于其在故事时间线上发生之前被知晓。' },
      { id: 'CR-3', label: '跨章边界', text: '同一推进任务不得由两章重复承担；后续章计划完成的揭示、反转或回收不得提前兑现；每章只承担一个不可替代的推进任务。' },
      { id: 'CR-4', label: '设定驱动重复豁免', text: '若已确认故事闭环或世界规则规定某机制反复发生，该重复本身不是冲突；只有重复没有带来新的推进、代价、信息或状态变化时才构成问题。' },
      { id: 'CR-5', label: '动机、立场与泄密', text: '人物改变立场、交出关键材料或对手泄密，必须有当前章或前文可见触发与既有动机；不得靠普通试探、巧合或凭空告知直接获得秘密。' },
      { id: 'CR-6', label: '证据、程序与权利生效', text: '涉及法律、行政、所有权、继承、档案校验或系统权限移交的效果，必须写明来源、生效条件、人数/数量、证据组合和时点；上层明确的程序要件不得在故事卡、章纲或正文压缩时省略，身份关系材料本身不能自动等同已生效权利。' },
      { id: 'CR-7', label: '遗留授权与长期机制', text: '既有授权、记录或自动响应必须说明发生时点、持续机制，以及本章为何在此刻生效。' },
    ],
    contracts: {
      scopeDiscipline: '授权与章节边界按CR-1～CR-7及已确认世界规则判定，必要行动结果按QLT-003同源因果账目判定；不能因已取得进入权限就默认出口结果成立。一般常识风险、题材偏好或其它作品类比不能替代当前行动、结果及必要条件的逐字证据，不据未举证疑虑阻断。',
      repairBoundary: '每章只承担独有推进任务；后续章反转不得提前；规则必须满足明确触发条件；设定规定反复发生的机制保留其重复性，只修推进、代价或信息增量；物品、份数、人员与信息来源保持可追溯。替代机制须逐项核对执行者、对象、权限范围和结果时点，不得把既有权限换对象后扩张，也不得把修复候选中的新声明写成已确认世界规则。无法由原执行者成立的结果，优先由已有对应权限且实际到场的主体完成，允许调整本章行动次序和结果时点；保留故事目标，不强保错误的执行者或先后关系。若原中间结果本身不成立，应删除该中间结果及后续对它的依赖，用已有能力可直接完成的行动通向最终目标；不得为保留原手段增加新的器件性质、权限或万能效果。普通保护、撤离、隔离和求助不自动等于对手被控制；在有权主体实际介入之前，只安排已有能力足以完成的保护或阻隔行动，不先宣称后续控制已成立。ruleEvidence只引用已提供的判据或来源，不拼造授权原文，不为证明机制增加正文解释段。',
      losslessInheritance: '所有会改变规则是否生效的 AND 条件、枚举项、人数/数量、证据组合、时点与必要动作必须无损下传；部分条件满足只能写申请、调查、补证、等待等未生效动作。',
    },
    evidencePolicy: 'blocking 必须引用原文可定位证据与被违反的 CR 条款/已确认规则；规则文本不存在或条件尚未满足时不得靠“感觉不合理”重写。',
    implementationRefs: ['server/shared/src/chapter-responsibility-review.ts', 'server/shared/src/index.ts', 'server/src/chain/chain.controller.ts'],
    directives: { generation: '保留上层规则触发条件与授权边界；本章只完成 ChapterPlan 的独有推进任务。', review: '授权边界按CR-1～CR-7，必要行动结果按QLT-003；逐字举证，判据之外不得自创冲突。', repair: '只修经证据确认的违规机制，保留其它故事事实与章节分工。' },
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
    details: ['写作上下文的项目卡只消费创作配置与已确认故事依据。题材发现的历史审计记录保留在诊断资料，不经planning整包注入正文；同一项目卡中的创作宪法只保留一个权威投影，不因清理提示而删除数据库记录、作者配置或故事事实。'],
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
    scenarios: ALL_SCENES, consumers: ['prompt', 'deterministic_gate', 'semantic_gate', 'repair', 'persistence', 'test'], dependencies: ['AUTH-002', 'CTX-004'],
    summary: '时间、数量、次数、倒计时、年龄、库存、位置、物品状态等只有在确认是同一结构化事实且可安全计算时才能确定性阻断；自由文本猜测同一事实只能升级语义审查。',
    evidencePolicy: '确定性检查必须拿到稳定 identity、事实种类、数值/单位、来源与关系；仅靠题材关键词、单一正则或“全篇只有一个数字”不足以证明同一事实。',
    details: [OUTLINE_STATE_ACCUMULATION_POLICY, '完整候选按实际将保存的字段核查，通过前不得写入章节框架；审查纠错只改审查输出，不得修改输入事实。'],
    implementationRefs: ['server/src/chain/outline-fact-ledger.ts', 'server/src/chain/chain.controller.ts', 'server/src/chain/source-fact-consistency.ts', 'server/src/chain/source-countdown-consistency.ts'],
    testRefs: ['server/src/chain/outline-fact-ledger.spec.ts', 'server/src/chain/chain.controller.fact-ledger.spec.ts'],
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
    scenarios: ALL_SCENES, consumers: ['prompt', 'deterministic_gate', 'semantic_gate', 'persistence'], dependencies: ['CTX-005'],
    summary: '时间、因果、位置和可计数状态按事件前提→结果演进；倒计时、年龄、名单/资源数量等同一事实保持单一当前值与变化证据。',
    details: [TEMPORAL_FACT_CONTINUITY_POLICY, '章纲涉及可定位精确期限或读数的倒计时时，首稿前建立引用当前章纲期限与关键事件的候选时间计划，程序从累计经过秒数计算剩余读数。未知间隔的候选安排不得覆盖已确认时钟和先后事实；计划不写入Canon，生成、扩写与复检同源消费，不要求正文展示算式或逐句计时。计划无来源、初值不符、倒退或越过期限时停止生成；精确读数须消费计划节点和正文实际经过；未计划的细碎显示用自然概述，不随机编造秒数。计划不强制正文逐点显示；计划读数仍须正文独立钟点、经过时长或有效上下界支持，不能用两次剩余读数相减证明实际经过。无自然边界的节点保留时限压力并用自然概述，不为数字堆解释或补报时。回溯送达钟点不能偷换为首次显示触发点。时间评审顶层evaluated与逐行supported/conflict/unknown分开，纠正行格式时保留已成立的首次baseline角色，不因缺更早读数将基准改成未知；后续读数不得重置基准绕过核算。经过间隔未知但已确认同一计时器前后观察时，仍绑定较早读数核对递减方向；不得以边界未知隐藏反向增加，回溯截图或身份未确认不得猜测绑定。相邻段落中连续场景的钟表可作为定位候选，须确认身份和先后后绑定；不要求同句，不把定位候选自动当通过证据。邻接读数缺钟点可回查更早有边界的同一计时器读数，并使用真实上下界，不为作者未写的重置或跨日假设阻断明确同日场景。扩写前先核对首稿对候选计划的实际消费；计划内后续精确读数也须核对正文独立依据，不能只扫描计划外读数；匹配计划数字不授予真实经过已验证。程序定位计划外精确读数仅作风险提示，语义核对须区分当前倒计时、普通钟表、回溯记录和其它已确认计时器。有独立边界的读数保留，无依据的新增细碎显示自然概述；不得补造耗时或堆算式解释。该准备最多一次，不证明质量通过；保持非时间事实与既定收尾，失败保留真实原稿并按时间准备阶段记录，不能误报字数失败。最终仍须完整正文时间复检。仅泛提计时或近似时段而无可计算基线时，不强制创建精确计划，仍交原有时间语义验收；精确基线必须直接对应当前计时对象与本章起点，不能借用其它记录窗口的数字，也不能把故事最初总期限重置为本章剩余值；提示示例不固定为24小时。本章没有精确计时基线时，生成与扩写沿用已确认的近似剩余状态，不主动编造秒级读数或为它补报时；保持同一计时对象的递减、章节时间推进和既定终态，最终语义验收不省略。失败草稿与计划按正文及章纲哈希绑定，安全重试恢复同一份候选计划，资料变化或来源失配不猜造恢复。'],
    implementationRefs: ['server/src/chain/source-fact-consistency.ts', 'server/src/chain/chapter-time-plan.ts', 'server/src/chain/chain.controller.ts'],
    testRefs: ['server/src/chain/chapter-time-plan.spec.ts', 'server/src/chain/temporal-review-coverage.spec.ts'],
  }),

  rule({
    id: 'GEN-001', name: '六个必填执行维度', category: 'generation', level: 'P1', status: 'active', blocking: true,
    scenarios: ALL_SCENES, consumers: ['prompt', 'deterministic_gate', 'persistence'], dependencies: ['AUTH-001'],
    summary: '创作执行维度固定为：平台 / 分类 / 基调 / 文风 / 流派 / 视角。创建项目及后续生成必须六维完整，任一必填维度缺失即“标准未执行”，必须阻断；不得用隐藏默认值、平台推荐或模型猜测补齐。灵感发现是确认前的候选探索：平台必须由用户选择；未预选分类可为每个题材分别从该平台与篇幅的分类事实源选取，其余未预选维度可从本次提供的创作字典与已核验投稿候选中显式组合，不属于创建阶段缺失，不因此拒绝题材预选。完整故事卡必须展示最终六维供用户确认；用户已选维度必须原样继承，确认后创建和后续生成不得重新自动组合。候选事实源缺失或最终卡维度不完整仍阻断，禁止编造。',
    implementationRefs: ['server/src/chain/cross-stage-review.ts', 'server/shared/src/execution-standard-dimensions.ts', 'server/src/modules/project/creative-constitution.ts', 'server/src/chain/chain.controller.ts', 'desktop/src/renderer/pages/DiscoveryWizardPage.tsx'],
  }),
  rule({
    id: 'GEN-002', name: '灵感继承', category: 'generation', level: 'P0', status: 'active', blocking: true,
    scenarios: ['idea_generate', 'world_building', 'character_design', 'outline', 'writing', 'review'], consumers: ['prompt', 'persistence', 'semantic_gate'], dependencies: ['AUTH-001'],
    summary: '灵感卡确认后，创建项目必须继承最终平台、分类、基调、文风、流派、作品/情节标签、POV、核心钩子与故事事实。题材池、淘汰候选、筛选理由仅用于诊断，不得注入确认题材的后续生成/评审上下文。单卡失败不能清空其它已通过卡；不足明确显示缺额，不用弱题材补数。 整批完成条件由 WF-005 唯一定义；合格项必须保留，不足不得伪装完成。HTTP 适配层不得另启换题补生。未预选分类且平台有多个可用分类时，整批题材须跨分类探索，不得先随机固定一个分类再生成全部卡；每个入选题材锁定并继承自己的分类。用户已选分类时保持该分类。实质差异仍须体现在人物欲望、关系、冲突机制、选择后果与兑现路径，不能只换分类标签、职业或道具。',
    details: [IDEA_PRESELECTION_REVIEW_POLICY],
    implementationRefs: ['server/src/chain/idea-discovery-contract.ts', 'server/src/chain/premise-selection-review.ts', 'server/src/chain/chain.controller.ts'],
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
    scenarios: ['outline', 'review', 'summary', 'state_extraction'], consumers: ['prompt', 'deterministic_gate', 'test'], dependencies: ['GEN-003'],
    summary: '评审、审计、摘要、状态提取属于结构化结论，不是小说正文；只按各自字段/证据合同验收，不能套正文篇幅、段落、对话比例或正文精修规则。被评审的正文仍须通过完整质量 Gate。',
    details: ['详细章纲核心事件链不设机械字数上下限；结构层校验非空事件链、场景地点/目标/阻碍/结果、人物行动/结果、正文目标字数及章节边界，完整性继续由 ChapterPlan 和事实/语义审查验收。'],
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/chain/chapter-detail-contract.ts', 'server/src/chain/hardline-scanner.ts'],
    testRefs: ['server/src/chain/chapter-detail-contract.spec.ts', 'server/src/chain/chain.controller.helpers.spec.ts'],
  }),
  rule({
    id: 'GEN-006', name: '角色动机、声音与知识边界', category: 'generation', level: 'P2', status: 'active', blocking: false,
    scenarios: ['character_design', 'outline', 'writing', 'review', 'polish'], consumers: ['prompt', 'semantic_gate', 'repair', 'test'], dependencies: ['AUTH-002', 'CTX-003'],
    summary: '每个参与情节的角色应有符合戏份的行动目标、可追溯动机、专属行事风格与对话风格；角色只能使用已见证、被告知或合理推断的事实，关系与成长变化须由事件和选择推动。不得把所有题材强制写成同一种悲惨、热血或牺牲情绪模板。人物声音以已确认身份、语域、表达偏好和冲突反应区分，不强制添加口头禅、方言或刻板标签；正常简短应答不单独构成声音同质。角色卡、正文生成和质检读取同一当前档案，显式清空的特征不得从旧资料恢复。',
    details: [CHARACTER_VOICE_POLICY],
    directives: { generation: '按当前人物身份、目标、关系和处境执行每个出场角色的风格，角色设计将表达偏好、不同对象态度及压力反应落入当前档案；正文用真实交流与选择体现，不能为标明风格反复贴标签或解释性格。', review: '依据当前人物档案与本次实际言行核对风格是否贴合角色及关系变化；区分资料不足、合理表达变化和有证据的声音同质，不以标签缺失或正常短答判错。', repair: '根据具体人物与当前交流意图调整已验证问题处的表达；保留意图、说话人、知情边界、关系状态、必要因果和行动结果，不引入新剧情或角色设定。资料不足时不编造口头禅或固定句式。' },
    evidencePolicy: 'same_voice_characters 的 evidence 与 shownEvidence 分别引用不同人物的连续逐字对白；basisReason 说明具体人物、表达或应对方式、场景依据及为何不是有意呼应。证据不足保留未评估，不单凭资料缺失判正文缺陷。',
    testRefs: ['server/src/modules/writing-quality/character-voice-policy.spec.ts'],
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/modules/character'],
  }),
  rule({
    id: 'GEN-007', name: '正文篇幅与场景扩写边界', category: 'generation', level: 'P1', status: 'active', blocking: true,
    scenarios: ['writing', 'polish', 'review'], consumers: ['prompt', 'deterministic_gate', 'repair'], dependencies: ['GEN-004', 'PLAT-002'],
    summary: '正文按每次调用的真实 ChapterPlan 目标和验收区间收敛。篇幅不足只允许在既定场景内补足行动、阻碍、选择与结果；不得抬高目标、写后章、重复解释或在已经完成收尾后新增事件。篇幅上限也不得通过截掉收尾或必需事件达成。',
    details: [
      '扩写按插入点原稿前后状态生成，不提前完成后邻事件或重演前邻已完成动作。连续动作已有明确前后约束时，不得凭空假设未写的折返、重来或回溯来否认顺序冲突；修复接口的JSON示例必须包含状态关系与成立条件，避免已要求的证明字段在模板中遗漏。动作重演类冲突须有完成证据、原动作阶段和新增动作阶段；同一路程延续、方向确认、正常回顾与重复表达不能偷换为已完成动作再次执行。状态改变本身不是矛盾；起步后再等灯刹停、拿起后放下、打开后关闭通常是正常先后推进，不要求为自然可理解的过渡补解释。状态冲突须证明同一时间不可并存，或已确认条件使前后转换不可能，不能只列两种不同状态；真正的仍然未变声明、不可逆事实与时间地点约束仍保留核对。引文存在不等于冲突成立；扩写与完整章节评审共用完整JSON解析，修复语法后仍须完整结构与全部证据验收，不能提取内部片段；不可解析报告至多一次同输入协议纠错，仍无效停止；supported、conflict和unknown均须校验新增与邻近原文，单纯引文失配纳入同一次合同纠错，按点名插入项的来源段落编号提取实际原文，保留原状态和理由，不重判合法其它行；缺证据只纠正点名审查一次，不改正文，仍未验证则停止并保留来源。合法其它审查项、原稿和收尾不得改写，最终整章质量门保留。',
      '章内补写位置由程序从当前排版规整后的正文生成，模型仅选择 anchorId 并提供新增文本；编号绑定当前正文版本，旧编号、未知位置、段中引文及重复位置均拒绝。不得把模型猜测的段首当作合法位置。提示与执行同源声明1–12个补丁及位置不重复，集中补足既定场景，不逐段堆补丁。新增段落须承接插入点前后的行动状态、时间、位置及物件状态，不再次表演原文已经发生的动作，不重置场景；只能增加未呈现的有效阻碍、选择、互动与后果，不能把已有动作换词复述来凑篇幅。',
      '扩写审查与修订复检共用有界批量，每批最多4项；先由整批候选计算邻居再分批，不按分批重建正文。保持原编号，所有批次须完整验收并合并，漏项、重复、未知或任一批审查故障都不得授予通过，不因截断增加正文修订。扩写合并前逐个位置核对新增文本、相邻原文及整批合并后的候选邻居，不能只独立核对每个补丁而漏掉补丁之间的冲突。引用两侧连续证据，检验动作重复、状态倒退和无新增信息的复述；环境持续、再次感受、视角变化、准备后再完成和有新作用的回顾不能仅凭重复提及判错；完整且有逐字证据的冲突允许一次只替换相关新增段的局部修订，其它补丁及原稿保持不变，修订后整批重新核对。未知、漏项、引文失配不得触发正文修订；一次修订后仍未通过则保留来源稿，不继续积累补丁。该局部验收不替代完整章纲、时间及质量门。',
      '篇幅或插入合同拒绝须记录正文候选、项目、章节、失败原因与 body_length_contract 步骤；物理模型调用成功不能掩盖后续校验失败。保留原稿与收尾，不降低篇幅或质量门。',
    ],
    implementationRefs: ['server/src/chain/chapter-length-expansion.ts', 'server/src/chain/chain.controller.ts', 'server/src/modules/generation-metrics/generation-metrics.service.ts'],
    testRefs: ['server/src/chain/chapter-length-expansion.spec.ts', 'server/src/acceptance/quality-execution.acceptance.spec.ts'],
  }),

  rule({
    id: 'GEN-008', name: '故事命名与原创表达', category: 'generation', level: 'P1', status: 'active', blocking: true,
    scenarios: ['idea_generate', 'world', 'character', 'outline', ...WRITING_SCENES], consumers: ['prompt', 'deterministic_gate', 'repair', 'test'], dependencies: ['GEN-002'],
    summary: `故事标题、人物或宠物命名、概要、设定、结局与章节规划使用原创虚构名称，不借真实产品、品牌或知名作品/IP名称制造点击。当前明确禁止字样：${FICTION_NAMING_POLICY.prohibitedNames.join('、')}；即使用作宠物名也须改名。平台选择、模型路由、日志和来源引用属于业务元数据，不冒充故事内容。命名筛查不是法律侵权结论，也不保证仅换名称即可消除剧情抄袭风险。`,
    details: ['轻量已选胚子与完整卡均检查已知禁止命名。Gate点名后只允许同题材一次名称映射修复，在全部故事文本统一替换且复检；不改角色行为、身份、关系或剧情，不自动替换已确认小说。未知品牌/IP与剧情近似风险继续由语义审查核对。'],
    parameterRefs: ['server/shared/src/system-workflow-rules.registry.ts'],
    implementationRefs: ['server/shared/src/fiction-naming.ts', 'server/src/chain/idea-discovery-contract.ts', 'server/src/chain/chain.controller.ts'],
    testRefs: ['server/src/chain/fiction-naming.spec.ts'],
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
    scenarios: ['idea_generate', 'outline', ...WRITING_SCENES], consumers: ['prompt', 'semantic_gate', 'repair', 'test'], dependencies: ['QLT-002'],
    summary: '人物声音、推进有效性、场景节奏、空洞反思、关系变化、反转兑现、读者承诺等需要语义理解的问题交给完整语义 Gate。语义结论必须附正文证据；评审未完成不能视为通过。事件与因果完整不等于把动机、推断、伏笔与主题解释完：已经由行动、对话、物证呈现的信息不再由旁白复述，未到揭示时点的答案保留，允许读者自行连接线索。留白不得删掉必要事件、因果前提或人物当前能知道的信息；必要解释按故事需要保留，不建立解释句数量配额。',
    details: [
      '章纲已确认的人物行动与结果由程序建立稳定来源编号，生成与验收共用这份来源清单；首稿沿同一主体、地点、事件先后与结果自然展开，不能把必需行动压成准备或意愿，也不逐项复述清单来凑解释。正文每次完整验收逐项覆盖，评审摘要不得删项或用同条中的局部结果冒充全条完成。核对动作主体、关键地点、先后与结果；意愿、准备、他人完成不代替指定角色已发生。证据须定位实际正文，未知不放行，缺失保留为真实问题；仅纠正审查合同一次，只替换点名无效行，保留其它已成立缺失和质量结论；引文定位纠错选择程序提供的正文段落编号，不重抄原文，评审引文允许简短应答和结果短句与同一行动的上下文共同举证，不因单条原文过短拒绝完整证据组；每条仍须逐字定位，孤立短句不能代替完整行动证明。单纯引用错误不改状态和理由，不为结构错误改稿。明确楼层可中阿数字同值定位；电梯实际显示目标数字且已停稳、开门的原文也可作为到达证据，不强制重写成数字加楼层单位。仅按按钮、计划、想象、远望或他人到达仍不能代替本人抵达，不要求照抄章纲或追加解释。',
      CROSS_STAGE_REVIEW_POLICY,
      STORY_CAUSAL_REVIEW_POLICY,
      SOURCE_QUALITY_POLICY,
      PLATFORM_MEASUREMENT_REVIEW_POLICY,
      SHORT_STORY_QUALITY_POLICY,
      READER_ENGAGEMENT_POLICY,
      IDEA_REVIEW_EVIDENCE_POLICY,
      STORY_ENTITY_MODELING_POLICY,
      '完整度边界：大纲和故事卡须明确核心真相、冲突结果与揭示安排，正文只兑现当前章的事件和到期揭示；不得要求每章交代全书答案，也不得把未到期伏笔或人物情感尚未定论判为缺失。',
      '地点证据：车辆名称、文书目的地、远望、传闻和未来访问计划不等于本章抵达该地点。确定性空间阻断须有实际场景落点或抵达证据，不能因出现下一章地名便改写主线；真实越界与提前兑现仍保留阻断，复杂或不明确的叙述交语义核对。',
      '重复阐释：行动、对白或物证已使读者能够推断的信息，后续旁白若只换词重复其情绪、因果或含义，且没有新增信息、改变判断或推动选择，应收敛。角色思考、必要背景和有新信息的解释可以保留；不禁止某种句式，不按解释句数量扣分。',
      '认知边界：限知视角中的人物可以猜测、误判或犹豫；没有可知证据时，不把他人的内心或幕后真相写成确定事实。全知视角按已选视角判断，不强行改成限知。',
      '结尾与回溯：同一场景不连续叠加同义感悟、主题总结和悬念问句；回溯须新增线索、因果或人物理解，不能重播读者已知的结论。真正的结局需兑现核心冲突，但不强制所有人物获得解释、原谅或情绪圆满。',
      '平台与标签：按当前平台、分类、文风、视角和流派分别给出证据；评审判据须附平台事实源实际基准或作者自定义说明，不能只给事实源名称。平台节奏不等于逐句解释，白描不等于全篇机械短句。救赎、反转等全书承诺按当前阶段进度判断，不要求每章都完成；未知标签定义不得编造。',
      '证据执行合同：引文只允许连续匹配当前正文；仅有空白排版差异时可还原为正文真实切片，禁止省略号、斜线拼接或改词恢复。坐标由程序按 UTF-16 计算，不采用模型自报坐标；重复引文没有唯一修复位置。问题严重度保留，但任一语义问题证据未验证，评审即未完成，不能给完整综合分或报通过；旧正式报告不能被证据未完成的新评审替换。',
      '判定依据：重复解释输出 shownEvidence（已呈现信息原文）与 basisReason（是否新增信息、改变判断、推动选择）；提前揭示输出 basisSource=chapter_plan 与 basisEvidence（章纲揭示安排）；因果缺口引用正文、项目上下文或章纲中的必要前提并说明缺口影响。各标签分同时给正文证据与引用该维实际执行判据的 basis / tagFitBasis；未知操作定义输出 unknown_definition，不评分、不缩小覆盖分母。',
      '流派定义由项目执行标准核验：内置创作流派候选与操作定义由 shared 的 GENRE_GUIDES 同源派生，选择界面、题材生成和质检共用；这是系统创作口径，不冒称平台官方定义。没有系统或匹配平台定义且作者未填写 genreFitNote 时，固定标记 unknown_definition；仅写“按某流派执行”不构成操作定义，模型不能自行补分。',
      '精修执行：只使用已验证问题与唯一原文，允许删除冗余解释；解析失败不得采用旧建议补成新修订。复检检查当前完整正文并提供当前正文证据及修复边界说明。',
    ],
    directives: {
      generation: '先呈现足以理解的行动、对白与关键细节，保留可推断的意义和未到期答案。',
      review: '逐场景检查动作之后的解释和场景结尾，并比较同一发现跨段落的重复总结；不能因为一句话属于主角思考就自动豁免，也不能因为它是解释就自动判错。须同时指出“呈现信息的原文”和“重复解读的原文”，说明后者是否新增信息、改变判断或推动选择，或指出过早揭示所违反的章纲安排；无法证明冗余时不报过度解释。认定因果缺口须说明缺少哪项必要前提、如何妨碍理解当前行动，不能仅以“没有解释”定罪。',
      repair: '只收敛有证据的冗余；保留新增信息、必要心理转折、事实和因果，不用新增背景、旁白总结或虚构事实填平留白，修后复检这些边界。',
    },
    implementationRefs: ['server/shared/src/execution-standard-dimensions.ts', 'server/src/modules/story-dict/story-dict.service.ts', 'desktop/src/renderer/components/ExecutionStandardsForm.tsx', 'server/src/chain/real-llm.service.ts', 'server/src/chain/chain.controller.ts', 'server/src/modules/project/creative-constitution.ts', 'server/src/modules/writing-quality/quality-issue.ts', 'server/src/modules/writing-quality/stage-score.ts', 'server/src/modules/writing-quality/source-quality-review.ts', 'server/src/modules/writing-quality/writing-quality.service.ts', 'server/src/modules/writing-quality/repair-strategy-registry.ts'],
    testRefs: ['server/src/chain/cross-stage-review.spec.ts', 'server/src/modules/project/creative-constitution.spec.ts', 'server/src/modules/story-dict/story-dict.seed.spec.ts', 'server/src/modules/module-standards/module-standards.service.spec.ts', 'server/src/modules/writing-quality/quality-execution.spec.ts', 'server/src/modules/writing-quality/quality-issue.spec.ts', 'server/src/modules/writing-quality/writing-quality.evidence.spec.ts'],
  }),
  rule({
    id: 'QLT-004', name: '语言启发式边界', category: 'quality', level: 'P1', status: 'active', blocking: true,
    scenarios: WRITING_SCENES, consumers: ['prompt', 'deterministic_gate', 'semantic_gate', 'repair', 'test'], dependencies: ['QLT-002'],
    summary: '标点种类少、偶然等长段、缺少动作/停顿/语气词、全局转场词频、单纯段长相似不能单独构成语言 Hard Gate。只有实际重复、重复对答、相邻叙述段机械转场等可定位证据才能进入确定性阻断；其余交给语义评审。',
    details: ['同构并列扫描保留原文风险定位，生成验收与手动质检均不得仅凭重复前缀直接阻断或改写；交同一次语言语义评审核对其叙事作用与人物处境，已证实机械复述仍按语言缺陷阻断。统计指纹只定位待语义核对的风险，不直接扣综合分或改变自动质检达标状态。普通列举、合法问句和必要语气词不能因形态计数被认定为AI痕迹；实际重复和机械对白仍由有原文证据的语义审查与语言硬线处理，既定达标门槛保持。'],
    implementationRefs: ['server/src/chain/hardline-scanner.ts', 'server/src/modules/writing-quality/writing-quality.service.ts'],
    testRefs: ['server/src/modules/writing-quality/writing-quality.evidence.spec.ts'],
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
    summary: '标题与首屏不能以字段齐全、字面重合或自述新颖证明点击欲望；应锚定本故事具体人物/关系/处境/规则/代价/异常或信息差。空标题或明确通用套名可直接阻断；除此之外，标题/首屏是否兑现阅读承诺必须由完整语义证据判断，字面重合度与关键词命中只能作风险信号。Gate 点名标题时只允许沿原故事修标题表达，不得换题、改人物或提前泄露终局反转。标题优先提炼已有事件中的具体矛盾、反常关系或迫切后果；首屏兑现标题承诺并留下尚未回答的问题，不能先讲完因果答案。完读依靠后续选择、升级与阶段兑现，不能只靠夸张标题。缺少真实读者数据时不得宣称高点击率或高完读率，语义审核仅提供证据与改进判断。',
    details: ['完整卡审查须同时核对标题、首屏、同批实质差异、故事因果自洽、承诺可信兑现及平台/分类/流派实际机制。结局、设定、章节规划和各维真实执行标准须进入评审上下文；三个内容判据分别给连续卡片原文和判断说明，缺项或拼接证据不得过关。反转不能取消已成立前提，身份/证据/亲属关系不能直接等同程序或权利生效，不能用未建立的新能力一次解决所有冲突。前置筛选逐对比较关系、主动选择、对手制约、升级、反转和结局代价，不靠换时代和分类标签假装多样。 审查阻断issues必须对应false判据，六项全true却有阻断理由属于协议冲突，应纠正结论；可选建议单列warnings，不得按建议字样自动弱化真实矛盾。复审只验收实际待修卡，已知参考卡的多余结论不参与验收，未知或重复待修卡仍拒绝。时间预警按原题材是否允许未来改写区分原未来、改变后的未来与同一时点，不能擅造时间线或取消三个月等既定时间间隔。'],
    implementationRefs: ['server/src/chain/idea-presentation-review.ts', 'server/src/chain/chain.controller.ts', 'server/src/chain/idea-appeal-gate.service.ts', 'server/src/chain/idea-discovery-contract.ts'],
  }),
  rule({
    id: 'QLT-008', name: '平台指标中的代理信号', category: 'quality', level: 'P2', status: 'active', blocking: false,
    scenarios: WRITING_SCENES, consumers: ['deterministic_gate', 'semantic_gate', 'repair'], dependencies: ['PLAT-002'],
    summary: '开篇钩子窗口、对话/段落比例、推进候选间隔等平台指标可产生风险提示；只有 Creative Constitution 或统一平台规则明确规定为硬边界时才可阻断。非阻断的平台统计偏差保留报告与评分，但不能单独触发正文自动修复；自动修改须由明确硬要求或证据化严重语义问题触发，不为对话比例等代理指标强塞交流或解释。推进关键词间隔本身必须标记为 proxy risk，并由语义评审确认是否真实无推进。',
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
    details: [`正文与精修语言维度使用项目评分策略的独立最低分；未配置时默认${DEFAULT_LANGUAGE_SCORE_FLOOR}分。有效语言评分低于该下限且有当前正文逐字依据时阻断，不能用综合高分覆盖。无可验证依据仍属评审未完成，不能随机修文；整章通过不表示竞争性质量达到头部作品。`],
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/modules/writing-quality'],
  }),
  rule({
    id: 'QLT-012', name: '架构对齐问题的阻断证据', category: 'quality', level: 'P1', status: 'active', blocking: true,
    scenarios: ['outline', 'review', 'writing'], consumers: ['prompt', 'semantic_gate', 'deterministic_gate', 'test'], dependencies: ['ARCH-002', 'QLT-002'],
    summary: '只有明确事实互斥、必需事件缺失、事件顺序错位、后章边界越界或执行标准未落实，才能作为架构 Blocking。建议字段明确否认缺失或冲突时，不因否定句含问题词升级阻断；只排除被否定的该句断言，其它肯定事实缺陷仍保留，正式矛盾字段不据措辞自动降级。仅有“与大纲有出入”“缺少过渡”“口径不一致”等泛化措辞不能自动升级。',
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
      NATURAL_PROSE_POLICY,
    ],
    implementationRefs: ['server/src/chain/hardline-scanner.ts', 'server/src/chain/chain.controller.ts', 'server/src/modules/writing-quality/stage-score.ts', 'server/src/modules/module-standards/standard-directive.cache.ts'],
    testRefs: ['server/src/modules/writing-quality/natural-prose-policy.spec.ts'],
  }),

  rule({
    id: 'RPR-001', name: '最小局部修复', category: 'repair', level: 'P0', status: 'active', blocking: true,
    scenarios: ['polish', 'review', 'writing'], consumers: ['prompt', 'repair', 'test'], dependencies: ['QLT-001'],
    summary: '自动修复只改可唯一定位的问题片段；无法定位或证明改善时保留原稿，禁止整章重写、换模型或降严重度兜底。',
    details: [
      '同等可修方案优先选择改动范围与下游影响更小者；锁定正文不得自动精修或自动解锁。',
      '生成补丁前按执行器提供的本轮字符预算与计费口径选择局部片段；预算是上限不是必须用满的目标。不足以处理全部问题时先修证据明确且能净改善的一组，其余保持待修，不声称通过。',
      '局部语言修复既要通过确定性复扫，也要通过完整故事验收；不能只因表面命中减少就接纳。',
      '统一质量Gate对正文进行了最终补丁时，补丁后的确切正文须重新通过章纲、作者要求及后续边界验收；失败须撤销该运行及当前报告的通过凭证，不能持先前PASS写入Canon。',
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
    details: ['上游分流比较同口径的完整问题集合，不能把上轮仅语义问题与本轮语义加硬伤比较后误报增长；保留硬伤原文、位置与依据供诊断，不只传规则号。比较实际缺陷而非评审措辞或拆分条数。无法通过严格子集或未变原文确认进展时，只允许一次改前、改后段落证据核对；条数不减少时还须证明至少一个原缺陷已完整解决，且全部剩余缺陷原已存在。新缺陷或证据不明仍回滚。有限轮数由LLM_TUNABLES维护；全部剩余问题仍阻断Canon，证据核对不能授予质量通过。'],
    implementationRefs: ['server/src/chain/chain.controller.ts', 'server/src/chain/semantic-progress-audit.ts', 'server/src/config/llm-tunables.ts'],
  }),
  rule({
    id: 'RPR-005', name: '连续缺陷上游诊断与分流', category: 'repair', level: 'P0', status: 'active', blocking: true,
    scenarios: ALL_SCENES, consumers: ['prompt', 'repair', 'test'], dependencies: ['RPR-003', 'CTX-001', 'AUTH-003'],
    summary: UPSTREAM_REPAIR_ROUTING_POLICY,
    parameterRefs: ['server/shared/src/system-workflow-rules.registry.ts#UPSTREAM_REPAIR_ROUTING_LIMITS'],
    implementationRefs: ['server/src/chain/upstream-repair-routing.ts', 'server/src/chain/chain.controller.ts'],
    directives: { repair: '先定位来源阶段及受影响的同类问题，返回有证据的来源判断和待核项；不继续补丁循环，不改作者确认事实，不把诊断返回成功当正文达标。' },
  }),
  rule({
    id: 'RPR-004', name: '评审输出修复与小说修复分离', category: 'repair', level: 'P0', status: 'active', blocking: true,
    scenarios: ['review'], consumers: ['prompt', 'repair', 'test'], dependencies: ['GEN-005'],
    summary: '审查 JSON/字段不合规只修审查输出；不能借修复报告改小说/章纲/Canon。',
    details: ['章节评审只接收完整JSON报告，不从语法错误输出的内部片段提取局部对象冒充完整报告。必要结构或语法错误允许一次同输入协议纠错，不改正文、不自动填通过。readerGoals与总体evidence只能是报告顶层；实际提供但误放sourceQualityAudit内的字段仅纠正归属，不能创造缺项，重复值互斥须阻断。可解析报告只返回点名错误路径的补丁，保留其它字段及真实冲突，不重做完整报告；完整语法无效时重新按当前正文和合法骨架生成报告，不复制损坏对象或placeholder污染纠错。纠错后仍运行全部事实、语言、源头证据和独立时间/因果验收；仍不完整时保持未评估。阅读倾向或六项源头审查判断完整但引文改述或不能定位时，共用一次对应来源的段落编号纠错，由系统提取原文；不改status、reason及真实问题，不使用模糊匹配。编号无效或原文不支持判断时仍保持未评估。'],
    implementationRefs: ['server/src/chain/chain.controller.ts'],
  }),

  rule({
    id: 'WF-001', name: '模型成功不等于业务成功', category: 'workflow', level: 'P0', status: 'active', blocking: true,
    scenarios: ALL_SCENES, consumers: ['deterministic_gate', 'semantic_gate', 'persistence', 'test'], dependencies: ['QLT-001'],
    summary: 'LLM/解析/generation run 成功不能替代 Gate、事务写入和业务状态成功；不同失败原因分别记录。',
    details: ['合法 JSON 的字段校验失败必须保留具体字段问题；不得误报为非法 JSON，不得用内部片段替代完整候选或宣称解析恢复成功。'],
    implementationRefs: ['server/src/modules/generation-metrics/generation-metrics.service.ts', 'server/src/chain/real-llm.service.ts', 'server/src/chain/chain.controller.ts'],
    testRefs: ['server/src/chain/chain.controller.helpers.spec.ts'],
  }),
  rule({
    id: 'WF-002', name: '受控业务重试', category: 'workflow', level: 'P1', status: 'active', blocking: true,
    scenarios: ALL_SCENES, consumers: ['retry', 'semantic_gate', 'test'], dependencies: ['WF-001'],
    summary: '业务重试只用于可修结构错误或有新质量证据的可修失败；不可重试 Gate/重复失败签名立即停止，不得无限尝试。',
    details: ['同一结构化任务由统一调用器执行有界纠正；耗尽后不得叠加同问题的结构修复或 JSON 重建整对象生成；本地语法恢复的完整候选仍须通过原字段校验。', '题材独立审查的协议或证据来源校验失败属于审查未完成，不能当作故事内容缺陷触发题材重写。错误须逐卡点名字段与引用来源。锁定胚子的独立完整卡按统一并发上限生成，结果保持胚子顺序；同批比较与最终质量门保持完整。', '题材因果、兑现或平台机制的有效审查拒绝后，一次局部修复须能覆盖设定、结局与阶段中的同一问题；只准授权字段的逐字定位替换，不能只修概要留下旧事实。保留人物、选择方向、规则数值和代价；无法沿原事实修复则继续拒绝。悬疑信息暂未揭示、超自然能力未解释科学来源，不等于因果缺陷；只在缺少必要前提、触发边界或结果互斥时阻断。'],
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
    details: ['灵感发现必须恰好交付用户请求的合格题材数才能success=true。缺量时success=false/status=incomplete，保留qualifiedIdeas与完整审计作为诊断候选，ideas不作完成批次交付；前端数量合同同样拒收缺量与超额。不得用弱题材补数，或把诊断候选标为生成完成。'],
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
    directives: { generation: '首稿写作前按当前平台参数与ChapterPlan安排已有场景的信息、冲突和回报：开篇优先呈现本章核心事件，后续推进落实到行动结果；允许承担不同职责的场景使用不同对白密度，只有当前人物确实能说、确实需要交流的信息才交给对白。避免把关键交流全部改为旁白后再靠多轮修复补回；不为达比例捏造对话，不在可发布正文输出计划或自评。' },
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
    scenarios: ALL_SCENES, consumers: ['learning', 'prompt', 'test'], dependencies: ['LEARN-001'],
    summary: '历史学习只在当前规则允许的候选策略中排序/选择，只使用已接受修复；不得修改 Rule ID、等级、blocking、阈值、Canon、Constitution 或平台标准。',
    details: ['经验须保留实际有效的策略和复检范围；中间局部改善、未完成评审、回滚或失败不等于通过保存门，不得冒充已验证成功经验。'],
    directives: { generation: '已验证经验只作为与当前问题和规则相符的策略参考；历史诊断不作为小说事实或强制要求。先按当前章职责与创作宪法组织首稿，不机械复刻旧修复或套用另一作品事实。', repair: '复用已验证策略时核对当前问题、事实条件与改动预算，仍完整复检候选；无成功样本明确证据不足，不承诺自动达标。' },
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

/** Prompt projection only: complete chapter gates remain unchanged. */
export const SYSTEM_WORKFLOW_PROMPT_RULE_SCOPE_BY_STEP: Readonly<Record<string,readonly string[]>> = {
  // Complete body quality gates execute later; framework review still consumes
  // SOURCE_QUALITY_POLICY explicitly and keeps all source facts in its input.
  creation_cross_stage_review: ['GOV-005','AUTH-004','ARCH-002','ARCH-003','CTX-004','CTX-006','CTX-007','CTX-008','GEN-002','GEN-006','RPR-004'],
  // Boundary helpers already consume SOURCE_QUALITY_POLICY from this Registry.
  // Do not inject the full QLT-003 report policy again into this small protocol.
  creation_outline_source_boundary: ['GOV-005','AUTH-002','CTX-001','CTX-003','RPR-004'],
  creation_outline_result_proof: ['GOV-005','AUTH-002','CTX-001','CTX-003','RPR-004'],
  // The candidate ledger consumes OUTLINE_STATE_CONTINUITY_POLICY explicitly.
  creation_outline_fact_dependencies: ['GOV-005','AUTH-002','CTX-001','CTX-003','CTX-005','CTX-008','RPR-004'],
  creation_cross_stage_repair: ['GOV-005','AUTH-002','CTX-001','CTX-003','QLT-014','RPR-004'],
  alignment_source_boundary_review: ['GOV-005','AUTH-002','CTX-001','CTX-003','RPR-004'],
  alignment_source_boundary_contract: ['GOV-005','AUTH-002','CTX-001','CTX-003','RPR-004'],
  body_length_review: ['GOV-005','AUTH-002','CTX-001','CTX-003','CTX-005','CTX-008','GEN-005','GEN-007','RPR-004'],
  body_length_recheck: ['GOV-005','AUTH-002','CTX-001','CTX-003','CTX-005','CTX-008','GEN-005','GEN-007','RPR-004'],
  body_length_evidence_contract: ['GOV-005','AUTH-002','CTX-001','CTX-003','CTX-005','CTX-008','GEN-005','GEN-007','RPR-004'],
  alignment_obligation_contract: ['GOV-005','AUTH-002','CTX-001','CTX-003','QLT-003','RPR-004'],
  alignment_temporal_review: ['GOV-005','AUTH-002','CTX-001','CTX-003','CTX-005','CTX-008','RPR-004'],
  alignment_temporal_contract: ['GOV-005','AUTH-002','CTX-001','CTX-003','CTX-005','CTX-008','RPR-004'],
};
