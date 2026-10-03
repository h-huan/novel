export type CanonSourceType =
  | 'confirmed_story'
  | 'creative_constitution'
  | 'world_setting'
  | 'world_rule'
  | 'book_skeleton'
  | 'volume_plan'
  | 'character'
  | 'timeline'
  | 'foreshadowing'
  | 'chapter_plan'
  | 'accepted_prose'
  | 'draft_prose'
  | 'state'
  | 'rag'
  | 'summary';

export type CanonTemporalState = 'confirmed_history' | 'current_execution' | 'future_plan' | 'derived';

/**
 * 世界观是作品地基。创建完成以后任何自动流程都不得修改、修复或重写世界观；
 * 冲突必须在其它资料中以最小影响面圆回。只有项目仍处于 creating 时允许首次建立世界观。
 */
export const WORLD_CANON_IMMUTABLE = true as const;

/**
 * 不是“层级越低就一定改”，而是“能保持世界观与已发生事实不动的前提下，选总修改代价最低的点”。
 * 数值只是确定性比较基线；实际选择还会叠加锁定、时间态和下游依赖数量。
 */
export const CANON_REPAIR_BASE_COST: Readonly<Record<CanonSourceType, number>> = Object.freeze({
  world_setting: Number.POSITIVE_INFINITY,
  world_rule: Number.POSITIVE_INFINITY,
  creative_constitution: 10_000,
  confirmed_story: 9_000,
  accepted_prose: 3_000,
  book_skeleton: 2_000,
  volume_plan: 1_200,
  character: 900,
  timeline: 800,
  foreshadowing: 700,
  state: 650,
  chapter_plan: 350,
  draft_prose: 120,
  rag: 30,
  summary: 20,
});

export interface CanonRepairCandidate {
  sourceType: CanonSourceType;
  sourceId?: string | null;
  temporalState?: CanonTemporalState;
  locked?: boolean;
  /** 预计会被该修改连带影响的下游记录数。 */
  dependentCount?: number;
  /** 预计需要改动的字段/段落/事件数。 */
  changeUnits?: number;
}

export interface CanonRepairDecision {
  target: CanonRepairCandidate | null;
  requiresHumanDecision: boolean;
  reason: string;
  scored: Array<{ candidate: CanonRepairCandidate; cost: number; eligible: boolean; reason: string }>;
}

export function isImmutableCanonSource(sourceType: CanonSourceType): boolean {
  return sourceType === 'world_setting' || sourceType === 'world_rule';
}

function candidateCost(candidate: CanonRepairCandidate): { cost: number; eligible: boolean; reason: string } {
  if (isImmutableCanonSource(candidate.sourceType)) {
    return { cost: Number.POSITIVE_INFINITY, eligible: false, reason: '世界观 Canon 永久不可作为自动修复目标' };
  }
  if (candidate.locked) {
    return { cost: Number.POSITIVE_INFINITY, eligible: false, reason: '该资料已锁定，自动流程不得修改' };
  }

  let cost = CANON_REPAIR_BASE_COST[candidate.sourceType];
  const dependentCount = Math.max(0, Math.floor(Number(candidate.dependentCount || 0)));
  const changeUnits = Math.max(1, Math.floor(Number(candidate.changeUnits || 1)));

  // 已经发生的事实尽量不回改；未来计划反而是最适合吸收变化的位置。
  if (candidate.temporalState === 'confirmed_history') cost += 5_000;
  if (candidate.temporalState === 'current_execution') cost += 500;
  if (candidate.temporalState === 'future_plan') cost *= 0.55;
  if (candidate.temporalState === 'derived') cost *= 0.35;

  // 雪崩成本：依赖越多、修改单元越多，越不应该选这里修。
  cost += dependentCount * 40;
  cost += Math.max(0, changeUnits - 1) * 25;

  return { cost, eligible: Number.isFinite(cost), reason: '可修改，按基础代价 + 时间态 + 下游依赖 + 修改范围计算' };
}

/**
 * 冲突修复唯一选择器：不改世界观；不改锁定内容；其余候选按总影响成本从小到大选。
 * 若没有安全候选，显式要求人工裁决，禁止为了“通过 Gate”去改上层地基。
 */
export function chooseMinimumImpactRepair(candidates: readonly CanonRepairCandidate[]): CanonRepairDecision {
  const scored = candidates.map(candidate => {
    const score = candidateCost(candidate);
    return { candidate, ...score };
  });
  const eligible = scored.filter(item => item.eligible).sort((a, b) => a.cost - b.cost);
  if (!eligible.length) {
    return {
      target: null,
      requiresHumanDecision: true,
      reason: '没有可安全自动修改的资料；世界观/锁定事实保持不变，需要人工决定如何继续。',
      scored,
    };
  }
  return {
    target: eligible[0].candidate,
    requiresHumanDecision: false,
    reason: `选择 ${eligible[0].candidate.sourceType} 作为最小代价修复点，避免扩大影响面。`,
    scored,
  };
}

/**
 * 所有生成、审查、修复都只引用这一份原则。不要在各 Prompt 再写第二套“事实优先级”。
 */
export function buildCanonPolicyDirective(): string {
  return `【唯一 Canon 与最小代价修复原则】\n`
    + `1. 世界观（world_setting / world_rule）一旦建立就是作品地基，任何自动生成、审查、修复、RAG 回填都不得修改世界观；发现冲突时必须改其它资料。\n`
    + `2. 已经发生且已接受的正文事实尽量保持不动；未来卷纲/章纲/伏笔/时间线属于可调整计划，只要不触碰世界观与已确认故事核心，应优先让未来计划衔接已经发生的历史。\n`
    + `3. 其它冲突不按“为了通过 Gate 就重写整层”的方式处理。必须优先选择修改范围最小、下游依赖最少、可局部圆回的资料；通常优先级为派生摘要/RAG → 未接受草稿 → 当前或未来 ChapterPlan → 局部伏笔/时间线/角色状态 → 卷/全书骨架。\n`
    + `4. Creative Constitution / confirmedStory 代表作者已经确认的创作方向，自动流程不得为了迁就下层内容反向改写；若它与不可自动修改的世界观或锁定事实发生真正互斥，必须阻断并要求人工裁决。\n`
    + `5. RAG 与摘要只是检索/派生材料，没有独立事实权威；它们与真实 Canon 冲突时直接重建或丢弃，不得反向覆盖 Canon。\n`
    + `6. 修复必须局部、单调：只改被选中的最小修复点，复检后冲突必须减少且不得新增更大影响的冲突；否则回滚并停止。`;
}
