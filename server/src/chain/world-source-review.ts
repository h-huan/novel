import {buildSourceHierarchyReviewPrompt,type SourceHierarchyReview} from './source-hierarchy-review';
import {WORLD_SOURCE_AUDIT_POLICY} from '../../shared/src/system-workflow-rules.registry';

/** Addresses are owned by the server and bound to this exact candidate. */
export function worldSourceAnchors(value:unknown,prefix='L'){
 const rows:Array<{ref:string;path:string[];text:string}>=[];
 const visit=(node:any,path:string[])=>{
  if(typeof node==='string'&&node.trim())rows.push({ref:prefix+(rows.length+1),path,text:node});
  else if(node&&typeof node==='object')Object.entries(node).forEach(([key,item])=>visit(item,[...path,key]));
 };visit(value,[]);return rows;
}
export interface WorldSourceConflict {upperRef:string;lowerRef:string;conflict:string;suggestedFix:string;}
export interface WorldSourceReview extends SourceHierarchyReview {conflicts:WorldSourceConflict[];}
export function buildWorldSourceReviewPrompt(input:Parameters<typeof buildSourceHierarchyReviewPrompt>[0]){
 const fields=Object.keys(input.child as object),parent=worldSourceAnchors(input.parent,'U'),child=worldSourceAnchors(input.child);
 return buildSourceHierarchyReviewPrompt(input)+'\n'+WORLD_SOURCE_AUDIT_POLICY
  +'\n【必须逐项覆盖的下层字段】'+JSON.stringify(fields)
  +'\n【上层原文位置目录；原文见上方对应路径】'+JSON.stringify(parent.map(({text,...address})=>address))+'\n【下层原文位置目录；原文见上方对应路径】'+JSON.stringify(child.map(({text,...address})=>address))
  +'\nfieldChecks恰好覆盖每个字段一次，每项{field,status:"compatible|conflict|unknown",reason:"至少8字说明同字段中的实际条件核对，不以其它字段通过代替"}。数组字段须核对全部条目及相互关系，不发现一条就停止。contradictions每项{upperRef:"实际U编号",lowerRef:"实际L编号",conflict:"至少8字证明同一事实为什么不能同时成立",suggestedFix:"最小下层修复建议"}；服务器按编号提取字段和原文，不自行复述引文。unknown不能报consistent=true，也不能当已证明冲突修故事。只返回JSON:{"consistent":true,"fieldChecks":[{"field":"实际字段","status":"compatible|conflict|unknown","reason":"具体依据"}],"contradictions":[]}。示例状态只表示形状，必须按实际来源判断，所有冲突一次汇总。';
}
export function describeWorldSourceReview(value:any,parent:unknown,child:unknown):string[]{
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.consistent!=='boolean'||!Array.isArray(value.contradictions))return ['世界观审查须返回consistent、fieldChecks与contradictions'];
 const fields=Object.keys(child as object),checks=value.fieldChecks,errors:string[]=[],upper=worldSourceAnchors(parent,'U'),lower=worldSourceAnchors(child);
 if(!Array.isArray(checks)||checks.length!==fields.length||new Set(checks.map((row:any)=>row?.field)).size!==fields.length
   ||checks.some((row:any)=>!fields.includes(row?.field)))errors.push('fieldChecks须覆盖全部实际世界观字段，不能遗漏、重复或用整体结论代替');
 if(Array.isArray(checks))for(const row of checks){if(!['compatible','conflict','unknown'].includes(row?.status)||typeof row?.reason!=='string'||row.reason.trim().length<8)errors.push(String(row?.field)+'缺少状态与实际核对依据');}
 const conflictFields=new Set<string>();const pairs=new Set<string>();
 for(const row of value.contradictions){
  const a=upper.find(a=>a.ref===row?.upperRef),b=lower.find(b=>b.ref===row?.lowerRef),key=JSON.stringify([row?.upperRef,row?.lowerRef,row?.conflict]);
  if(!a||!b||typeof row?.conflict!=='string'||row.conflict.trim().length<8||typeof row?.suggestedFix!=='string'||!row.suggestedFix.trim()||pairs.has(key))errors.push('冲突须绑定本次上、下层实际原文编号及互斥理由，不得重复或错引');
  if(b)conflictFields.add(b.path[0]);pairs.add(key);
 }
 if(Array.isArray(checks)){
  for(const field of fields)if((checks.find((row:any)=>row?.field===field)?.status==='conflict')!==conflictFields.has(field))errors.push(field+'的字段结论与冲突清单不一致');
  if(value.consistent!==checks.every((row:any)=>row?.status==='compatible'))errors.push('整体结论与字段核查状态不一致');
 }
 return errors;
}
export function materializeWorldSourceReview(value:any,parent:unknown,child:unknown):WorldSourceReview{
 const errors=describeWorldSourceReview(value,parent,child);if(errors.length)throw Error(errors.join('；'));
 if(value.fieldChecks.some((row:any)=>row.status==='unknown'))throw Error('世界观上层事实审查仍有未评估字段，禁止修复或保存：'+value.fieldChecks.filter((row:any)=>row.status==='unknown').map((row:any)=>row.field+'：'+row.reason).join('；'));
 const upper=worldSourceAnchors(parent,'U'),lower=worldSourceAnchors(child);
 return {consistent:value.consistent,conflicts:value.contradictions.map((row:any)=>({...row})),contradictions:value.contradictions.map((row:WorldSourceConflict)=>{
  const a=upper.find(a=>a.ref===row.upperRef)!,b=lower.find(b=>b.ref===row.lowerRef)!;
  return JSON.stringify({...row,upperField:a.path.join('.'),upperEvidence:a.text,lowerField:b.path.join('.'),lowerEvidence:b.text});
 })};
}

/** Only an unpublished world candidate is accepted by the caller. No Canon
 * update target is introduced. All untouched characters remain identical. */
export function applyUncommittedWorldPatch(world:any,value:any,review:WorldSourceReview){
 if(!value||!Array.isArray(value.edits)||!value.edits.length||Object.keys(value).some(key=>key!=='edits'))throw Error('世界观局部修复仅接收非空edits，不接受完整世界观');
 const catalog=worldSourceAnchors(world),seen=new Set<string>();
 const edits=value.edits.map((edit:any)=>{
  const anchor=catalog.find(a=>a.ref===edit?.ref);
  if(!anchor||!review.conflicts.some(issue=>issue.lowerRef===edit.ref)||seen.has(edit.ref))throw Error('世界观修复只允许本次已举证冲突位置，不得修改其它字段或重复位置');
  seen.add(edit.ref);
  if(typeof edit.match!=='string'||!edit.match||typeof edit.replacement!=='string'||!edit.replacement.trim()
    ||edit.replacement===edit.match||anchor.text.split(edit.match).length!==2)throw Error('世界观修复须提供唯一逐字原文与有效局部替换');
  return {anchor,text:anchor.text.replace(edit.match,edit.replacement)};
 });
 if(review.conflicts.some(issue=>!seen.has(issue.lowerRef)))throw Error('世界观修复遗漏已举证冲突位置');
 const next=structuredClone(world);for(const {anchor,text} of edits){let node=next;for(const key of anchor.path.slice(0,-1))node=node[key];node[anchor.path.at(-1)!]=text;}return next;
}
export function worldReviewFailureOrigin(original:any,candidate:any,review:WorldSourceReview){
 const catalog=worldSourceAnchors(candidate);
 return review.conflicts.map(issue=>{
  const path=catalog.find(a=>a.ref===issue.lowerRef)!.path;let old=original,current=candidate;for(const part of path){old=old?.[part];current=current?.[part];}
  return (old===current?'原文未改，复检新增发现':'已修改位置仍有问题')+'：'+path.join('.')+'；'+issue.conflict;
 });
}
