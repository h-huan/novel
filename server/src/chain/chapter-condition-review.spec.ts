import {describe,expect,it} from 'vitest';
import {chapterConditionReviewIssues} from './chapter-condition-review';
const plan=[{chapter:1,responsibility:'住户取出钥匙打开门',prerequisites:['住户持有旧钥匙'],timeline:'当夜',exitState:'主角已进入屋内'},{chapter:2,responsibility:'主角翻开抽屉取得文件',prerequisites:['主角已进入屋内'],timeline:'进入后',exitState:'主角持有文件'}];
const audit=()=>({consistent:true,contradictions:[],conditionChecks:plan.map(row=>({chapter:row.chapter,taskEvidence:row.responsibility,status:'supported',bridgeSource:'body',bridgeEvidence:row.responsibility,reason:'本章写出实际取得条件和执行动作'}))});
describe('source contract regression',()=>{
it('requires every chapter and an actual current or preceding body bridge',()=>{expect(chapterConditionReviewIssues(audit(),plan,'{}')).toEqual([]);const missing=audit();missing.conditionChecks.pop();expect(chapterConditionReviewIssues(missing,plan,'{}').length).toBeGreaterThan(0);});
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
