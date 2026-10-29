import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import * as budgetConfig from '../config/generation-budgets';
beforeEach(()=>vi.spyOn(budgetConfig,'readGenerationBudgets').mockReturnValue({...budgetConfig.GENERATION_BUDGET_DEFAULTS,reviewGroupingMode:1}));
afterEach(()=>vi.restoreAllMocks());
import {ChainController} from './chain.controller';
import {SELECTED_PREMISE_FIELDS,normalizePremiseSelectionPayload} from './idea-discovery-contract';
import {premiseGenreFitCatalog,premiseGenreEvidenceCatalog,resolvePremiseGenreEvidence,premiseGenreFitIssues,materializePremiseGenreFit} from './premise-genre-fit';
import {premiseSourceComparisonCatalog,materializePremiseSourceReview,premiseSelectionReviewIssues,premiseReselectionPlan} from './premise-selection-review';
import {premiseSourceBatches,mergePremiseSourceBatches} from './premise-source-batches';
const selection=()=>normalizePremiseSelectionPayload({pool:['A','B','C','D','E'].map(premiseId=>({premiseId,workingTitle:'题材'+premiseId,storyCore:'退伍人员守摊，以既有证据对抗不合理逼迁并承担身份曝光代价'+premiseId})),selectedPremises:['A','B','C','D','E'].map(premiseId=>({premiseId,...Object.fromEntries(SELECTED_PREMISE_FIELDS.filter(k=>k!=='differentiation').map(k=>[k,'退伍人员主动守摊，在听证会公开身份并承担旧案调查代价'+premiseId]))}))},5,5);
const genres=['扮猪吃虎','系统流','都市战神'];
const fit=(batch:ReturnType<typeof selection>)=>({genreChecks:premiseGenreFitCatalog(batch,genres).map(row=>({ref:row.ref,status:'fulfilled',field:'protagonistSituation',quote:batch.selected.find(p=>p.premiseId===row.premiseId)!.protagonistSituation,reason:'测试协议：该字段包含本次待核查的人物行动事实'}))});
describe('manual genre proof contract',()=>{
 it('binds selected-premise references to exact server text without requiring quote copying',()=>{
  const batch=selection(),value=fit(batch) as any;
  for(const row of value.genreChecks){row.evidenceRef=row.ref.split('.')[0]+'.protagonistSituation';delete row.field;delete row.quote;}
  expect(premiseGenreFitIssues(value,batch,genres)).toEqual([]);
  const resolved=resolvePremiseGenreEvidence(value,batch);
  expect(resolved.genreChecks[0].quote).toBe(batch.selected[0].protagonistSituation);
  expect(premiseGenreEvidenceCatalog(batch).some(row=>row.field==='storyCore')).toBe(false);
  expect(value.genreChecks[0].quote).toBeUndefined();
 });
 it('rejects wrong-card, unknown and pool references even if a plausible quote is supplied',()=>{
  const batch=selection();for(const evidenceRef of ['S2.protagonistSituation','S1.storyCore','S1.missing']){
   const value=fit(batch) as any;value.genreChecks[0].evidenceRef=evidenceRef;
   expect(premiseGenreFitIssues(value,batch,genres).length).toBeGreaterThan(0);
  }
 });
 it('retains actual missing and unknown states under numbered evidence',()=>{
  const batch=selection(),value=fit(batch) as any;value.genreChecks[0]={ref:'S1.genre1',status:'missing',reason:'当前隐藏能力没有改变任何误判与人物行动选择'};
  expect(materializePremiseGenreFit(value,batch,genres)[0].kind).toBe('selection_fit');
  value.genreChecks[0].status='unknown';expect(materializePremiseGenreFit(value,batch,genres)).toEqual([expect.objectContaining({kind:'selection_fit',reason:expect.stringContaining('未确认')})]);
 });
 it('requires every chosen genre on every card, rejecting omissions, duplicates and wrong-card evidence',()=>{
  const batch=selection(),value=fit(batch);expect(value.genreChecks).toHaveLength(15);
  expect(premiseGenreFitIssues({},batch,genres).length).toBeGreaterThan(0);
  value.genreChecks.pop();expect(premiseGenreFitIssues(value,batch,genres).length).toBeGreaterThan(0);
  const duplicate=fit(batch);duplicate.genreChecks[1]=duplicate.genreChecks[0];expect(premiseGenreFitIssues(duplicate,batch,genres).length).toBeGreaterThan(0);
  const wrong=fit(batch);wrong.genreChecks[0].quote=batch.selected[1].protagonistSituation;expect(premiseGenreFitIssues(wrong,batch,genres).length).toBeGreaterThan(0);
 });
 it('keeps missing genre defects through source batch merge and routes them to the existing bounded repair',()=>{
  const original=selection(),batches=premiseSourceBatches(original);
  const reviews=batches.map(batch=>{const source=materializePremiseSourceReview({sourceChecks:premiseSourceComparisonCatalog(batch).map(row=>({ref:row.ref,status:'preserved',reason:'来源字段与原池所述行动方向和后果保持兼容'}))},batch);const raw=fit(batch);raw.genreChecks[1].status='missing';raw.genreChecks[1].reason='故事只有现实听证会，没有系统触发或奖励机制';source.issues.push(...materializePremiseGenreFit(raw,batch,genres));source.genreChecks=raw.genreChecks;source.passed=false;return source;});
  const merged=mergePremiseSourceBatches(original,batches,reviews);
  expect(merged.genreChecks).toHaveLength(15);expect(merged.genreChecks!.at(-1)!.ref).toBe('S5.genre3');expect(merged.passed).toBe(false);expect(merged.issues.map(i=>i.premiseId)).toEqual(['A','D']);
  expect(merged.issues.every(i=>i.kind==='selection_fit')).toBe(true);
  expect(premiseSelectionReviewIssues(merged,original)).toEqual([]);
  expect(premiseReselectionPlan(original,merged).repairSlots.map(s=>s.replacesPremiseId)).toEqual(['A','D']);
 });
 it('blocks unknown conclusions without fabricating a story conflict; random selection needs no manual proofs',()=>{
  const batch=selection(),value=fit(batch);value.genreChecks[0].status='unknown';
  expect(materializePremiseGenreFit(value,batch,genres)).toEqual([expect.objectContaining({kind:'selection_fit',reason:expect.stringContaining('未确认')})]);expect(materializePremiseGenreFit({},batch,[])).toEqual([]);
 });
 it('cannot accept preserved source checks without the new fit proofs',async()=>{
  const batch=premiseSourceBatches(selection())[0],c=Object.create(ChainController.prototype) as any;
  c.llmCallWithRetry=vi.fn(async(_label:string,prompt:string,options:any)=>{expect(prompt).toContain('每卡须全部落实');const value={sourceChecks:premiseSourceComparisonCatalog(batch).map(row=>({ref:row.ref,status:'preserved',reason:'来源字段与原池所述行动方向和后果保持兼容'}))};expect(options.validate(value)).toBe(false);return {data:value};});
  await expect(c.reviewPremiseSelection(batch,'手动选择全部流派','source_drift',{remaining:1},true,genres)).rejects.toThrow('逐卡逐项');
 });
});
describe('bounded complete-card review batches',()=>{
 const cards=Array.from({length:5},(_,i)=>({title:'完整卡'+i}));
 function fixture(){const c=Object.create(ChainController.prototype) as any,calls:any[]=[];const original=c.reviewIdeaPresentation;
 c.reviewIdeaPresentation=vi.fn(async(batch:any[],refs:any[],note:string,budget:any)=>{if(batch.length>2)return original.call(c,batch,refs,note,budget);budget.remaining--;calls.push({batch,refs});return batch.map((card,index)=>({position:index+1,title:card.title,readerGoals:{click:{evidenceRef:'C'+(index+1)+'.hook'}},platformFit:card.title!=='完整卡0',issues:card.title==='完整卡0'?['未落实系统流']:[]}));});return {c,calls};}
 it('splits five into 2+2+1, retains all peers for comparison and preserves negative verdicts',async()=>{
  const {c,calls}=fixture(),budget={remaining:3},result=await c.reviewIdeaPresentation(cards,[],'',budget);
  expect(calls.map(x=>x.batch.length)).toEqual([2,2,1]);expect(budget.remaining).toBe(0);
  for(const call of calls)expect([...call.batch,...call.refs].map(x=>x.title).sort()).toEqual(cards.map(x=>x.title).sort());
  expect(result.map((x:any)=>x.position)).toEqual([1,2,3,4,5]);expect(result[0].platformFit).toBe(false);expect(result[4].readerGoals.click.evidenceRef).toBe('C5.hook');
 });
 it('does not start paid review if the remaining allowance cannot cover every batch',async()=>{
  const {c,calls}=fixture();await expect(c.reviewIdeaPresentation(cards,[],'',{remaining:2})).rejects.toThrow('预算不足以覆盖');expect(calls).toHaveLength(0);
 });
});

describe('source batches through the production JSON retry helper',()=>{
 function fixture(broken=false){
  const original=selection(),batches=premiseSourceBatches(original),parent={remaining:2};
  const c=Object.create(ChainController.prototype) as any;
  c.logger={warn:vi.fn(),error:vi.fn(),log:vi.fn()};let index=0;
  c.realLLM={generate:vi.fn(async(request:any)=>{
   expect(request.physicalCallBudget.remaining).toBe(1);
   request.physicalCallBudget.remaining--;
   const batch=batches[index++],value:any={payoffChecks:batch.selected.map((_,index)=>({ref:'S'+(index+1)+'.payoff',status:'supported',actionEvidenceRef:'S'+(index+1)+'.activeChoice',reversalCheck:{status:'supported',actionEvidenceRef:'S'+(index+1)+'.activeChoice',reason:'人物已有实际选择与因果条件支撑反转变化'},reason:'逐项核对既定行动与必要条件后确认结果成立'})),sourceChecks:premiseSourceComparisonCatalog(batch).map(row=>({ref:row.ref,status:'preserved',reason:'原池明确行动和当前展开事件及后果可同时成立'})),...fit(batch)};
   value.genreChecks=value.genreChecks.map(({field,quote,...row}:any)=>({...row,evidenceRef:row.ref.split('.')[0]+'.'+field}));
   if(broken)value.genreChecks[0].evidenceRef='S1.storyCore';
   return {content:JSON.stringify(value)};
  })};return {c,original,parent};
 }
 it('executes both batches with exact evidence and the shared two-call cap',async()=>{
  const {c,original,parent}=fixture();
  const result=await c.reviewPremiseSelection(original,'全部手动流派真实约束','source_drift',parent,false,genres);
  expect(result.passed).toBe(true);expect(result.genreChecks).toHaveLength(15);
  expect(result.genreChecks.at(-1).evidenceRef).toBe('S5.protagonistSituation');
  expect(parent.remaining).toBe(0);expect(c.realLLM.generate).toHaveBeenCalledTimes(2);
 });
 it('does not retry using a concurrently started peer batch allowance or return a partial pass',async()=>{
  const {c,original,parent}=fixture(true);
  await expect(c.reviewPremiseSelection(original,'全部手动流派真实约束','source_drift',parent,false,genres)).rejects.toThrow('S1.genre1');
  expect(c.realLLM.generate).toHaveBeenCalledTimes(2);expect(parent.remaining).toBe(0);
 });
});
