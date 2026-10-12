import { causalEvidenceAnchors, causalEvidenceAnchorOptions } from './causal-review';

/** Repair citations only. Verdicts, scores and issue membership remain immutable. */
export function semanticEvidenceRepairPrompt(issues: any[], invalidIndexes: number[], content: string, sources: Record<string, string>) {
  return {
    systemPrompt: '只纠正已判问题的引用合同，不修改正文、问题结论、严重程度或评分。不能删除问题。选择实际原文段落编号，不能拼接、改写或发明引用。causal_gap的basisAnchorId引用已呈现的行动、位置或必要前提，不是寻找不存在的桥接过程；同段确实同时写出相冲突的动作或状态时，可与evidenceAnchorId选同一段。引用这些原文仅证明缺口，不证明结果已经成立。没有支持原判的证据时填空，保留未完成状态。',
    prompt: `待纠正问题：${JSON.stringify(invalidIndexes.map(index => ({ index, issue: issues[index] })))}\n可选原文：${JSON.stringify(causalEvidenceAnchorOptions(content, sources))}\n输出JSON:{"repairs":[{"index":0,"evidenceAnchorId":"body段落编号","shownAnchorId":"已呈现信息的body编号或空","basisAnchorId":"依据原文编号或空","basisReason":"仅补齐原问题为何由这两处证据支持，不新增问题或事实"}]}。每个待纠正问题恰好一项。只选与原问题说明直接相关的证据；不得用无关段落补足合同。已声明的basisSource必须保留，不能从章纲换成正文来绕过必要前提检查；原响应遗漏basisSource时由所选依据编号确定实际来源，提前揭示仍必须选择chapter_plan。原basisReason非空时保留，只有遗漏时补充原问题的证据关系说明。`,
  };
}

export function applySemanticEvidenceRepairs(issues: any[], invalidIndexes: number[], value: any, content: string, sources: Record<string, string>) {
  const repairs = value?.repairs;
  if (!Array.isArray(repairs) || repairs.length !== invalidIndexes.length) return issues;
  const expected = new Set(invalidIndexes);
  if (new Set(repairs.map(row => row?.index)).size !== repairs.length
    || repairs.some(row => !Number.isInteger(row?.index) || !expected.has(row.index))) return issues;
  const anchors = new Map(causalEvidenceAnchors(content, sources).map(anchor => [anchor.id, anchor]));
  const byIndex = new Map(repairs.map(row => [row.index, row]));
  return issues.map((issue, index) => {
    const row: any = byIndex.get(index);
    if (!row) return issue;
    const evidence = anchors.get(row.evidenceAnchorId);
    const shown = anchors.get(row.shownAnchorId);
    const basis = anchors.get(row.basisAnchorId);
    const basisSource = issue.basisSource || basis?.source;
    return { ...issue,
      evidence: evidence?.source === 'body' ? evidence.text : '',
      shownEvidence: shown?.source === 'body' ? shown.text : '',
      basisSource,
      basisEvidence: basis && basis.source === basisSource ? basis.text : '',
      basisReason: issue.basisReason || (typeof row.basisReason === 'string' ? row.basisReason.trim() : ''),
    };
  });
}
