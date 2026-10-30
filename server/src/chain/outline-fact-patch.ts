import { isDeepStrictEqual } from 'node:util';

/** One contract for the repair prompt, validator and application. */
export const OUTLINE_FACT_REPAIR_FIELDS = [
  'title','content','coreContent','summary','plot','scenes','mainScenes','characterActions','人物行动',
  'conflicts','conflict','conflictDesign','highlights','highlight','rousing','hotScenes',
  'foreshadowing','foreshadowingSet','伏笔设置','foreshadowingRecover','foreshadowingPayoff','伏笔回收',
  'characterStates','hook','nextChapterHook','nextHook','emotionalTone','mood','turningPoint','reversalPoint',
] as const;

/** Apply only existing addresses under authorized story fields. Validate the
 * whole patch before mutating a clone; never append a guessed array member. */
export function applyOutlineFactPatch(chapter:Record<string,any>,patch:unknown):Record<string,any> {
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)
    throw Error('必须返回非空patch对象，不得重写整章');
  const changes=Object.entries(patch).map(([key,value])=>{
    const normalized=key.replace(/\[(0|[1-9]\d*)\]/g,'.$1');
    const parts=normalized.split('.');
    if(!OUTLINE_FACT_REPAIR_FIELDS.includes(parts[0] as any)||parts.some(part=>!part||['__proto__','prototype','constructor'].includes(part))
      ||normalized.includes('[')||normalized.includes(']'))throw Error('局部事实修复包含禁止字段：'+key);
    let prior:any=chapter;
    for(const part of parts){
      if(prior===null||typeof prior!=='object'||!Object.hasOwn(prior,part)
        ||Array.isArray(prior)&&!/^(0|[1-9]\d*)$/.test(part))throw Error('局部事实修复路径不存在：'+key);
      prior=prior[part];
    }
    if(parts.length>1&&(typeof value!==typeof prior||(value===null)!==(prior===null)||Array.isArray(value)!==Array.isArray(prior)))
      throw Error('局部事实修复不能改变字段类型：'+key);
    return {parts,normalized,value};
  });
  for(let i=0;i<changes.length;i++)for(let j=0;j<i;j++){
    const a=changes[i].normalized,b=changes[j].normalized;
    if(a===b||a.startsWith(b+'.')||b.startsWith(a+'.'))throw Error('局部事实修复路径重复或父子重叠：'+a+'、'+b);
  }
  const next=structuredClone(chapter);
  for(const {parts,value} of changes){let target=next;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)!]=structuredClone(value);}
  if(isDeepStrictEqual(next,chapter))throw Error('局部事实补丁没有实际变化，保留原拒绝结论，不重复语义复核');
  return next;
}

/** Catch an omitted duplicate of an already rejected event before paying for a
 * semantic re-review. No dates are computed and no text is changed here.
 * Require an identical full event clause on both sides of one changed duration;
 * unrelated uses of the same number, ambiguous rewrites and prior chapters are
 * intentionally left to the independent fact/action gates. */
export function outlineFactPatchSynchronizationIssues(chapter:Record<string,any>,patch:unknown,defects:readonly string[],actionEvidence?:{gaps?:readonly {actionPath?:string|null;resultPath?:string|null;actionEvidence?:string;resultEvidence?:string;reason?:string}[]}):string[]{
 const next=applyOutlineFactPatch(chapter,patch);
 const leaves=(value:unknown,path='',rows=new Map<string,string>()):Map<string,string>=>{
  if(typeof value==='string')rows.set(path,value);
  else if(Array.isArray(value))value.forEach((row,index)=>leaves(row,path+'.'+index,rows));
  else if(value&&typeof value==='object')for(const [key,row] of Object.entries(value)){
   if(path||OUTLINE_FACT_REPAIR_FIELDS.includes(key as any))leaves(row,path?path+'.'+key:key,rows);
  }
  return rows;
 };
 const clauses=(text:string)=>text.split(/[，。！？；\n\r]/).map(row=>row.trim()).filter(Boolean);
 const duration=/[\d零〇一二两三四五六七八九十百千万]+(?:天|日|小时|分钟|秒)(?:前|后)/g;
 const frame=(text:string)=>{
  const matches=[...text.matchAll(duration)];if(matches.length!==1)return null;
  const match=matches[0],index=match.index!;
  if(index<6||text.length-index-match[0].length<6||text.length<18)return null;
  return {key:text.slice(0,index)+'\u0000'+text.slice(index+match[0].length),time:match[0]};
 };
 const old=leaves(chapter),current=leaves(next),evidence=defects.join('\n'),changes=new Map<string,string>();
 for(const [path,text]of old){
  const updated=current.get(path);if(updated===undefined||updated===text)continue;
  const after=clauses(updated).map(value=>({value,frame:frame(value)}));
  for(const clause of clauses(text)){
   const before=frame(clause);if(!before||!evidence.includes(clause))continue;
   const changed=after.find(row=>row.frame?.key===before.key&&row.frame.time!==before.time);
   if(changed)changes.set(clause,changed.value);
  }
 }
 const issues:string[]=[];
 // Action/result gaps carry exact evidence paths from the independent action review.
 // Require the patch to change one of the cited action/result assertions, not merely
 // another sentence in the same content field. The semantic review still decides truth.
 const actionGaps=(actionEvidence?.gaps||[]).filter(gap=>gap.actionPath||gap.resultPath);
 const normalizePath=(value:string)=>value.replace(/\[(0|[1-9]\d*)\]/g,'.$1').replace(/^0\./,'');
 const pathOverlaps=(left:string,right:string)=>left===right||left.startsWith(right+'.')||right.startsWith(left+'.');
 const evidenceClause=(value:string,quote:string):string=>{
  const at=value.indexOf(quote);if(at<0)return quote;
  const delimiter=/[。！？；\n\r]/;
  let start=at;while(start>0&&!delimiter.test(value[start-1]))start--;
  let end=at+quote.length;while(end<value.length&&!delimiter.test(value[end]))end++;
  return value.slice(start,end).trim()||quote;
 };
 const directlyChangesEvidence=(path:string,quote:string|undefined):boolean=>{
  const target=normalizePath(path);
  for(const [oldPath,before] of old){
   if(!pathOverlaps(normalizePath(oldPath),target))continue;
   const after=current.get(oldPath);
   if(after===undefined||after===before)continue;
   const literal=String(quote||'').trim();
   if(literal&&before.includes(literal))return changeTouchesFragment(before,after,evidenceClause(before,literal));
   const escaped=literal?JSON.stringify(literal).slice(1,-1):'';
   if(escaped&&before.includes(escaped))return changeTouchesFragment(before,after,evidenceClause(before,escaped));
   // Audit anchors retain the JSON-escaped spelling of quoted/newline text,
   // while chapter leaves contain actual characters. Decode only valid JSON
   // escapes before declaring an explicit address mismatched.
   if(literal){try{
    const decoded=JSON.parse('"'+literal+'"');
    if(typeof decoded==='string'&&before.includes(decoded))
     return changeTouchesFragment(before,after,evidenceClause(before,decoded));
   }catch{}}
   // If the auditor supplies an explicit quote which cannot be found at this
   // address, changing any other text in that field does not repair this gap.
   // Absent quotes still allow whole-field change; independent review remains decisive.
   return !literal;
  }
  return false;
 };
 for(const gap of actionGaps){
  const refs=[{path:gap.actionPath,quote:gap.actionEvidence},{path:gap.resultPath,quote:gap.resultEvidence}]
   .filter((item):item is {path:string;quote:string|undefined}=>typeof item.path==='string'&&!!item.path.trim());
  if(refs.length&&!refs.some(item=>directlyChangesEvidence(item.path,item.quote))){
   issues.push('事实补丁没有直接修改行动结果审核点名的行动/结果原文；只改同字段的其它文字不能视为修复。原因：'+String(gap.reason||'行动与结果之间缺少成立条件').slice(0,180));
  }
 }
 // A semantic conflict arrives as two exact source quotations. Before paying for
 // another semantic review, require the one-sided current-chapter assertion to
 // be addressed by this patch. This is only a patch-target check, not a verdict
 // that the repaired chapter is semantically consistent.
 const containsQuote=(rows:Map<string,string>,quote:string)=>!!quote&&[...rows.values()].some(value=>value.includes(quote));
 const conflictFragments=(text:string):string[]=>{
  const patterns=[/“([^”]{2,180})”/g,/「([^」]{2,180})」/g,/『([^』]{2,180})』/g,/‘([^’]{2,120})’/g,/"([^"]{2,180})"/g];
  const found:string[]=[];
  for(const pattern of patterns)for(const match of text.matchAll(pattern)){
   const fragment=String(match[1]||'').trim();if(fragment.length>=4)found.push(fragment);
  }
  return [...new Set(found)];
 };
 function changeTouchesFragment(before:string,after:string,fragment:string):boolean {
  let prefix=0;
  while(prefix<before.length&&prefix<after.length&&before[prefix]===after[prefix])prefix++;
  let suffix=0;
  while(suffix<before.length-prefix&&suffix<after.length-prefix
    &&before[before.length-1-suffix]===after[after.length-1-suffix])suffix++;
  const changedEnd=before.length-suffix;
  if(changedEnd<=prefix)return false;
  let at=before.indexOf(fragment);
  while(at>=0){
   if(at<changedEnd&&at+fragment.length>prefix)return true;
   at=before.indexOf(fragment,at+1);
  }
  return false;
 }
 for(const defect of defects){
  let row:any;
  try{row=JSON.parse(defect);}catch{continue;}
  if(!row||typeof row!=='object'||typeof row.quote1!=='string'||typeof row.quote2!=='string')continue;
  const quote1= row.quote1.trim(),quote2=row.quote2.trim();
  if(!quote1||!quote2)continue;
  const conflict=String(row.conflict||'');
  const evidenceFragments=conflictFragments(conflict).filter(fragment=>quote1.includes(fragment)||quote2.includes(fragment));
  const primaryConflict=conflict.split(/[；;]/,1)[0];
  const primaryFragments=conflictFragments(primaryConflict)
   .filter(fragment=>evidenceFragments.includes(fragment)&&[...old.values()].some(value=>value.includes(fragment)));
  const targetFragments=(primaryFragments.length?primaryFragments:evidenceFragments)
   .filter(fragment=>[...old.values()].some(value=>value.includes(fragment)));
  // A full-field quotation can change when an unrelated sentence changes. Require
  // the patch's actual diff to touch a quoted assertion from the conflict itself.
  // This is only a target check; the independent fact review still decides truth.
  if(targetFragments.length){
   const directlyChanged=targetFragments.some(fragment=>[...old.entries()].some(([path,before])=>{
    const updated=current.get(path);
    return updated!==undefined&&updated!==before&&changeTouchesFragment(before,updated,fragment);
   }));
   if(!directlyChanged)issues.push('事实补丁没有直接修改冲突描述中的原始断言“'+targetFragments.slice(0,3).join('／')+'”；只改同一字段的其它文字不能视为修复。');
  }
  const before1=containsQuote(old,quote1),before2=containsQuote(old,quote2);
  if(!before1&&!before2)continue;
  const after1=containsQuote(current,quote1),after2=containsQuote(current,quote2);
  if(before1&&before2){
   if(after1&&after2)issues.push('事实补丁没有消除当前章内两侧冲突引文；必须修正当前章的冲突断言及其投影，不得以当前章反向改写已接受事实。');
  }else{
   const currentQuote=before1?quote1:quote2;
   if(containsQuote(current,currentQuote))issues.push('事实补丁未触及当前章的冲突引文“'+currentQuote.slice(0,100)+'”；前章已接受事实是不可变来源，须修正当前章及其投影，不得反向改写前章。');
  }
 }
 // A fact review may cite several projections of the SAME counted event:
 // dialogue, summary and character action can each state "five" while the
 // actual narrated calculation proves "four". Merely touching one cited phrase
 // is not sufficient. Require at least ONE of the mutually exclusive numeric
 // variants to be removed from ALL its cited current-chapter assertions before
 // paying for another independent semantic review. Do not decide which count
 // is true, alter unrelated quantities, or treat an uncited number as evidence.
 for(const defect of defects){
  let row:any;try{row=JSON.parse(defect);}catch{continue;}
  if(!row||typeof row.conflict!=='string'||!String(row.calculation||'').trim())continue;
  const quotes=conflictFragments(row.conflict);
  const variants=new Map<string,Map<string,Set<string>>>();
  for(const quote of quotes){
   if(![...old.values()].some(value=>value.includes(quote)))continue;
   for(const match of quote.matchAll(/([0-9零〇一二两三四五六七八九十百千万]+)(条|个|次|张|件|人|辆|只|份|本|箱|笔|颗|位|天|日|小时|分钟|秒)/g)){
    const unit=match[2],quantity=match[1];
    if(!variants.has(unit))variants.set(unit,new Map());
    const units=variants.get(unit)!;
    if(!units.has(quantity))units.set(quantity,new Set());
    units.get(quantity)!.add(quote);
   }
  }
  for(const [unit,counts] of variants){
   if(counts.size<2)continue;
   const stillCited=(quote:string)=>[...current.values()].some(value=>value.includes(quote));
   if([...counts.values()].every(quotesForCount=>[...quotesForCount].some(stillCited))){
    issues.push('同一事件的'+unit+'数量矛盾仍在多个已举证字段中并存；须统一修正同一数值在content、人物台词、characterActions等原有投影，不能只改一处。');
   }
  }
 }
 for(const [oldClause,newClause]of changes)for(const [path,text]of current){
  if(clauses(text).includes(oldClause))issues.push(`补丁未同步已点名事件：${path}仍为“${oldClause}”，同一事件其它字段已改为“${newClause}”；核对并修正原有对应路径，不改无关事件或前章。`);
 }
 return issues;
}
