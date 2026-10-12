import { repairStrategies } from '../writing-quality/repair-strategy-registry';
export interface RepairStrategyStats {
  attempts: number;
  accepted: number;
  rollbacks?: number;
  damage?: number;
  tokens?: number;
  latencyMs?: number;
  improvement?: number;
  improvement_sum?: number;
}

/**
 * Bayesian success estimate with bounded harm and cost penalties. Cost never
 * outweighs correctness; it only breaks ties between similarly reliable
 * strategies so the platform learns to use fewer tokens and less time.
 */
export function repairStrategyUtility(raw: RepairStrategyStats): number {
  const attempts = Math.max(1, Number(raw.attempts) || 0);
  const accepted = Math.max(0, Number(raw.accepted) || 0);
  const success = (accepted + 1) / (attempts + 2);
  const harmRate = Math.min(1, ((Number(raw.rollbacks) || 0) + (Number(raw.damage) || 0)) / attempts);
  const averageTokens = Math.max(0, Number(raw.tokens) || 0) / attempts;
  const averageLatency = Math.max(0, Number(raw.latencyMs) || 0) / attempts;
  const progress = Math.min(1, Math.max(0, Number(raw.improvement ?? raw.improvement_sum) || 0) / attempts);
  const tokenPenalty = 0.04 * Math.min(1, Math.log1p(averageTokens) / Math.log(100_001));
  const latencyPenalty = 0.04 * Math.min(1, Math.log1p(averageLatency) / Math.log(600_001));
  return success + 0.12 * progress - 0.25 * harmRate - tokenPenalty - latencyPenalty;
}

/** 样本门槛：低于此尝试次数不做淘汰判断，避免小样本误杀。 */
export const REPAIR_STRATEGY_MIN_ATTEMPTS = 5;
/** 接受率下限：达到样本门槛后仍低于此值，说明该策略在这条规则轴上被证伪。 */
export const REPAIR_STRATEGY_MIN_ACCEPTANCE = 0.2;

/**
 * 排序分数只回答"剩下这几个谁更好"，它无法阻止一个已被证伪的策略因为
 * "候选池里只剩它"而被反复选中。实测 unique_local_replacement 与
 * platform_metric_patch 在多个规则轴上 0% 接受率，却持续被选中，累计烧掉
 * 数千秒与数百万 token。这里补一道硬门槛：样本足够 + 接受率达标 + 无等量级损伤，
 * 三者缺一即退出候选，让调用方回退到确定性默认策略。
 */
export function isRepairStrategyEligible(raw: RepairStrategyStats): boolean {
  const attempts = Number(raw.attempts) || 0;
  if (attempts < REPAIR_STRATEGY_MIN_ATTEMPTS) return false;
  const accepted = Math.max(0, Number(raw.accepted) || 0);
  if (accepted / attempts < REPAIR_STRATEGY_MIN_ACCEPTANCE) return false;
  const harm = Math.max(0, Number(raw.rollbacks) || 0) + Math.max(0, Number(raw.damage) || 0);
  return harm < attempts;
}

/** 只由已接受、已评估的修复调用；不复制小说事实或阈值为规则。 */
export function verifiedRepairLesson(ruleId: string, strategyId: string): string | null {
  if (!Object.hasOwn(repairStrategies, strategyId)) return null;
  const strategy = repairStrategies[strategyId as keyof typeof repairStrategies];
  return '已验证策略参考：问题 '+ruleId+'；策略 '+strategyId+'；方法：'+strategy.prompt+' 仅供当前规则允许的同类问题参考，仍按当前创作宪法、事实条件与本轮预算执行，并完整复检候选；历史成功不代替本次验收。';
}
