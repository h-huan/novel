#!/usr/bin/env python3
from pathlib import Path

def fail(message: str) -> None: raise SystemExit(message)
def read(path: Path) -> str:
    if not path.exists(): fail(f"missing file: {path}")
    return path.read_text(encoding="utf-8-sig")
def write(path: Path,text: str)->None: path.write_text(text,encoding="utf-8")
def replace_once(text: str, old: str, new: str, label: str)->str:
    count=text.count(old)
    if count!=1: fail(f"{label}: expected exactly one match, got {count}")
    return text.replace(old,new,1)
ROOT=Path.cwd()

def patch_chain_controller(root: Path)->None:
    path=root/"server/src/chain/chain.controller.ts"; text=read(path)
    text=replace_once(text,"import { ideaTimeConflict } from './idea-fact-consistency';\n","","chain controller idea special-case import")
    text=replace_once(text,"import { detectSourceCountdownConflict } from './source-countdown-consistency';\n","import { detectSourceCountdownRisk } from './source-countdown-consistency';\n","chain controller countdown advisory import")
    old_precheck="""    // 这里曾只在项目激活前审查时间规则，后果是自相矛盾的题材卡耗完整轮生成后才失败。
    if (ideaTimeConflict(dto.selectedIdea || {})) {
      return { success: false, error: '所选题材的钩子与概要对门后时间给出不同数值；项目未创建，请先统一题材卡中的时间规则。' };
    }

"""
    text=replace_once(text,old_precheck,"","chain controller idea special-case precheck")
    old_countdown="""    const sourceCountdownConflict = detectSourceCountdownConflict(reviewWorldContext, outlineContract);
    if (sourceCountdownConflict) {
      this.logger.warn(`章节 ${chapterIndex} ${sourceCountdownConflict}`);
      throw new HttpException(sourceCountdownConflict, 422);
    }
"""
    new_countdown="""    // Raw prose cannot prove two numeric phrases share one stable fact identity. Surface the
    // arithmetic risk for semantic review/logging, but deterministic CTX-005 blocking is reserved
    // for structured claims with an explicit identity/unit/source.
    const sourceCountdownRisk = detectSourceCountdownRisk(reviewWorldContext, outlineContract);
    if (sourceCountdownRisk) this.logger.warn(`章节 ${chapterIndex} ${sourceCountdownRisk}`);
"""
    text=replace_once(text,old_countdown,new_countdown,"chain controller countdown raw-text demotion")
    norm_start="  const mapped = map[raw];\n  if (mapped && mapped !== 'paving') return mapped;\n\n  const chapterNo = chapterNumberFromOrder(order);\n"; norm_end="};\n\nexport const parsePositiveTargetWords"
    a=text.find(norm_start); b=text.find(norm_end,a+len(norm_start)) if a>=0 else -1
    if a<0 or b<0: fail('chain controller order-based chapter-function fallback not found')
    neutral="""  const mapped = map[raw];
  if (mapped) return mapped;
  // Compatibility value only: missing/unknown chapter responsibility must not be invented from chapter order.
  // The executable responsibility remains the ChapterPlan/content + semantic architecture audit.
  return 'paving';
};

export const parsePositiveTargetWords"""
    text=text[:a]+neutral+text[b+len(norm_end):]
    goal_start="const inferOutlineGoalArc = (order = 0, isShort = true): string => {\n"; goal_end="};\n\n// ==================== DTO ===================="
    a=text.find(goal_start); b=text.find(goal_end,a+len(goal_start)) if a>=0 else -1
    if a<0 or b<0: fail('chain controller order-based goal-arc fallback not found')
    goal_neutral="""const inferOutlineGoalArc = (_order = 0, _isShort = true): string => {
  // Do not synthesize a story arc from chapter position. Empty means "not explicitly supplied";
  // the actual chapter responsibility remains in ChapterPlan/content and is audited semantically.
  return '';
};

// ==================== DTO ===================="""
    text=text[:a]+goal_neutral+text[b+len(goal_end):]
    forced_start="        // 防御：无论模型/上游给出什么功能值，短篇落库前统一按节奏兜底，避免全 paving 或非法值入库\n"; forced_end="        if (preparedChapters.length > 0 && shortOutlineSourceRunIds.size === 0) {"
    a=text.find(forced_start); b=text.find(forced_end,a+len(forced_start)) if a>=0 else -1
    if a<0 or b<0: fail('chain controller forced terminal chapter rhythm block not found')
    neutralize="""        // Normalize only an explicitly supplied chapter function. Do not force terminal/penultimate
        // responsibilities from position; closure/climax obligations come from the story's ChapterPlan and audit.
        preparedChapters.forEach((c, i) => {
          const fn = normalizeOutlineChapterFunction(c.chapterFunction, c.order, isShort);
          if (fn !== c.chapterFunction) preparedChapters[i] = { ...c, chapterFunction: fn };
        });

        if (preparedChapters.length > 0 && shortOutlineSourceRunIds.size === 0) {"""
    text=text[:a]+neutralize+text[b+len(forced_end):]
    shared_start="【整体质量要求（最高优先级，不可妥协）】\n"; shared_end="【篇幅配置】项目目标总字数${dto.targetWords}"
    a=text.find(shared_start); b=text.find(shared_end,a+len(shared_start)) if a>=0 else -1
    if a<0 or b<0: fail('chain controller duplicate chapter public-quality block not found')
    text=text[:a]+text[b:]
    pairs=[
      ("1. 核心内容 (content) — 100字左右的事件链要点，从开场到转折结果的5步推进，不要展开成正文。","1. 核心内容 (content) — 按顺序概括本章职责真正需要的事件链，从入口状态写到本章结果；步骤数量由事件本身决定，不固定为5步，不展开成正文。"),
      ("2. 主要场景 (scenes) — 2-3个关键场景数组，每场写 location(地点) + goal(本场目标) + conflict(本场阻碍) + outcome(本场结果)。","2. 主要场景 (scenes) — 本章实际需要的关键场景数组，每场写 location(地点) + goal(本场目标) + conflict(本场阻碍) + outcome(本场结果)；不按固定场景数量凑数。"),
      ("4. 冲突设计 (conflicts) — 本章冲突设计数组：列出2-3个本章冲突（如人物内心冲突/人际冲突/环境冲突/系统冲突），每个含 冲突名 + 冲突双方 + 触发条件 + 升级路径 + 本章解决程度。","4. 冲突设计 (conflicts) — 只列本章实际存在的冲突，每个含 冲突名 + 冲突双方 + 触发条件 + 升级路径 + 本章解决程度；本章职责不需要独立冲突项时写[]，不得为满足数量制造冲突。"),
      ('8. 人物状态 (characterStates) — 至少1个核心人物本章状态变化，格式:{"character","stateBefore","stateAfter","trigger"}。','8. 人物状态 (characterStates) — 只有本章确实改变人物状态时列出，格式:{"character","stateBefore","stateAfter","trigger"}；没有真实变化写[]，不得为满足字段制造变化。'),
      ('"content":"100字左右的事件链要点：开场→推进→受阻或选择→变化→结果"','"content":"按本章职责顺序概括必要事件链与结果"'),
    ]
    for old,new in pairs:
        if old not in text: fail(f'chain controller chapter schema quota marker missing: {old[:70]}')
        text=text.replace(old,new,1)
    old_conf="""            // 冲突：至少 1 个（presence 校验，避免单冲突章节触发修复循环；prompt 仍要求 2-3 个）
            const conflicts = Array.isArray(candidate.conflicts)
              ? candidate.conflicts
              : (String(candidate.conflict || '').trim() ? [candidate.conflict] : []);
            if (conflicts.length < 1) issues.push('缺少conflict/conflicts');
"""
    new_conf="""            // conflicts 保留为结构字段；是否必须存在冲突由当前 ChapterPlan/语义架构审查决定，
            // 不在结构解析器里按固定数量强迫故事制造冲突。
            const conflicts = Array.isArray(candidate.conflicts)
              ? candidate.conflicts
              : (String(candidate.conflict || '').trim() ? [candidate.conflict] : []);
            void conflicts;
"""
    text=replace_once(text,old_conf,new_conf,'chain controller chapter conflict quota')
    text=replace_once(text,'rules——核心规则数组：2-3 条，每条写成"谁在什么条件下做什么会发生什么"的 if-then 形式','rules——核心规则数组：只列本故事真正需要的核心因果规则，不设固定条数；每条写成"谁在什么条件下做什么会发生什么"的 if-then 形式','chain controller world rule-count quota')
    org_start='【地点层级限制】地点最多2级，禁止过度细化：\n'; org_end='输出JSON:{"organizations"'
    a=text.find(org_start); b=text.find(org_end,a+len(org_start)) if a>=0 else -1
    if a<0 or b<0: fail('chain controller fixed location hierarchy quota block not found')
    org_policy="""【地点层级】只保留对既定剧情有实际作用的层级；level 使用输出 schema 中最贴近的值，parentName 指向直接上级。
- 不为“世界丰富”创建无剧情作用的子地点，不设固定层级数或每层子节点配额。
- 同一物理地点只建一个点；内部功能场景挂在直接父地点下，不得用人物修饰、括号注释或别名平铺成重复地点。
"""
    text=text[:a]+org_policy+text[b:]
    duplicate_selection="""pool 以 ${premisePoolSize} 项为广搜目标，不是整批成功的硬门槛；每个有效 pool 项只需 premiseId、workingTitle、storyCore。若已经充分比较并能选出 ${requestedCount} 个成熟题材，可以少于目标，禁止为了凑数填弱项。selectedPremises 必须恰好 ${requestedCount} 项、premiseId 互不重复且来自 pool，并补齐创建完整题材卡前所需的筛选证据。
"""
    text=replace_once(text,duplicate_selection,"","chain controller duplicate premise-selection rule")
    old_shared="""4. 每项从改变主角命运的具体事件起步，写清目标、阻力、失败代价、行动时限、连续升级、不可逆选择和有效反转。短篇单线闭环；长篇保留可持续成长、关系和伏笔空间。
5. 标题、职业场景、时代、冲突和反转均要互不重复；不得套用知名作品或真实人物事件，不得产出违规内容。
6. 新颖性不是堆设定，也不是自己写一句“独特”。每项先选读者熟悉的类型外壳，再把【具体生活载体/职业】、【不可互换的人物关系】、【异常机制】组成一个彼此依赖的冲突；noveltyProof 必须写清 irreplaceableWhy、secondOrderConsequence、readerQuestion。凡可概括为“某种行为→直接受到超常惩罚/奖励”“发现秘密→一路追查”“获得能力→一路升级”，且去掉具体职业/关系后故事仍成立的，视为可替换模板，必须淘汰重想。核心机制启动后至少产生一个二阶后果：改变谁受益/谁受损、迫使关系重组、改变主角目标或制造真正两难；不能只有直接报应。若仍是历史题材的同一机制、同一追查路径或同一反转，也必须淘汰重想。
7. 输出前自行检查结构、篇幅和差异；不要为自检另写文字。
8. 同一题材的 hook、description、规则、时间跨度与反转必须共用一套事实：若写每次进入倒退N小时，就不得又写时间固定回到另一数值的N小时前；若历史中已经触发过名单增减，当前起始名单必须反映该变化。逐次变化要能从初始值算到结尾值。
"""
    text=replace_once(text,old_shared,"","chain controller duplicated public idea rules")
    write(path,text)

patch_chain_controller(ROOT)
for rel in ['server/src/chain/idea-fact-consistency.ts','server/src/chain/idea-fact-consistency.spec.ts']:
    p=ROOT/rel
    if p.exists(): p.unlink()
