import { SCORE_DIMENSIONS, type StageScore } from './stage-score';
import { qualityGate } from './quality-issue';

export interface AnchoredPatchSelection {
  patches: Array<{ original: string; replacement: string }>;
  rejected: Array<{ index: number; reason: string }>;
}

/** Prompt 与执行器共享预算计算口径，字符数含标点和换行。 */
export function localPatchBudgetDirective(content: string, maxRatio: number, maxPatches: number): string {
  return '本轮正文共'+content.length+'字符（含标点和换行），合计改动预算最多'+Math.floor(content.length*maxRatio)+'字符，最多'+maxPatches+'处。每处按原文覆盖长度与replacement长度的较大值计费，再把各处相加；整段删除还计入被删除的相邻空行。输出前自行核算，超预算片段不纳入本批，保留待修问题。';
}

/** An exact whole-paragraph deletion owns its adjacent separator, too. */
function anchoredPatchRange(content: string, start: number, original: string, replacement: string, structured = false) {
  let end = start + original.length;
  if (!structured && replacement === '') {
    const prefix = content.slice(0, start);
    const preceding = prefix.match(/\r?\n(?:[ \t]*\r?\n)+$/);
    if (start === 0 || preceding) {
      const following = content.slice(end).match(/^\r?\n(?:[ \t]*\r?\n)+/);
      if (following) end += following[0].length;
      else if (end === content.length && preceding) start -= preceding[0].length;
    }
  }
  return { start, end };
}

/** Keep exact, unique, nonoverlapping patches within one local-change budget. */
export function selectAnchoredLocalPatchBatch(content: string, raw: unknown, maxRatio = 0.2): AnchoredPatchSelection {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) throw new Error('局部修复需要1至8处明确替换');
  const patches: AnchoredPatchSelection['patches'] = [];
  const rejected: AnchoredPatchSelection['rejected'] = [];
  const ranges: Array<{ start: number; end: number }> = [];
  let touched = 0;
  for (const [index, patch] of raw.entries()) {
    if (typeof patch?.original !== 'string' || !patch.original || typeof patch.replacement !== 'string') {
      rejected.push({ index, reason: '格式无效' });
      continue;
    }
    const start = content.indexOf(patch.original);
    if (start < 0 || content.indexOf(patch.original, start + 1) >= 0) {
      rejected.push({ index, reason: '原文缺失或匹配不唯一' });
      continue;
    }
    const range = anchoredPatchRange(content, start, patch.original, patch.replacement);
    if (ranges.some(other => range.start < other.end && range.end > other.start)) {
      rejected.push({ index, reason: '与已选片段重叠' });
      continue;
    }
    const cost = Math.max(range.end - range.start, patch.replacement.length);
    if (touched + cost > content.length * maxRatio) {
      rejected.push({ index, reason: '超出本批改动预算' });
      continue;
    }
    patches.push({ original: patch.original, replacement: patch.replacement });
    ranges.push(range);
    touched += cost;
  }
  return { patches, rejected };
}

export function applyLocalPatches(content: string, raw: unknown, structured = false, maxRatio = 0.3): string {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) throw new Error('局部修复需要1至8处明确替换');
  const ranges: Array<{ start: number; end: number; replacement: string }> = [];
  for (const patch of raw) {
    if (typeof patch?.original !== 'string' || !patch.original || typeof patch.replacement !== 'string') throw new Error('局部修复格式无效');
    const start = content.indexOf(patch.original);
    if (start < 0 || content.indexOf(patch.original, start + 1) >= 0) throw new Error('修复原文缺失或匹配不唯一');
    ranges.push({ ...anchoredPatchRange(content, start, patch.original, patch.replacement, structured), replacement: patch.replacement });
  }
  ranges.sort((a, b) => a.start - b.start);
  if (ranges.some((r, i) => i > 0 && r.start < ranges[i - 1].end)) throw new Error('修复片段重叠');
  const touched = ranges.reduce((sum, r) => sum + Math.max(r.end - r.start, r.replacement.length), 0);
  if (touched > content.length * maxRatio) throw new Error(`局部修复范围超过全文${Math.round(maxRatio * 100)}%，需人工处理`);
  let result = content;
  for (const r of ranges.reverse()) result = result.slice(0, r.start) + r.replacement + result.slice(r.end);
  if (!result.trim()) throw new Error('修复后内容为空');
  if (structured) JSON.parse(result);
  return result;
}

/** Distinguish the rejected candidate's actual review from the retained original's defects. */
export function repairRejectionDetails(after: StageScore | null, reason: string): string {
  const blocking=after?.issues.filter(issue=>issue.status==='open'&&issue.severity==='blocking').map(issue=>`${issue.ruleId}：${issue.message}`)||[];
  const missing=after?Object.entries(after.dimensions).filter(([,value])=>['not_evaluated','missing_standard'].includes(value.status)).map(([key,value])=>`${key}：${value.reason}`):[];
  return '【修复候选未采用】原稿保留，未保存候选。回滚原因：'+reason
    +(blocking.length?'；候选复检阻断：'+blocking.join('；'):'')
    +(missing.length?'；候选未验证维度：'+missing.join('；'):'');
}

export function compareRepair(before: StageScore, after: StageScore): { accepted: boolean; reason: string } {
  if (!qualityGate(after.issues, after.status === 'evaluated').passed) return { accepted: false, reason: '复检未通过或评估证据不足' };
  const issueKey = (issue: StageScore['issues'][number]) => `${issue.ruleId}:${issue.entityId || ''}`;
  const beforeSevereIssues = before.issues.filter(i => i.status === 'open' && i.evaluation === 'evidenced' && ['blocking', 'high'].includes(i.severity));
  const afterSevereIssues = after.issues.filter(i => i.status === 'open' && i.evaluation === 'evidenced' && ['blocking', 'high'].includes(i.severity));
  const beforeSevereKeys = new Set(beforeSevereIssues.map(issueKey));
  if (afterSevereIssues.some(i => !beforeSevereKeys.has(issueKey(i)))) {
    return { accepted: false, reason: '引入新的有证据严重问题，回滚' };
  }

  // Judge scores fluctuate slightly even when the cited defect is gone. Keep
  // hard floors and material regressions, but do not roll back a verified fix
  // because one otherwise healthy dimension moved by a few points.
  const materialRegression = SCORE_DIMENSIONS.find(key => {
    const beforeScore = before.dimensions[key].score;
    const afterScore = after.dimensions[key].score;
    if (beforeScore === null) return false;
    if (afterScore === null) return true;
    const floor = after.policy?.floors?.[key] ?? before.policy?.floors?.[key] ?? 60;
    return (beforeScore >= floor && afterScore < floor) || beforeScore - afterScore > 8;
  });
  if (materialRegression) return { accepted: false, reason: `${materialRegression}维度跌破质量下限或出现显著退步，回滚` };

  const beforeSevere = beforeSevereIssues.length;
  const afterSevere = afterSevereIssues.length;
  const scoreImproved = before.overallScore !== null && after.overallScore !== null && after.overallScore > before.overallScore;
  const beforeBlocking = beforeSevereIssues.filter(issue => issue.severity === 'blocking').length;
  const afterBlocking = afterSevereIssues.filter(issue => issue.severity === 'blocking').length;
  const improved = scoreImproved || afterBlocking < beforeBlocking || afterSevere < beforeSevere || after.issues.length < before.issues.length;
  return { accepted: improved, reason: improved ? '复检通过，阻断或严重问题减少且关键质量下限保持' : '未证明改善，回滚' };
}
