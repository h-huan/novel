import { buildChapterResponsibilityAuditPrompt, chapterResponsibilityPlanningDirective, CHAPTER_RESPONSIBILITY_PLAN_EXAMPLE } from '../../shared/src/chapter-responsibility-review';
import {describe,expect,it} from 'vitest';
import {chapterConditionReviewIssues,chapterConditionPlanningGapIssues,materializeChapterConditionSources,chapterConditionTaskAnchors,chapterConditionBridgeAnchorsVerified,coerceUnprovenConditionChecks} from './chapter-condition-review';
const plan=[{chapter:1,responsibility:'住户取出钥匙打开门',prerequisites:['住户持有旧钥匙'],timeline:'当夜',exitState:'主角已进入屋内'},{chapter:2,responsibility:'主角翻开抽屉取得文件',prerequisites:['主角已进入屋内'],timeline:'进入后',exitState:'主角持有文件'}];
const audit=()=>({consistent:true,contradictions:[],conditionChecks:plan.map(row=>({chapter:row.chapter,taskEvidence:row.responsibility,status:'supported',bridgeSource:'body',bridgeEvidence:row.responsibility,reason:'本章写出实际取得条件和执行动作'}))});
describe('source contract regression',()=>{
it('requires every chapter and an actual current or preceding body bridge',()=>{expect(chapterConditionReviewIssues(audit(),plan,'{}')).toEqual([]);const missing=audit();missing.conditionChecks.pop();expect(chapterConditionReviewIssues(missing,plan,'{}').length).toBeGreaterThan(0);});
it('does not treat a requested prerequisite or timeline as proof that it was obtained',()=>{
 const rows=audit();
 rows.conditionChecks[0].bridgeEvidence=plan[0].prerequisites[0];
 expect(chapterConditionReviewIssues(rows,plan,'{}')).toContain('逐章条件核对缺少取得路径、有效性证据或完整覆盖；supported需要当前计划的实际取得路径，不能只引用世界规则');
 rows.conditionChecks[0].bridgeEvidence=plan[0].timeline;
 expect(chapterConditionReviewIssues(rows,plan,'{}').length).toBeGreaterThan(0);
 rows.conditionChecks[0].bridgeEvidence=plan[0].responsibility;
 expect(chapterConditionReviewIssues(rows,plan,'{}')).toEqual([]);
});
it('rejects result self-proof, future action and world permission alone',()=>{for(const evidence of ['主角已进入屋内','主角翻开抽屉取得文件']){const value=audit();value.conditionChecks[0].bridgeEvidence=evidence;expect(chapterConditionReviewIssues(value,plan,'{}').length).toBeGreaterThan(0);}const value=audit();value.conditionChecks[0].bridgeSource='project_context';expect(chapterConditionReviewIssues(value,plan,JSON.stringify(plan)).length).toBeGreaterThan(0);});
it('does not trust a model supplied server verification flag or an unknown verdict',()=>{const value=audit();Object.assign(value.conditionChecks[0],{bridgeAnchorIds:[],anchoredBridgeVerified:true});expect(chapterConditionReviewIssues(value,plan,'{}').length).toBeGreaterThan(0);value.conditionChecks[0].status='unknown';expect(chapterConditionReviewIssues(value,plan,'{}').length).toBeGreaterThan(0);});
it('keeps pure planning gaps blocking without manufacturing a CR violation',()=>{
 const value=audit() as any;
 value.consistent=false;
 value.conditionChecks[0].status='gap';
 value.conditionChecks[0].bridgeEvidence='';
 value.conditionChecks[0].reason='未安排住户实际交出钥匙或在现场开门的动作';
 const bound=materializeChapterConditionSources(value,plan);
 expect(bound.contradictions).toEqual([]);
 // A well-formed negative verdict is permitted, but is NOT project approval.
 expect(chapterConditionReviewIssues(bound,plan,'{}',false,true)).toEqual([]);
 expect(chapterConditionPlanningGapIssues(bound,plan)).toHaveLength(1);
 expect(chapterConditionPlanningGapIssues(bound,plan)[0]).toContain('第1章条件取得缺口');
 expect(chapterConditionPlanningGapIssues(bound,plan)[0]).toContain('预定出口');
 value.conditionChecks[0].status='not_required';
 expect(chapterConditionPlanningGapIssues(value,plan)).toEqual([]);
 expect(chapterConditionReviewIssues(materializeChapterConditionSources(value,plan),plan,'{}',false,true)).toEqual([]);
});

});

it('checks the actual promised exit state before short detail generation, not just whether the task can start',()=>{
 const value=audit();expect(chapterConditionReviewIssues(value,plan,'{}',false,true).length).toBeGreaterThan(0);
 value.conditionChecks.forEach((row:any,index)=>row.exitStateEvidence=plan[index].exitState);
 expect(chapterConditionReviewIssues(value,plan,'{}',false,true)).toEqual([]);
 (value.conditionChecks[0] as any).exitStateEvidence=plan[1].exitState;
 expect(chapterConditionReviewIssues(value,plan,'{}',false,true).length).toBeGreaterThan(0);
});

it('binds a supported prior-chapter acquisition when the reviewer names it in prose but omits the address',()=>{
 const plan2=[
  {chapter:1,responsibility:'法医复检写明他杀征象，中队长已到场看过结论',prerequisites:[],timeline:'当夜',exitState:'复检结论已出'},
  {chapter:2,responsibility:'中队长依据复检结论作出立案，并让殡仪馆暂缓火化',prerequisites:['复检结论'],timeline:'次日下午',exitState:'已立案'},
 ];
 const value:any={consistent:true,contradictions:[],conditionChecks:[
  {chapter:1,status:'supported',bridgeSource:'body',bridgeEvidence:plan2[0].responsibility,reason:'本章写出实际取得条件和执行动作'},
  {chapter:2,status:'supported',bridgeSource:'body',reason:'第1章法医复检写明他杀征象，结论在前章实际完成并仍有效'},
 ]};
 const anchors=chapterConditionTaskAnchors(plan2);const byId=new Map(anchors.map(anchor=>[anchor.id,anchor]));
 const coerced=coerceUnprovenConditionChecks(value,plan2,'{}',check=>chapterConditionBridgeAnchorsVerified(check,plan2,byId,'{}'),true);
 expect(coerced.conditionChecks[1].status).toBe('supported');
 expect(coerced.conditionChecks[1].bridgeAnchorIds).toEqual(['chapter:c1:task']);
 const bound=materializeChapterConditionSources(coerced,plan2);
 expect(chapterConditionReviewIssues(bound,plan2,'{}',check=>chapterConditionBridgeAnchorsVerified(check,plan2,byId,'{}'),true).join('；')).not.toContain('第2章supported缺少');
});

it('binds a two-character prior term such as 复检 when the reviewer names the prior chapter',()=>{
 const plan2=[
  {chapter:1,responsibility:'复检结论已出',prerequisites:[],timeline:'当夜',exitState:'复检结论已出'},
  {chapter:2,responsibility:'依据复检结论立案',prerequisites:['复检结论'],timeline:'次日下午',exitState:'已立案'},
 ];
 const value:any={consistent:true,contradictions:[],conditionChecks:[
  {chapter:1,status:'supported',bridgeSource:'body',bridgeEvidence:plan2[0].responsibility,reason:'本章写出实际取得条件和执行动作'},
  {chapter:2,status:'supported',bridgeSource:'body',reason:'第1章复检结论已出，本章依据该结论立案'},
 ]};
 const anchors=chapterConditionTaskAnchors(plan2);const byId=new Map(anchors.map(anchor=>[anchor.id,anchor]));
 const coerced=coerceUnprovenConditionChecks(value,plan2,'{}',check=>chapterConditionBridgeAnchorsVerified(check,plan2,byId,'{}'),true);
 expect(coerced.conditionChecks[1].status).toBe('supported');
 expect(coerced.conditionChecks[1].bridgeAnchorIds).toEqual(['chapter:c1:task']);
});

describe('short and long preflight evidence share an exact chapter source contract',()=>{
 it('reports the concrete missing chapter and field instead of one opaque message',()=>{
  const value=audit() as any;
  delete value.conditionChecks[0].taskEvidence;
  delete value.conditionChecks[1].bridgeEvidence;
  value.conditionChecks[1].bridgeSource='project_context';
  const issues=chapterConditionReviewIssues(value,plan,'{}',false,true);
  expect(issues.join('；')).toContain('第1章taskEvidence');
  expect(issues.join('；')).toContain('第2章supported缺少');
  expect(issues.join('；')).toContain('第1章exitStateEvidence');
  expect(issues).toContain('逐章条件核对缺少取得路径、有效性证据或完整覆盖；supported需要当前计划的实际取得路径，不能只引用世界规则');
 });
 it('projects only server-owned chapter text when the independent reviewer omits duplicate echo fields',()=>{
  const minimal={consistent:true,contradictions:[],conditionChecks:plan.map(row=>({
   chapter:row.chapter,status:'supported',bridgeEvidence:row.responsibility,
   reason:'逐章核对本章明写的执行动作及当前状态的变化',
  }))};
  const bound=materializeChapterConditionSources(minimal,plan);
  expect(bound.conditionChecks.map((row:any)=>row.taskEvidence)).toEqual(plan.map(row=>row.responsibility));
  expect(bound.conditionChecks.map((row:any)=>row.exitStateEvidence)).toEqual(plan.map(row=>row.exitState));
  expect(chapterConditionReviewIssues(bound,plan,'{}',false,true)).toEqual([]);
  const invalid={...minimal,conditionChecks:minimal.conditionChecks.map((row,index)=>index===0?{
   ...row,bridgeEvidence:plan[0].prerequisites[0]}:row)};
  expect(chapterConditionReviewIssues(materializeChapterConditionSources(invalid,plan),plan,'{}',false,true).length).toBeGreaterThan(0);
  expect(materializeChapterConditionSources({consistent:true,contradictions:[]},plan).conditionChecks).toBeUndefined();
 });
 it('binds only valid explicit task and exit citations and never supplies a model verdict',()=>{
  const value={consistent:true,contradictions:[],conditionChecks:plan.map(row=>({
   chapter:row.chapter,taskAnchorId:'chapter:c'+row.chapter+':task',
   exitStateAnchorId:'chapter:c'+row.chapter+':exit',status:'supported',
   bridgeAnchorIds:['chapter:c'+row.chapter+':task'],
   reason:'本章真实动作直接完成了所宣称的出口结果',
  }))};
  const bound=materializeChapterConditionSources(value,plan);
  const byId=new Map(chapterConditionTaskAnchors(plan).map(anchor=>[anchor.id,anchor]));
  expect(chapterConditionReviewIssues(bound,plan,'{}',
   check=>chapterConditionBridgeAnchorsVerified(check,plan,byId,'{}'),true)).toEqual([]);
  const falseId={...value,conditionChecks:value.conditionChecks.map((row,index)=>index===0?{...row,taskAnchorId:'chapter:c99:task'}:row)};
  const wrong=materializeChapterConditionSources(falseId,plan);
  expect(chapterConditionReviewIssues(wrong,plan,'{}',check=>chapterConditionBridgeAnchorsVerified(check,plan,byId,'{}'),true).join('；'))
    .toContain('第1章taskEvidence');
  const missing={...value,conditionChecks:value.conditionChecks.map((row,index)=>index===0?{...row,status:'unknown'}:row)};
  expect(chapterConditionReviewIssues(materializeChapterConditionSources(missing,plan),plan,'{}').length).toBeGreaterThan(0);
 });
 it('never overwrites a wrong quotation or upgrades a result-only bridge',()=>{
  const value={conditionChecks:[{chapter:1,taskAnchorId:'chapter:c1:task',
   taskEvidence:'虚构了新的实际行动',exitStateAnchorId:'chapter:c1:exit',
   exitStateEvidence:plan[0].exitState,status:'supported',
   bridgeAnchorIds:['chapter:c1:exit'],reason:'凭借结果本身就证明行动和条件'}]};
  const bound=materializeChapterConditionSources(value,plan);
  expect(bound.conditionChecks[0].taskEvidence).toBe('虚构了新的实际行动');
  const byId=new Map(chapterConditionTaskAnchors(plan).map(anchor=>[anchor.id,anchor]));
  expect(chapterConditionReviewIssues(bound,plan,'{}',
   check=>chapterConditionBridgeAnchorsVerified(check,plan,byId,'{}'),true).length).toBeGreaterThan(0);
 });
});

it('uses the same real acquisition-action contract in planning and every-chapter independent boundary audit',()=>{
 const planning=chapterResponsibilityPlanningDirective(false);
 expect(planning).toContain('prerequisites只登记进入条件及其已知来源');
 expect(planning).toContain('本章responsibility中明确安排');
 expect(CHAPTER_RESPONSIBILITY_PLAN_EXAMPLE.chapterResponsibilities[0].responsibility).toContain('实际取得动作');
 const chapters=[1,2,3].map(chapter=>({
  chapter,title:'章'+chapter,function:'conflict',
  responsibility:'本章人物通过既定行动获取已授权的证据并推动新局面'+chapter,
  prerequisites:[],timeline:'接续上一章的相对时间',exitState:'本章已完成新局面'+chapter,
 }));
 const prompt=buildChapterResponsibilityAuditPrompt({
  executionStandard:'既有规则',creativeBrief:'已确认故事',shortStoryCard:{},worldContinuityDirective:'已确认世界机制',
  plan:chapters,includeSharedPolicies:false,entryExitContract:true,evidenceMode:'quotes',
 });
 expect(prompt).toContain('【本次逐章审核身份目录】');
 const indexes=JSON.parse(prompt.split('【本次逐章审核身份目录】')[1].split('。conditionChecks必须')[0]);
 expect(indexes).toEqual([{chapter:1},{chapter:2},{chapter:3}]);
 expect(prompt).toContain('conditionChecks只返回chapter、status、bridgeEvidence、reason');
 expect(prompt).toContain('仅有实际条件取得缺口、但无被违反的CR规则时返回');
 expect(prompt).toContain('缺少则报告gap；仅当另有冻结来源证据证明违反CR规则时才报告contradictions');
 const anchorPrompt=buildChapterResponsibilityAuditPrompt({
  executionStandard:'既有规则',creativeBrief:'已确认故事',shortStoryCard:{},worldContinuityDirective:'已确认世界机制',
  plan:chapters,includeSharedPolicies:false,entryExitContract:true,evidenceMode:'anchors',
 });
 const anchorIndexes=JSON.parse(anchorPrompt.split('【本次逐章审核身份目录】')[1].split('。conditionChecks必须')[0]);
 expect(anchorIndexes.map((row:any)=>row.taskAnchorId)).toEqual(['chapter:c1:task','chapter:c2:task','chapter:c3:task']);
 expect(anchorPrompt).toContain('conditionChecks只返回taskAnchorId、bridgeAnchorIds及状态理由');
 expect(prompt).toContain('普通自主行动按not_required解释');
});
