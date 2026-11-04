import {describe,expect,it} from 'vitest';
import {chapterConditionReviewIssues,materializeChapterConditionSources,chapterConditionTaskAnchors,chapterConditionBridgeAnchorsVerified} from './chapter-condition-review';
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
it('retains gaps and permits ordinary autonomous actions without inventing prerequisites',()=>{const value=audit();value.conditionChecks[0].status='gap';expect(chapterConditionReviewIssues(value,plan,'{}').length).toBeGreaterThan(0);(value.contradictions as any[]).push({chapter:1});expect(chapterConditionReviewIssues(value,plan,'{}')).toEqual([]);value.conditionChecks[0].status='not_required';expect(chapterConditionReviewIssues(value,plan,'{}')).toEqual([]);});

});

it('checks the actual promised exit state before short detail generation, not just whether the task can start',()=>{
 const value=audit();expect(chapterConditionReviewIssues(value,plan,'{}',false,true).length).toBeGreaterThan(0);
 value.conditionChecks.forEach((row:any,index)=>row.exitStateEvidence=plan[index].exitState);
 expect(chapterConditionReviewIssues(value,plan,'{}',false,true)).toEqual([]);
 (value.conditionChecks[0] as any).exitStateEvidence=plan[1].exitState;
 expect(chapterConditionReviewIssues(value,plan,'{}',false,true).length).toBeGreaterThan(0);
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
