import {it,expect} from 'vitest';
import {applyOutlineFactPatch} from './outline-fact-patch';
const original={content:'保留原场景。',targetWords:5000,chapterFunction:'既有职责',characterActions:[{action:'对手不知道秘密。',result:'秘密保留。'}],foreshadowing:[{content:'旧伏笔',plannedRecoveryChapter:4}]};
it('applies dot and bracket addresses atomically while preserving all other fields and the original',()=>{
 const before=JSON.stringify(original);
 const next=applyOutlineFactPatch(original,{'characterActions.0.action':'只警告不要管烟道。','foreshadowing[0].content':'身份压制'});
 expect(next).toEqual({...original,characterActions:[{...original.characterActions[0],action:'只警告不要管烟道。'}],foreshadowing:[{...original.foreshadowing[0],content:'身份压制'}]});
 expect(JSON.stringify(original)).toBe(before);
 expect(applyOutlineFactPatch(original,{content:'只改已点名段落。'}).targetWords).toBe(5000);
});
it.each([{'characterActions.1.action':'新动作'},{'characterActions.0.unknown':'未知字段'},{targetWords:9000},{'characterActions.0.constructor':'危险属性'},
 {'foreshadowing.0.plannedRecoveryChapter':'4'},{'characterActions[00].action':'非法下标'},
 {'characterActions.0.action':'甲','characterActions[0].action':'乙'},{characterActions:[],'characterActions.0.action':'乙'},{}])('rejects unsafe, unknown or overlapping paths without partial writes: %j',patch=>{
 const before=JSON.stringify(original);expect(()=>applyOutlineFactPatch(original,patch)).toThrow();expect(JSON.stringify(original)).toBe(before);
});

it('catches a rejected event left stale in payoff fields before semantic review without changing the draft',async()=>{
 const {outlineFactPatchSynchronizationIssues}=await import('./outline-fact-patch');
 const beforeText='林舟从文件袋里拿出自己三天前在资料室复印的那份回单';
 const afterText='林舟从文件袋里拿出自己两天前在资料室复印的那份回单';
 const chapter={content:beforeText+'。',scenes:[{outcome:beforeText}],foreshadowingRecover:[{method:beforeText}]};
 const prior=JSON.stringify(chapter),patch={content:afterText+'。','scenes.0.outcome':afterText};
 const issues=outlineFactPatchSynchronizationIssues(chapter,patch,[beforeText+'与前章时间线矛盾']);
 expect(issues).toHaveLength(1);expect(issues[0]).toContain('foreshadowingRecover.0.method');
 expect(outlineFactPatchSynchronizationIssues(chapter,{...patch,'foreshadowingRecover.0.method':afterText},[beforeText])).toEqual([]);
 expect(JSON.stringify(chapter)).toBe(prior);
});
it('does not globally replace equal dates, guess ambiguous rewrites or reject events without prior evidence',async()=>{
 const {outlineFactPatchSynchronizationIssues}=await import('./outline-fact-patch');
 const text='林舟从文件袋里拿出自己三天前在资料室复印的那份回单';
 const chapter={content:text,foreshadowingRecover:[{method:'另一人从文件袋里拿出自己三天前在资料室复印的那份回单'}]};
 expect(outlineFactPatchSynchronizationIssues(chapter,{content:text.replace('三天前','两天前')},[text])).toEqual([]);
 expect(outlineFactPatchSynchronizationIssues({...chapter,foreshadowingRecover:[{method:text}]},{content:text.replace('三天前','两天前')},[])).toEqual([]);
 expect(outlineFactPatchSynchronizationIssues({...chapter,foreshadowingRecover:[{method:text}]},{content:'他在评审会展示了之前取得的凭据'},[text])).toEqual([]);
});
it('rejects nonempty but unchanged patches before semantic re-review, including reordered object keys',()=>{
 const before=structuredClone(original);
 for(const patch of [{content:original.content},{'characterActions.0.result':original.characterActions[0].result},
   {characterActions:structuredClone(original.characterActions)},
   {characterActions:[{result:original.characterActions[0].result,action:original.characterActions[0].action}]}]){
  expect(()=>applyOutlineFactPatch(original,patch)).toThrow('没有实际变化');
 }
 expect(original).toEqual(before);
 const changed=applyOutlineFactPatch(original,{content:original.content,'characterActions[0].result':'只完成提出请求，尚未获得同意。'});
 expect(changed.characterActions[0].result).toBe('只完成提出请求，尚未获得同意。');
 expect(changed.targetWords).toBe(original.targetWords);
});
it('stops an unchanged patch at the live preflight boundary without spending a second fact/action review',async()=>{
 const {outlineFactPatchSynchronizationIssues}=await import('./outline-fact-patch');
 const {reviewChapterDependencies}=await import('./chapter-dependency-review');
 let facts=0,actions=0;
 const reviewFacts=async()=>{facts++;return {consistent:false,contradictions:['资料未取得却声称已提交']};};
 const reviewActions=async()=>{actions++;};
 const rejection=await reviewChapterDependencies(original,reviewFacts,reviewActions);
 expect(()=>outlineFactPatchSynchronizationIssues(original,{content:original.content},rejection.defects)).toThrow('没有实际变化');
 expect(facts).toBe(1);expect(actions).toBe(1);
 expect(rejection.defects).toEqual(['资料未取得却声称已提交']);
});
