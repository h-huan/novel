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
