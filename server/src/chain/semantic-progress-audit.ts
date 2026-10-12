import { TEMPORAL_FACT_CONTINUITY_POLICY } from '../../shared/src/system-workflow-rules.registry';
import { causalEvidenceAnchors } from '../modules/writing-quality/causal-review';

export function semanticProgressAuditPrompt(beforeContent: string, afterContent: string, beforeIssues: string[], afterIssues: string[], includePolicy = true) {
  const anchors = causalEvidenceAnchors('', { before: beforeContent, after: afterContent });
  return `时间约束复核规则：${includePolicy ? TEMPORAL_FACT_CONTINUITY_POLICY : "按已注入CTX-008时间判据执行。"}\n判断有限补丁是否真正修复缺陷且没有引入新缺陷，不评分、不改稿、不把评审条数减少当作没有新问题。\n原问题：${JSON.stringify(beforeIssues.map((issue,index)=>({id:index,issue})))}\n待核剩余问题：${JSON.stringify(afterIssues.map((issue,index)=>({id:index,issue})))}\n改前/改后全文段落：${JSON.stringify(anchors)}\n逐项判断剩余问题是原稿已经存在的existing、由改动引入的introduced，还是unverified。考虑相邻段落、因果前提和否定词改变，不能只看引用的一句仍在。缺少事件也必须核对改前是否同样缺少，不因为评审第一次提到就当新问题。existing必须分别选改前和改后能证实该缺陷的段落编号，说明同一缺陷为何在原稿已经成立。另列真正已完整修复的原问题，不能把评审漏提当作解决；复合问题只修一部分不算完整修复。只输出JSON:{"findings":[{"id":0,"status":"existing|introduced|unverified","beforeAnchorId":"before:p1","afterAnchorId":"after:p1","reason":"至少12字的具体判断"}],"resolved":[{"beforeIssueId":0,"beforeAnchorId":"before:p1","afterAnchorId":"after:p1","reason":"原先缺陷与改后完整解决的具体证据至少12字"}]}。findings必须覆盖全部剩余问题且不重复编号，不确定时unverified；resolved可为空，不得虚构进展。禁止虚构编号、自动沿用前次结论或宣称正文已合格。`;
}

/** This authorizes another bounded patch, never Canon or a quality PASS. */
export function validateSemanticProgressAudit(value: any, beforeContent: string, afterContent: string, count: number, requiredResolvedFromCount = 0) {
  const anchors=new Map(causalEvidenceAnchors('', { before:beforeContent, after:afterContent }).map(x=>[x.id,x]));
  if (!Array.isArray(value?.findings) || value.findings.length!==count) return false;
  const seen=new Set<number>();
  for(const finding of value.findings) {
    if(!Number.isInteger(finding?.id) || finding.id<0 || finding.id>=count || seen.has(finding.id)
      || finding.status!=='existing' || typeof finding.reason!=='string' || finding.reason.trim().length<12
      || anchors.get(finding.beforeAnchorId)?.source!=='before' || anchors.get(finding.afterAnchorId)?.source!=='after') return false;
    seen.add(finding.id);
  }
  if (requiredResolvedFromCount > 0) {
    if (!Array.isArray(value.resolved) || !value.resolved.length) return false;
    const resolved = new Set<number>();
    for (const finding of value.resolved) {
      if (!Number.isInteger(finding?.beforeIssueId) || finding.beforeIssueId < 0
        || finding.beforeIssueId >= requiredResolvedFromCount || resolved.has(finding.beforeIssueId)
        || typeof finding.reason !== 'string' || finding.reason.trim().length < 12
        || anchors.get(finding.beforeAnchorId)?.source !== 'before'
        || anchors.get(finding.afterAnchorId)?.source !== 'after') return false;
      resolved.add(finding.beforeIssueId);
    }
  }
  return seen.size===count;
}
