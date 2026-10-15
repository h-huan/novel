import { resolveQualityEvidence } from './quality-issue';
import { STORY_CAUSAL_REVIEW_POLICY } from '../../../shared/src/system-workflow-rules.registry';

export function causalAuditRepairPrompt(audit: unknown, errors: string[], content: string, sources: Record<string, string>, includePolicy = true, stateContract = false) {
  const targets=causalAuditRepairTargets(audit,errors);
  return {
    systemPrompt: (targets.length ? '只修复因果审查的引用合同，' : stateContract ? '你是独立因果反证核查员。先从完整章纲提取行动前状态，再核对行动如何改变该状态，禁止从结果倒推条件已经具备。' : '独立审查行动与已声称结果是否成立，核对同一引文内的完整先后顺序、必要前提与对手原有能力；前提字段重复结果或结局目标不能充当实际机制证据。') + '保留真实缺口，不改正文、不改分数。选择原文段落编号，系统提取原文，禁止重写引文。supported必须填写有效的bridgeAnchorId，gap及planned允许为空。planned仅适用于原文明示的未来安排或线索埋设，不得用来豁免已声称兑现的实际结果。自己取出并保管物件的直接结果，可以选择实际交代其支配和保管状态的同一段作为桥接编号；不必虚构额外条件。涉及他人决定、权限、传播或时间的结果，仍须证明对应条件，不能用结果本身证明。',
    prompt: `${includePolicy ? STORY_CAUSAL_REVIEW_POLICY : "按已注入QLT-003必要因果判据执行。"}\n原因果账目：${JSON.stringify(audit)}\n校验错误：${errors.join('；')}\n可选原文段落：${JSON.stringify(causalEvidenceAnchorOptions(content,sources))}\n${targets.length ? `本次仅纠正编号${JSON.stringify(targets)}（从0开始），其它已验证行不能重审、增删或改结论。返回JSON:{"repairs":[{"index":"点名编号", "actionAnchorId":"body段落编号","resultAnchorId":"body段落编号","bridgeAnchorId":"成立条件编号；gap可为空","status":"supported|gap|planned","reason":"至少8字实际依据"}]}。` : '只输出JSON:{"causalAudit":{"status":"evaluated|not_applicable","reason":"至少8字说明","transitions":[{"actionAnchorId":"body段落编号","resultAnchorId":"body段落编号","bridgeAnchorId":"成立条件所在编号；gap可为空","status":"supported|gap|planned","reason":"至少8字说明"}]}}。'}核对输入中全部实际决定处境的关键行动结果；不因项数截掉必要结果，也不为凑项数补普通动作。编号必须从上表逐字选择；不适用须有实际理由；无成立条件时保留gap，不能用计划、主角希望或旁白结论证明已发生的结果。`,
  };
}

export function causalEvidenceAnchors(content: string, sources: Record<string,string>): Array<{id:string;source:string;text:string;path?:string}> {
  return Object.entries({body:content,...sources}).flatMap(([source,text])=> {
    const raw = String(text || '');
    const paragraphs = raw.split(/\n\s*\n/).map((text,index)=>({id:`${source}:p${index+1}`,source,text:text.trim()})).filter(x=>x.text);
    if (!/^[\s]*[\[{]/.test(raw)) return paragraphs;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return paragraphs; }
    const paths: string[] = [];
    const collect = (value: unknown, fieldPath: string) => {
      if (typeof value === 'string') {
        if (JSON.stringify(value).slice(1, -1).trim()) paths.push(fieldPath);
      } else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) collect(child, fieldPath ? `${fieldPath}.${key}` : key);
      }
    };
    collect(parsed, '');
    // Keep exact serialized string values as smaller addresses; never decode or rewrite quotations.
    const values = [...raw.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
      .filter(match => !/^\s*:/.test(raw.slice(match.index! + match[0].length)) && match[1].trim())
      .map((match,index)=>({id:`${source}:v${index+1}`,source,text:match[1],path:paths[index]}));
    // Keep the old IDs stable, but offer exact clauses so one broad quotation
    // cannot stand in for several different outcome proofs.
    const clauses = values.flatMap(value => {
      const parts = value.text.match(/[^。！？；]+[。！？；]?/g)?.filter(text => text.replace(/[\s\\“”"‘’]/g, '').length) || [];
      return parts.length > 1 ? parts.map((text, index) => ({
        id: `${value.id}:c${index + 1}`, source, text, path: value.path,
      })) : [];
    });
    return [...paragraphs, ...values, ...clauses];
  });
}

/** Structured fields already cover the source; omit duplicate whole JSON paragraphs from model input. */
export function causalEvidenceAnchorOptions(content: string, sources: Record<string, string>) {
  const anchors = causalEvidenceAnchors(content, sources);
  const structuredSources = new Set(anchors.filter(anchor => /:v\d+$/.test(anchor.id)).map(anchor => anchor.source));
  return anchors.filter(anchor => !structuredSources.has(anchor.source) || !/:p\d+$/.test(anchor.id));
}

/** A frozen exit field owns its result inventory; the reviewer cannot choose a sample. */
export function causalExitResultAnchors(anchors: ReturnType<typeof causalEvidenceAnchors>, exitState: unknown) {
  if (typeof exitState !== 'string') return [];
  const encoded = JSON.stringify(exitState).slice(1, -1);
  const parent = anchors.find(anchor => anchor.source === 'body' && anchor.text === encoded);
  if (!parent) return [];
  const clauses = anchors.filter(anchor => anchor.id.startsWith(parent.id + ':c'));
  return clauses.length ? clauses : [parent];
}

/** The server owns the complete result inventory, including scene outcomes and
 * payoff/state fields that can disagree with characterActions.result. */
export function causalChapterResultAnchors(anchors: ReturnType<typeof causalEvidenceAnchors>, chapterIndex: number) {
  const prefix = chapterIndex + '.';
  const resultPath = /^(?:scenes\.\d+\.outcome|characterActions\.\d+\.result|conflicts\.\d+\.resolution|highlights\.\d+\.point|characterStates\.\d+\.stateAfter|foreshadowingRecover\.\d+\.(?:method|payoff))$/;
  const parents = anchors.filter(anchor => anchor.source === 'body' && !anchor.id.includes(':c')
    && anchor.path?.startsWith(prefix) && resultPath.test(anchor.path.slice(prefix.length)));
  return parents.flatMap(parent => {
    const clauses = anchors.filter(anchor => anchor.id.startsWith(parent.id + ':c'));
    return clauses.length ? clauses : [parent];
  });
}

/** IDs resolve to exact source paragraphs; no fuzzy quote correction or invented bridge. */
export function materializeCausalAuditAnchors(value: any, content: string, sources: Record<string,string>) {
  if (!value || !Array.isArray(value.transitions)) return value;
  const anchors=new Map(causalEvidenceAnchors(content,sources).map(x=>[x.id,x]));
  return {...value,transitions:value.transitions.map((row:any)=>{
    if(!['actionAnchorId','resultAnchorId','bridgeAnchorId'].some(key=>Object.prototype.hasOwnProperty.call(row,key)))return row;
    const action=anchors.get(row?.actionAnchorId);
    const result=anchors.get(row?.resultAnchorId);
    const bridge=anchors.get(row?.bridgeAnchorId);
    const before=anchors.get(row?.beforeStateAnchorId);
    return {...row,actionEvidence:action?.source==='body'?action.text:'',resultEvidence:result?.source==='body'?result.text:'',
      ...(Object.prototype.hasOwnProperty.call(row,'beforeStateAnchorId') ? {beforeStateEvidence:before?.source==='body'?before.text:''} : {}),
      bridgeEvidence:bridge?.text||'',basisSource:bridge?.source||'body'};
  })};
}

/** Reuse a verified quotation when an independent check agrees on the same
 * action, prior state and result, but omits its bridge address. Never change
 * a new gap or borrow evidence from a different causal pair. */
export function preserveCausalCountercheckAnchors(original: any, value: any, content: string, sources: Record<string, string>) {
  if (!Array.isArray(value?.transitions)) return value;
  return {...value, transitions: value.transitions.map((row: any) => {
    if (row?.status !== 'supported' || row.bridgeAnchorId) return row;
    const prior = original?.transitions?.find((old: any) => old.status === 'supported'
      && ['chapterNumber', 'actionAnchorId', 'resultAnchorId', 'beforeStateAnchorId'].every(key =>
        row[key] !== undefined && row[key] === old[key]));
    if (!prior?.bridgeAnchorId || !validateCausalAudit({status: 'evaluated', reason: '继承同一因果关系已核验引文',
      transitions: [prior]}, content, sources).verified) return row;
    return {...row, bridgeAnchorId: prior.bridgeAnchorId};
  })};
}

/** Validate the reviewer's action/result ledger, not the truth of its literary judgement. */
export function validateCausalAudit(value: any, content: string, sources: Record<string, string>) {
  const errors: string[] = [];
  const issues: any[] = [];
  if (!value || !['evaluated', 'not_applicable'].includes(value.status)
    || typeof value.reason !== 'string' || value.reason.trim().length < 8 || !Array.isArray(value.transitions)) {
    return { verified: false, errors: ['必要因果审查未返回完整结论与行动结果账目'], issues };
  }
  if (value.status === 'not_applicable') {
    if (value.transitions.length) errors.push('不适用结论不能同时包含已评行动结果');
    return { verified: errors.length === 0, errors, issues };
  }
  if (!value.transitions.length) errors.push('已评因果结论缺少关键行动与结果证据');
  value.transitions.forEach((row: any, index: number) => {
    const action = resolveQualityEvidence(content, row?.actionEvidence);
    const result = resolveQualityEvidence(content, row?.resultEvidence);
    const source = row?.basisSource === 'body' ? content : sources[row?.basisSource];
    const bridge = resolveQualityEvidence(source || '', row?.bridgeEvidence);
    if (!action.verified || !result.verified || !['supported', 'gap', 'planned'].includes(row?.status)
      || typeof row?.reason !== 'string' || row.reason.trim().length < 8
      || (row.status === 'supported' && !bridge.verified)) {
      errors.push(`第${index + 1}项因果审查缺少可验证行动、结果或成立条件`);
      return;
    }
    if (row.status === 'gap') issues.push({
      issueType: 'causality_gap', severity: 'high', title: '关键行动与结果缺少成立条件',
      summary: row.reason, evidence: result.quote, evidenceKind: 'causal_gap',
      basisSource: 'body', basisEvidence: action.quote, basisReason: row.reason,
      suggestion: '先核对上游设定和章纲，补足真正决定结果的条件或收回过度断言；不要用旁白总结、重复动作或临时新规则圆回。',
      tags: ['causality_gap'],
    });
  });
  return { verified: errors.length === 0, errors, issues };
}

export function causalAuditRepairTargets(audit:any,errors:string[]) {
 if(!Array.isArray(audit?.transitions))return [];
 const targets=[...new Set(errors.flatMap(error=>{const match=error.match(/^第(\d+)项因果审查/);return match?[Number(match[1])-1]:[]}))];
 return targets.filter(index=>index>=0&&index<audit.transitions.length);
}
export function applyCausalAuditRepair(original:any,errors:string[],value:any) {
 const targets=causalAuditRepairTargets(original,errors);
 if(!targets.length)return value?.causalAudit;
 const rows=Array.isArray(value?.repairs)?value.repairs:Array.isArray(value?.causalAudit?.transitions)&&value.causalAudit.transitions.length===original.transitions.length?targets.map(index=>({index,...value.causalAudit.transitions[index]})):undefined;
 const normalized=Array.isArray(rows)?rows.map(row=>({...row,index:typeof row?.index==='string'&&/^(0|[1-9]\d*)$/.test(row.index)?Number(row.index):row?.index})):rows;
 if(!Array.isArray(normalized)||normalized.length!==targets.length||new Set(normalized.map(row=>row?.index)).size!==targets.length||normalized.some(row=>!targets.includes(row?.index)))throw new Error('因果协议纠错必须完整覆盖点名行，不能重审或增删已验证行');
 return {...original,transitions:original.transitions.map((row:any,index:number)=>{
   const fixed=normalized.find(item=>item.index===index);
   if(!fixed)return row;
   if(row.chapterNumber!==undefined&&fixed.chapterNumber!==undefined&&fixed.chapterNumber!==row.chapterNumber)throw new Error('因果协议纠错不能改变点名行章号');
   return {...fixed,...(row.chapterNumber!==undefined?{chapterNumber:row.chapterNumber}:{})};
 })};
}
