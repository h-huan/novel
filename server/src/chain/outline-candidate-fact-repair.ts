export const OUTLINE_FACT_REPAIR_LIMITS = Object.freeze({ maxPatches: 32, maxChangedRatio: 0.15 });

/** Only pending, server-selected outline fields can be repaired before persistence. */
export function applyOutlineCandidateFactPatches<T extends { order: number; content: string; scenes: string }>(
  candidates: T[], value: unknown,
): T[] {
  const patches = (value as any)?.patches;
  if (!Array.isArray(patches) || patches.length === 0 || patches.length > OUTLINE_FACT_REPAIR_LIMITS.maxPatches)
    throw new Error(`候选事实修复须为1—${OUTLINE_FACT_REPAIR_LIMITS.maxPatches}项局部替换`);
  const result = candidates.map(c => ({ ...c }));
  const shape = (v: any): any => Array.isArray(v) ? v.map(shape)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, shape(v[k])])) : typeof v;
  const beforeScenes = new Map(candidates.map(c => [c.order, JSON.parse(c.scenes)]));
  const changed = new Map<number, number>();
  for (const p of patches) {
    const chapter = result.find(c => c.order + 1 === p?.chapterNumber);
    if (!chapter || !['content', 'scenes'].includes(p.field) || typeof p.match !== 'string' || !p.match
      || typeof p.replacement !== 'string' || !p.replacement.trim() || p.match === p.replacement) throw new Error('候选事实修复字段、章节或替换无效');
    const field = p.field as 'content' | 'scenes';
    const text = chapter[field];
    const at = text.indexOf(p.match);
    if (at < 0 || text.indexOf(p.match, at + 1) >= 0) throw new Error('事实修复原文必须唯一匹配候选字段');
    chapter[field] = text.slice(0, at) + p.replacement + text.slice(at + p.match.length);
    changed.set(chapter.order, (changed.get(chapter.order) || 0) + p.match.length + p.replacement.length);
  }
  for (const chapter of result) {
    const before = candidates.find(c => c.order === chapter.order)!;
    if ((changed.get(chapter.order) || 0) > (before.content.length + before.scenes.length) * OUTLINE_FACT_REPAIR_LIMITS.maxChangedRatio)
      throw new Error(`候选事实修复超出${OUTLINE_FACT_REPAIR_LIMITS.maxChangedRatio * 100}%局部预算`);
    const parsed = JSON.parse(chapter.scenes);
    if (JSON.stringify(shape(parsed)) !== JSON.stringify(shape(beforeScenes.get(chapter.order)))) throw new Error('事实修复不能改变章纲结构');
    if (parsed.wordCountReason !== beforeScenes.get(chapter.order).wordCountReason) throw new Error('事实修复不能改篇幅依据');
  }
  return result;
}

/** Before paying for the final independent ledger review, verify that the
 * existing patch actually touches a quoted contradictory claim. This is a
 * transport/target check, NOT a semantic pass and does not infer a correction.
 * If the reviewer did not quote a uniquely identifiable existing phrase,
 * the original independent fact Gate remains the authority. */
export function outlineCandidateFactRepairTargetIssues<T extends {order:number;content:string;scenes:string}>(
 before:readonly T[], after:readonly T[], contradictions:readonly unknown[],
):string[] {
 const afterByOrder=new Map(after.map(chapter=>[chapter.order,chapter]));
 const issues:string[]=[];
 for(const item of contradictions){
   let evidence:Record<string,unknown>|null=null;
   if(typeof item==='string'){
     try { const parsed=JSON.parse(item);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))evidence=parsed; }
     catch { /* Natural-language evidence is still checked by the original semantic Gate. */ }
   }else if(item&&typeof item==='object'&&!Array.isArray(item))evidence=item as Record<string,unknown>;
   const conflict=String(evidence?.conflict||'');
   // The reviewer is explicitly contrasting source phrases here. Do not
   // deduce edits from broad quote1/quote2 full-chapter payloads.
   const quoted=[...conflict.matchAll(/[“「]([^”」]{6,160})[”」]/gu)].map(m=>m[1]);
   const targets=quoted.flatMap(quote=>before.flatMap(chapter=>
     (['content','scenes'] as const).filter(field=>chapter[field].includes(quote))
       .map(field=>({quote,chapter,field}))));
   if(!targets.length)continue;
   // Replacing the exact assertion (in at least one cited location) is a
   // minimum prerequisite. Any remaining contradictory projections are still
   // examined by the existing full fact-review Gate.
   if(!targets.some(({quote,chapter,field})=>
     !String(afterByOrder.get(chapter.order)?.[field]??'').includes(quote))){
     issues.push('事实补丁未直接改动独立审查引述的冲突原句：'+
       targets.map(row=>'第'+(row.chapter.order+1)+'章.'+row.field+'：“'+row.quote+'”').join('；'));
   }
 }
 return issues;
}
