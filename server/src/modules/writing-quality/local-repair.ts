import { SCORE_DIMENSIONS, type StageScore } from './stage-score';
import { qualityGate } from './quality-issue';

export function applyLocalPatches(content: string, raw: unknown, structured = false): string {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) throw new Error('局部修复需要1至8处明确替换');
  const ranges: Array<{ start: number; end: number; replacement: string }> = [];
  for (const patch of raw) {
    if (typeof patch?.original !== 'string' || !patch.original || typeof patch.replacement !== 'string') throw new Error('局部修复格式无效');
    const start = content.indexOf(patch.original);
    if (start < 0 || content.indexOf(patch.original, start + 1) >= 0) throw new Error('修复原文缺失或匹配不唯一');
    ranges.push({ start, end: start + patch.original.length, replacement: patch.replacement });
  }
  ranges.sort((a, b) => a.start - b.start);
  if (ranges.some((r, i) => i > 0 && r.start < ranges[i - 1].end)) throw new Error('修复片段重叠');
  const touched = ranges.reduce((sum, r) => sum + Math.max(r.end - r.start, r.replacement.length), 0);
  if (touched > content.length * 0.3) throw new Error('局部修复范围超过全文30%，需人工处理');
  let result = content;
  for (const r of ranges.reverse()) result = result.slice(0, r.start) + r.replacement + result.slice(r.end);
  if (!result.trim()) throw new Error('修复后内容为空');
  if (structured) JSON.parse(result);
  return result;
}

export function compareRepair(before: StageScore, after: StageScore): { accepted: boolean; reason: string } {
  if (before.status !== 'evaluated' || !qualityGate(after.issues, after.status === 'evaluated').passed) return { accepted: false, reason: '复检未通过或评估证据不足' };
  if (SCORE_DIMENSIONS.some(k => before.dimensions[k].score !== null && (after.dimensions[k].score === null || after.dimensions[k].score! < before.dimensions[k].score!))) {
    return { accepted: false, reason: '至少一个已评估维度退步，回滚' };
  }
  const beforeRules = new Set(before.issues.map(i => i.ruleId));
  if (after.issues.some(i => !beforeRules.has(i.ruleId) && ['blocking', 'high'].includes(i.severity))) return { accepted: false, reason: '引入新的严重问题，回滚' };
  const improved = after.overallScore! > before.overallScore! || after.issues.length < before.issues.length;
  return { accepted: improved, reason: improved ? '复检通过，维度无退步且问题减少或评分提高' : '未证明改善，回滚' };
}
