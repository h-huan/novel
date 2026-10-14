import { UPSTREAM_REPAIR_ROUTING_LIMITS, UPSTREAM_REPAIR_ROUTING_POLICY } from '../../shared/src/system-workflow-rules.registry';
import { repairIssueFamily } from './adaptive-repair';
import { causalEvidenceAnchors } from '../modules/writing-quality/causal-review';
const family = (issue: string) => /对白|对话占比|dialogueRatio/i.test(issue) ? 'platform_dialogue'
  : /开篇|钩子|openingHook/i.test(issue) ? 'reading_promise' : repairIssueFamily(issue);
export function upstreamRepairTrigger(history: readonly (readonly string[])[], current: readonly string[], progressConfirmed = false): string | null {
  if (!current.length || !history.length) return null;
  const previous = history.at(-1)!;
  if (new Set(current).size > new Set(previous).size) return '问题集合增长';
  const oldFamilies = new Set(history.flatMap(issues => issues.map(family)));
  if (!progressConfirmed && history.length >= UPSTREAM_REPAIR_ROUTING_LIMITS.sameFamilyAfterAttempts && current.some(issue => oldFamilies.has(family(issue)))) return '同类缺陷修复后仍存在';
  if (history.length >= UPSTREAM_REPAIR_ROUTING_LIMITS.maxLocalAttemptsBeforeDiagnosis) return '连续局部修复';
  return null;
}
export function upstreamDiagnosisInput(body: string, sources: Record<string,string>, issues: string[], trigger: string) {
  const anchors = causalEvidenceAnchors(body,sources);
  const budgets = new Map<string,number>();
  const catalog = anchors.flatMap(a => {
    const remaining=12000-(budgets.get(a.source)||0); if(remaining<=0)return [];
    const text=a.text.slice(0,Math.min(3000,remaining)); budgets.set(a.source,(budgets.get(a.source)||0)+text.length);
    return [{...a,text,complete:text.length===a.text.length}];
  });
  const coverage=Object.keys({body,...sources}).map(source=>({source,complete:anchors.filter(a=>a.source===source).every(a=>catalog.some(c=>c.id===a.id&&c.complete))}));
  return { catalog, prompt: UPSTREAM_REPAIR_ROUTING_POLICY+'\n触发：'+trigger+'\n当前问题：'+JSON.stringify(issues)
    +'\n资料覆盖（截断资料不能证明不存在）：'+JSON.stringify(coverage)+'\n编号目录：'+JSON.stringify(catalog)
    +'\n仅诊断来源，不改小说、不输出补丁。逐项核对outline（章纲合同）、context（实际生成上下文）、execution（当前执行标准）、body（候选正文）、review（本次审查问题）。判断应先检查哪个来源阶段。缺陷由正文偏离一致输入产生时标generation_execution，不把它误称章纲矛盾。JSON:{"status":"evaluated|not_evaluated","findings":[{"stage":"outline_contract|context_assembly|generation_execution|review_contract","anchorIds":["目录编号"],"reason":"至少12字说明来源判断及证据","nextAction":"至少12字说明上游处理动作及其它同类问题检查范围"}]}。每个判断至少引用两个不同来源编号，不确定就not_evaluated；已确认资料互相矛盾须指出双方，不能单凭提示词或词频宣布。最多4项。' };
}
export function validateUpstreamDiagnosis(raw: any, catalog: ReturnType<typeof upstreamDiagnosisInput>['catalog']) {
  const anchors=new Map(catalog.map(a=>[a.id,a]));
  if(raw?.status!=='evaluated'||!Array.isArray(raw.findings)||!raw.findings.length||raw.findings.length>4)return null;
  const allowed=['outline_contract','context_assembly','generation_execution','review_contract'];
  for(const row of raw.findings){
    if(!allowed.includes(row?.stage)||!Array.isArray(row.anchorIds)||row.anchorIds.some((id:any)=>!anchors.has(id))
      ||new Set(row.anchorIds.map((id:string)=>anchors.get(id)!.source)).size<2
      ||typeof row.reason!=='string'||row.reason.trim().length<12||typeof row.nextAction!=='string'||row.nextAction.trim().length<12)return null;
    const sources=new Set(row.anchorIds.map((id:string)=>anchors.get(id)!.source));
    if(row.stage==='outline_contract'&&!sources.has('outline'))return null;
    if(row.stage==='context_assembly'&&!sources.has('context'))return null;
    if(row.stage==='generation_execution'&&(!sources.has('body')||!['outline','execution','context'].some(s=>sources.has(s))))return null;
    if(row.stage==='review_contract'&&!sources.has('review'))return null;
  }
  return {status:'evaluated',findings:raw.findings.map((row:any)=>({...row,evidence:row.anchorIds.map((id:string)=>anchors.get(id))}))};
}
