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
export function outlineFactPatchSynchronizationIssues(chapter:Record<string,any>,patch:unknown,defects:readonly string[]):string[]{
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
 for(const [oldClause,newClause]of changes)for(const [path,text]of current){
  if(clauses(text).includes(oldClause))issues.push(`补丁未同步已点名事件：${path}仍为“${oldClause}”，同一事件其它字段已改为“${newClause}”；核对并修正原有对应路径，不改无关事件或前章。`);
 }
 return issues;
}
