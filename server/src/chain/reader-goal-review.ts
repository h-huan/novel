import { causalEvidenceAnchors } from '../modules/writing-quality/causal-review';
import { resolveQualityEvidence } from '../modules/writing-quality/quality-issue';

export const READER_GOAL_LABELS = { click: '点击倾向', completion: '完整阅读倾向', sharing: '传播倾向', immersion: '代入感' } as const;
export type ReaderGoalKey = keyof typeof READER_GOAL_LABELS;
export type ReaderGoalReview = Record<ReaderGoalKey, { status: 'supported' | 'weak' | 'unknown'; quote: string; reason: string }>;

/** Potentials are evidence-based judgements, never measured commercial rates. */
export function readerGoalReviewIssues(value: unknown, text: string, unitLabel = '当前题材'): string[] {
  const goals = value as ReaderGoalReview;
  return (Object.keys(READER_GOAL_LABELS) as ReaderGoalKey[]).flatMap(key => {
    const item = goals?.[key];
    if (!item || !['supported', 'weak', 'unknown'].includes(item.status)
      || typeof item.quote !== 'string' || typeof item.reason !== 'string' || item.reason.trim().length < 8)
      return [`${key}（${READER_GOAL_LABELS[key]}）须有supported/weak/unknown、quote和具体reason`];
    if (item.status !== 'unknown' && !resolveQualityEvidence(text, item.quote).verified)
      return [`${key}（${READER_GOAL_LABELS[key]}）引文不能逐字定位${unitLabel}原文，不能引用参考卡或执行标准`];
    if (item.status === 'unknown' && item.quote && !resolveQualityEvidence(text, item.quote).verified)
      return [`${key}（${READER_GOAL_LABELS[key]}）未知判断的引文仍须来自${unitLabel}`];
    return [];
  });
}

export function readerGoalGateIssues(goals: ReaderGoalReview): string[] {
  return (Object.keys(READER_GOAL_LABELS) as ReaderGoalKey[]).flatMap(key => goals[key].status === 'supported' ? []
    : [`${READER_GOAL_LABELS[key]}${goals[key].status === 'unknown' ? '证据不足，不能标为高倾向' : '存在已举证薄弱处'}：${goals[key].reason}`]);
}

/** Only well-formed judgments with invalid body citations are eligible. */
export function invalidReaderGoalQuotes(value: unknown, text: string): ReaderGoalKey[] {
  const goals = value as ReaderGoalReview;
  return (Object.keys(READER_GOAL_LABELS) as ReaderGoalKey[]).filter(key => {
    const row = goals?.[key];
    return row && ['supported','weak','unknown'].includes(row.status)
      && typeof row.quote === 'string' && typeof row.reason === 'string' && row.reason.trim().length >= 8
      && (row.status !== 'unknown' || !!row.quote)
      && !resolveQualityEvidence(text, row.quote).verified;
  });
}

export function readerGoalQuoteRepairPrompt(goals: unknown, keys: ReaderGoalKey[], text: string) {
  return {
    systemPrompt: '只修复阅读倾向评审的引文定位。保留原status、reason及所有真实问题，不重新评分，不改正文。原文不能支持原判断时返回空编号，保持未评估。',
    prompt: '原判断：' + JSON.stringify(goals) + '\n待修复项：' + JSON.stringify(keys)
      + '\n当前正文原文段落：' + JSON.stringify(causalEvidenceAnchors(text, {}))
      + '\n只输出JSON:{"repairs":[{"key":"待修复项名称","anchorId":"body:p编号"}]}。每个待修复项恰好一次；选择能直接支持原reason的原文段落编号，不改述引文，不引用章纲或规则；没有支持段落时anchorId为空。',
  };
}

export function applyReaderGoalQuoteRepairs(goals: ReaderGoalReview, keys: ReaderGoalKey[], value: any, text: string): ReaderGoalReview {
  const rows = value?.repairs;
  if (!Array.isArray(rows) || rows.length !== keys.length
    || new Set(rows.map(row => row?.key)).size !== keys.length
    || rows.some(row => !keys.includes(row?.key))) return goals;
  const anchors = new Map(causalEvidenceAnchors(text, {}).map(row => [row.id, row.text]));
  if (rows.some(row => typeof row.anchorId !== 'string' || !anchors.has(row.anchorId))) return goals;
  const repaired = {...goals};
  for (const row of rows) repaired[row.key as ReaderGoalKey] = {...goals[row.key as ReaderGoalKey], quote: anchors.get(row.anchorId)!};
  return repaired;
}
