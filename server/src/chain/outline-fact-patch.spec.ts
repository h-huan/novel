import {it,expect} from 'vitest';
import {applyOutlineFactPatch, outlineFactPatchSynchronizationIssues} from './outline-fact-patch';
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
it('requires action-result patches to touch the exact cited causal assertion before re-review',()=>{
 const chapter={
  content:'她没有站起，也没有出声。评估程序根据申请材料决定是否发放补偿。',
  characterActions:[{action:'她没有站起，也没有出声',result:'因为她没有站起或没有出声，家里补偿落空'}],
  characterStates:[{stateAfter:'家里补偿落空'}],
 };
 const evidence={gaps:[{actionPath:'characterActions.0.action',resultPath:'characterActions.0.result',
  actionEvidence:'她没有站起，也没有出声',resultEvidence:'家里补偿落空',
  reason:'未行动不能证明补偿结果由她造成'}],resultFields:['characterActions.0.result','characterStates.0.stateAfter']};
 const unrelated={content:chapter.content.replace('她没有站起','她仍没有站起')};
 expect(outlineFactPatchSynchronizationIssues(chapter,unrelated,[],evidence).join(' '))
  .toContain('没有直接修改行动结果审核点名的行动/结果原文');
 const targeted={'characterActions.0.result':'家里补偿落空仍由评估程序按申请材料决定，并非她没有站起或没有出声造成'};
 expect(outlineFactPatchSynchronizationIssues(chapter,targeted,[],evidence)).toEqual([]);
 expect(chapter.characterActions[0].result).toBe('因为她没有站起或没有出声，家里补偿落空');
});
it('rejects edits unrelated to an explicitly cited result when the evidence address is wrong',()=>{
 const chapter={content:'回村时卷帘门已关，没人见到关门动作。',
  characterActions:[{action:'柳长顺将四瓶摆上柜台',result:'四瓶摆上了柜台'}]};
 const evidence={gaps:[{actionPath:'characterActions.0.action',resultPath:'characterActions.0.result',
  actionEvidence:'周德海实际上关门',resultEvidence:'他说出了关门原因',
  reason:'卷帘门已关不证明实际关门者'}]};
 const unrelated={'characterActions.0.result':'四瓶摆好了，但关门者依旧未知'};
 expect(outlineFactPatchSynchronizationIssues(chapter,unrelated,[],evidence).join(' '))
   .toContain('没有直接修改行动结果审核点名的行动/结果原文');
 expect(chapter.characterActions[0].result).toBe('四瓶摆上了柜台');
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


const conflictingContent = '安全员掏出昨天下午发在剧组工作群里的报修消息，卡扣照片、型号、建议停机，一条不少，底下没人回。'
  + '他说他先报给了沈曼助理，助理私聊回他一句“沈老师知道了，今天这条必须过，明天换”。'
  + '陈总转头就问他：工作群里那条报修，底下那条回复是谁留的？'
  + '安全员把手机举高。回复就挂在报修底下，头像是沈曼助理。'
  + '沈曼承认是她让助理在群里回复“今天拍完、明天换”。'
  + '导演先签安全条款，威亚组、安全员和替身随后签字。';
const conflictingSceneOutcome = '安全员翻出工作群报修消息与另行收到的助理私聊回复“今天必须过、明天换”。';
const conflictingChapter = {
  order: 2,
  title: '第3章',
  content: conflictingContent,
  scenes: JSON.stringify({ scenes: [{ outcome: conflictingSceneOutcome }] }),
};
const groupReplyConflict = JSON.stringify({
  location1: '本批·第3章.content',
  quote1: conflictingContent,
  location2: '本批·第3章.scenes[0].outcome',
  quote2: conflictingSceneOutcome,
  conflict: '第3章content中安全员先称工作群报修消息“底下没人回”，后文又写“回复就挂在报修底下，头像是沈曼助理”；第3章scenes[0].outcome则称安全员另行收到的是助理私聊回复。两处关于同一群消息回复状态的原文无法同时成立。',
});

it('rejects an unrelated edit when a long quoted field contains the actual contradiction', () => {
 const unrelated = {
  content: conflictingContent.replace('卡扣照片、型号、建议停机', '卡扣照片、具体型号、建议停机'),
 };
 const issues = outlineFactPatchSynchronizationIssues(conflictingChapter, unrelated, [groupReplyConflict]);
 expect(issues.join(' ')).toContain('没有直接修改冲突描述中的原始断言');
});

it('accepts a local edit to the contradictory assertion while preserving separate private-message and signature facts', () => {
 const patch = {
  content: conflictingContent.replace('底下没人回', '底下有一条群回复'),
 };
 expect(outlineFactPatchSynchronizationIssues(conflictingChapter, patch, [groupReplyConflict])).toEqual([]);
 const repaired = applyOutlineFactPatch(conflictingChapter, patch);
 expect(repaired.content).toContain('底下有一条群回复');
 expect(repaired.content).toContain('助理私聊回他一句');
 expect(repaired.content).toContain('沈曼承认是她让助理在群里回复');
 expect(repaired.content).toContain('导演先签安全条款');
 expect(repaired.scenes).toBe(conflictingChapter.scenes);
 expect(conflictingChapter.content).toBe(conflictingContent);
});

it('does not treat a private-message rewrite as a fix for the group-message contradiction', () => {
 const unrelatedChannelEdit = {
  content: conflictingContent.replace('助理私聊回他一句', '助理通过群消息回他一句'),
 };
 expect(outlineFactPatchSynchronizationIssues(conflictingChapter, unrelatedChannelEdit, [groupReplyConflict]).join(' '))
  .toContain('没有直接修改冲突描述中的原始断言');
});
