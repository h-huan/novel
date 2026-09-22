import { measureAgainstTarget } from '../../chain/platform-benchmarks';
import type { CreativeConstitution } from '../project/creative-constitution';
import { qualityIssue, type QualityIssue, type QualityStage } from './quality-issue';

const PROGRESS_SIGNAL = /(反转|真相|赢|胜|成功|得到|获得|揭开|发现|决定|拒绝|答应|危机|危险|愤怒|哭|笑|震惊|恐惧|绝望|希望|！|!|？|\?)/g;

export function deterministicPlatformReview(input: {
  projectId: string;
  runId: string;
  stage: QualityStage;
  content: string;
  constitution: CreativeConstitution;
}): { issues: QualityIssue[]; measurements: ReturnType<typeof measureAgainstTarget> | null } {
  if (!['chapter', 'refinement'].includes(input.stage) || !input.content.trim()) return { issues: [], measurements: null };
  const target = input.constitution.platformRules;
  const measurements = measureAgainstTarget(input.content, target);
  const quoteAt = (start = 0, length = 60) => input.content.slice(Math.max(0, start), Math.max(0, start) + length).trim();
  const issue = (ruleId: string, message: string, quote: string, severity: string = 'high') => qualityIssue({
    ...input, constitutionRevision: input.constitution.revision, ruleId, message, quote,
    severity, source: 'platform_deterministic_v1',
  });
  const issues: QualityIssue[] = [];
  const byKey = new Map(measurements.rows.map(row => [row.key, row]));
  if (measurements.metrics.words < input.constitution.chapterWordRange.min
    || measurements.metrics.words > input.constitution.chapterWordRange.max) {
    issues.push(issue('platform.chapter_length', `章节 ${measurements.metrics.words} 字，不在创作宪法 ${input.constitution.chapterWordRange.min}-${input.constitution.chapterWordRange.max} 字范围`, quoteAt()));
  }
  for (const key of ['avgParaChars', 'longParaRatio'] as const) {
    const row = byKey.get(key);
    if (row && row.status !== 'ok') issues.push(issue(`platform.${key}`, `${row.label} ${row.value}，目标 ${row.target}`, quoteAt(), row.status === 'bad' ? 'high' : 'medium'));
  }
  const dialogue = byKey.get('dialogueRatio');
  if (dialogue && dialogue.status !== 'ok') issues.push(issue('platform.dialogue_ratio', `${dialogue.label} ${dialogue.value}，目标 ${dialogue.target}`, quoteAt(), dialogue.status === 'bad' ? 'high' : 'medium'));
  const opening = byKey.get('openingHook');
  if (opening?.status === 'bad') issues.push(issue('platform.opening_hook_position', opening.advice, quoteAt(0, target.openingHookChars), 'high'));
  const ending = byKey.get('endingHook');
  if (ending && ending.status !== 'ok') issues.push(issue('platform.ending_hook', ending.advice, quoteAt(Math.max(0, input.content.length - 100)), 'high'));

  // This is deliberately a proxy risk: markers locate candidate payoff/emotion beats;
  // the semantic judge decides whether they are real, earned and useful.
  const positions = [...input.content.matchAll(PROGRESS_SIGNAL)].map(match => match.index ?? 0);
  const boundaries = [0, ...positions, input.content.length];
  let maxGap = 0; let gapStart = 0;
  for (let index = 1; index < boundaries.length; index += 1) {
    const gap = boundaries[index] - boundaries[index - 1];
    if (gap > maxGap) { maxGap = gap; gapStart = boundaries[index - 1]; }
  }
  if (maxGap > target.payoffGapChars[1]) issues.push(issue(
    'platform.payoff_emotion_gap_risk',
    `连续约 ${maxGap} 字未检测到推进/爽点/情绪候选信号；这是确定性风险标记，需语义评审确认`,
    quoteAt(gapStart, Math.min(100, maxGap)), 'medium',
  ));
  return { issues, measurements };
}

/**
 * 确定性平台问题（platform.*）→ 落库用的质检标签。
 * 同一份 measurement 在生成侧 Gate 与质检侧共用，这里只做词汇映射，保证
 * "不符合目标平台"在所有书、所有章都能逐条定向精修，并被 LESSON_BY_TYPE 沉淀成跨章教训。
 */
export const PLATFORM_ISSUE_TAGS: Record<string, string> = {
  'platform.chapter_length': 'platform_chapter_length',
  'platform.avgParaChars': 'platform_paragraph_length',
  'platform.longParaRatio': 'platform_paragraph_length',
  'platform.dialogue_ratio': 'platform_dialogue_ratio',
  'platform.opening_hook_position': 'platform_opening_hook',
  'platform.ending_hook': 'platform_ending_hook',
  'platform.payoff_emotion_gap_risk': 'platform_payoff_gap',
};

const PLATFORM_ISSUE_TITLES: Record<string, string> = {
  platform_chapter_length: '单章字数不符合目标平台篇幅',
  platform_paragraph_length: '段落长度不符合目标平台阅读节奏',
  platform_dialogue_ratio: '对话占比偏离目标平台区间',
  platform_opening_hook: '开篇钩子位置不符合目标平台要求',
  platform_ending_hook: '章尾留钩不符合目标平台要求',
  platform_payoff_gap: '推进/爽点间隔超出目标平台密度',
};

const PLATFORM_ISSUE_SUGGESTIONS: Record<string, string> = {
  platform_chapter_length: '按目标平台单章字数区间增删：补足有效情节或压缩冗余铺陈，不改变本章大纲契约。',
  platform_paragraph_length: '拆长短段：单段不超过平台上限，长段之间插入短句或对话，避免大段密排。',
  platform_dialogue_ratio: '提高对话密度：把说明性叙述改成人物之间的一来一回，加入打断、沉默与动作，使对话占比进入平台区间。',
  platform_opening_hook: '重写开篇：前几百字直接落在冲突/反常/强悬念上，删掉环境与履历铺垫。',
  platform_ending_hook: '重写章尾：落在未解问题、反转、新威胁或关键动作/对话上，不要平淡收尾。',
  platform_payoff_gap: '在长间隔中补有效推进或情绪兑现（反转、进展、对手反应、关键抉择），缩短无推进段落。',
};

export interface PlatformQualityRow {
  issueType: string;
  severity: string;
  title: string;
  summary: string;
  evidence: string;
  suggestion: string;
  tags: string[];
}

/** 把 deterministicPlatformReview 的发现映射成 writing_quality_issues 可直接入库的问题行。 */
export function platformReviewToRows(review: { issues: QualityIssue[] }): PlatformQualityRow[] {
  const rows: PlatformQualityRow[] = [];
  for (const issue of review.issues) {
    const issueType = PLATFORM_ISSUE_TAGS[issue.ruleId];
    if (!issueType) continue;
    rows.push({
      issueType,
      severity: issue.severity,
      title: PLATFORM_ISSUE_TITLES[issueType] || issue.message,
      summary: issue.message,
      evidence: issue.evidence.quote || issue.message,
      suggestion: PLATFORM_ISSUE_SUGGESTIONS[issueType] || '按目标平台指标调整本章写法，只改叙述方式与节奏，不改剧情事实。',
      tags: [issueType],
    });
  }
  return rows;
}
