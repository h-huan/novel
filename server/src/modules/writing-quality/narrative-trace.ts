/** All classifiers are transparent proxy features, never semantic verdicts or AI probabilities. */
const beats: Array<[string, RegExp]> = [
  ['reveal', /发现|原来|真相|看见|得知/], ['conflict', /拒绝|阻止|争执|攻击|拔刀|威胁/],
  ['reaction', /后退|握紧|皱眉|沉默|颤抖|愣住/], ['decision', /决定|选择|转身|答应|动身/],
];
const functions: Array<[string, RegExp]> = [
  ['deception', /骗|谎|绝无此事/], ['avoidance', /别问|不谈|换个话题/], ['probing', /真的|是不是|难道|为何|为什么/],
  ['conflict', /休想|不许|滚|闭嘴|拒绝/], ['emotion', /害怕|高兴|恨|爱|难过/],
  ['smalltalk', /吃了|天气|早安|晚安|你好/], ['information', /因为|所以|首先|其次|说明|告诉你/], ['subtext_candidate', /随你|算了|没什么|你说呢/],
];
function analyze(content: string) {
  const scenes = content.split(/\n\s*\n|\n(?:\*{3,}|—{3,})\n/).filter(s => s.trim());
  const fingerprints = scenes.map(scene => {
    const sequence = ['start'];
    for (const sentence of scene.split(/[。！？\n]/)) for (const [name,re] of beats) if (re.test(sentence) && sequence.at(-1) !== name) sequence.push(name);
    sequence.push(/[？?]\s*$/.test(scene) ? 'question_end' : 'end');
    return { sequence, signature: sequence.join('>'), quote: scene.slice(0,100), enoughSignals: sequence.length >= 5 };
  });
  const dialogue = [...content.matchAll(/[“「]([^”」]+)[”」]/g)];
  const distribution: Record<string, number> = Object.fromEntries([...functions.map(([k]) => [k,0]), ['unknown',0]]);
  for (const m of dialogue) distribution[functions.find(([,re]) => re.test(m[1]))?.[0] || 'unknown']++;
  const units = content.match(/[^。！？\n]+[。！？]?/g) || [];
  let show = 0; let explain = 0;
  for (const unit of units) {
    if (/[“「]|推|握|走|敲|抬|冷|烫|气味|响|粗糙|裂纹|锈|脚步/.test(unit)) show++;
    if (/意味着|说明|总之|显然|毫无疑问|内心|命运|人生|之所以|感到.*因为/.test(unit)) explain++;
  }
  return { fingerprints, dialogueFunction: { total: dialogue.length, distribution, informationRatio: dialogue.length ? distribution.information / dialogue.length : null },
    showExplain: { show, explain, units: units.length, ratio: show + explain ? show / (show + explain) : null } };
}
export function narrativeTrace(content: string, previous: Array<{ id: string; content: string }>) {
  const current = analyze(content); const comparisons = previous.map(p => ({ id: p.id, ...analyze(p.content) }));
  const risks: Array<{ ruleId: string; quote: string; comparisonId?: string; comparisonQuote?: string; reason: string }> = [];
  for (const p of comparisons) {
    if (current.dialogueFunction.total >= 5 && p.dialogueFunction.total >= 5
      && (current.dialogueFunction.informationRatio ?? 0) > 0.7 && (p.dialogueFunction.informationRatio ?? 0) > 0.7) {
      risks.push({ ruleId: 'ai_trace.cross_chapter_dialogue_function_risk', quote: content.match(/[“「][^”」]+[”」]/)?.[0] || '',
        comparisonId: p.id, comparisonQuote: previous.find(v => v.id === p.id)!.content.match(/[“「][^”」]+[”」]/)?.[0], reason: '相邻章节对白持续集中于信息传递候选功能，需语义核验' });
    }
    if (current.showExplain.units >= 5 && p.showExplain.units >= 5 && (current.showExplain.ratio ?? 1) < 0.35 && (p.showExplain.ratio ?? 1) < 0.35) {
      risks.push({ ruleId: 'ai_trace.cross_chapter_show_explain_risk', quote: content.slice(0,100), comparisonId: p.id,
        comparisonQuote: previous.find(v => v.id === p.id)!.content.slice(0,100), reason: '跨章持续以解释信号为主，需核验是否存在合理叙事需要' });
    }
  }
  for (const f of current.fingerprints.filter(f => f.enoughSignals)) {
    for (const p of comparisons) {
      const same = p.fingerprints.find(other => other.enoughSignals && other.signature === f.signature);
      if (same) risks.push({ ruleId: 'ai_trace.scene_structure_homology_risk', quote: f.quote, comparisonId: p.id, comparisonQuote: same.quote, reason: f.signature });
    }
    if (current.fingerprints.filter(other => other.enoughSignals && other.signature === f.signature).length > 1) risks.push({ ruleId: 'ai_trace.scene_structure_homology_risk', quote: f.quote, reason: '跨场景结构重复候选：' + f.signature });
  }
  if (current.dialogueFunction.total >= 5 && (current.dialogueFunction.informationRatio ?? 0) > 0.7) risks.push({ ruleId: 'ai_trace.functional_complete_dialogue_risk', quote: content.match(/[“「][^”」]+[”」]/)?.[0] || '', reason: '对白信息功能候选占比超过70%，需语义确认潜台词与叙事功能' });
  if (current.showExplain.units >= 5 && (current.showExplain.ratio ?? 1) < 0.35) risks.push({ ruleId: 'ai_trace.show_explain_imbalance_risk', quote: content.slice(0,100), reason: '具体呈现信号偏少；解释和呈现可能重叠，非语义结论' });
  return { version: 1, status: 'heuristic_risk_only', ...current, comparisons, risks: risks.slice(0,24) };
}
