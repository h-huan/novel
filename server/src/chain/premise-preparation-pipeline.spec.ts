import {afterEach,describe,expect,it,vi} from 'vitest';
import {ChainController} from './chain.controller';
import {SELECTED_PREMISE_FIELDS,normalizePremiseSelectionPayload} from './idea-discovery-contract';
import {premiseSourceComparisonCatalog} from './premise-selection-review';
import * as budgets from '../config/generation-budgets';
import * as concurrency from './discovery-concurrency';
import { independentOutcomeStubReceipts } from './premise-payoff-review.fixture';
const fixture=()=>normalizePremiseSelectionPayload({pool:['A','B','C','D','E','F'].map(premiseId=>({premiseId,workingTitle:'题材'+premiseId,storyCore:'我打开堵住库房的旧木箱，保留已确认的真实行动与结果。'+premiseId})),selectedPremises:['A','B','C','D','E','F'].map(premiseId=>({premiseId,...Object.fromEntries(SELECTED_PREMISE_FIELDS.filter(f=>f!=='differentiation').map(f=>[f,'原题材的真实行动和结果边界'+f+premiseId])),activeChoice:'我打开堵住库房的旧木箱并将其推到门外。'+premiseId,reversalEffect:'库房入口已经腾空，可以进入取出工具。'+premiseId,payoff:'我拿到了库房工具，完成自己的修理。'+premiseId}))},6,6);
const report=(batch:any)=>({sourceChecks:premiseSourceComparisonCatalog(batch).map(row=>({ref:row.ref,status:'preserved',reason:'当前原文保持原池确认行动及结果的范围'})),payoffChecks:batch.selected.map((_:any,i:number)=>({ref:'S'+(i+1)+'.payoff',status:'supported',unmappedChecks:independentOutcomeStubReceipts(batch,i),actionEvidenceRef:'S'+(i+1)+'.activeChoice',reversalCheck:{status:'supported',actionEvidenceRef:'S'+(i+1)+'.activeChoice',reason:'实际清空入口的动作支持当前直接结果'},reason:'逐项核对同一行动实际造成的日常直接结果'}))});
const tick=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
afterEach(()=>vi.restoreAllMocks());
describe('premise citation preparation pipeline',()=>{
 it.each([false,true])('starts ready source groups and overlap while one index waits; removed=%s',async removed=>{
  vi.spyOn(budgets,'readGenerationBudgets').mockReturnValue({...budgets.GENERATION_BUDGET_DEFAULTS,sourceBatchSize:2,reviewGroupingMode:1});vi.spyOn(concurrency,'adaptiveDiscoveryConcurrency').mockImplementation(n=>Math.max(1,Math.min(8,n)));
  const initial=fixture(),final={...initial,selected:initial.selected.filter(item=>!removed||item.premiseId!=='A')};let release!:(value:any)=>void;const pending=new Promise<any>(resolve=>release=resolve);let settled=false;const prepare={pendingIds:new Set(['A']),resolve:vi.fn(()=>pending)};
  const c:any=Object.create(ChainController.prototype);c.logger={log:vi.fn(),warn:vi.fn()};const started:string[][]=[];let pairsStarted=false;
  c.llmCallWithRetry=vi.fn(async(_label:string,prompt:string,options:any)=>{options.physicalCallBudget.remaining--;if(options.stepKey==='idea_premise_overlap_review'){pairsStarted=true;const data={passed:true,issues:[],outcomeChecks:initial.selected.map(item=>({premiseId:item.premiseId,status:'supported',claimQuote:String(item.payoff),priorQuote:String(item.activeChoice),reason:'已发生的取出库房工具动作与结果直接相连，真实效力仍由原有独立语义审核负责'}))};expect(options.validate(data)).toBe(true);return {data,warnings:[]};}
   const items=JSON.parse(prompt.split('【待锁定已选胚子】')[1].split('\n')[0]);const ids=items.map((item:any)=>item.premiseId);if(ids.includes('A'))expect(settled).toBe(true);started.push(ids);const data=report({...initial,selected:initial.selected.filter(item=>ids.includes(item.premiseId))});expect(options.validate(data)).toBe(true);return {data,warnings:[]};});
  const shared={reviews:{remaining:8},reselection:{remaining:2}},approved=vi.fn();
  const run=c.reconcilePremiseSelection(initial,6,6,[],'既定标准',[],shared,5,approved,undefined,prepare);
  await tick();expect(pairsStarted).toBe(true);expect(started.length).toBeGreaterThan(0);expect(started.flat()).not.toContain('A');expect(approved.mock.calls.length).toBeGreaterThan(0);
  settled=true;release(final);const result=await run;
  expect(result.selected.map((x:any)=>x.premiseId)).toEqual(final.selected.map(x=>x.premiseId));expect(started.flat().sort()).toEqual(final.selected.map(x=>x.premiseId).sort());expect(started).toHaveLength(3);expect(shared.reviews.remaining).toBe(4);expect(shared.reselection.remaining).toBe(2);expect(c.llmCallWithRetry).toHaveBeenCalledTimes(4);
 });
 it('drains completed peers when pending index preparation fails without dispatching its source group',async()=>{
  vi.spyOn(budgets,'readGenerationBudgets').mockReturnValue({...budgets.GENERATION_BUDGET_DEFAULTS,sourceBatchSize:2,reviewGroupingMode:1});vi.spyOn(concurrency,'adaptiveDiscoveryConcurrency').mockImplementation(n=>Math.max(1,Math.min(8,n)));
  const initial=fixture();let reject!:(error:Error)=>void;const pending=new Promise<any>((_resolve,no)=>reject=no);const c:any=Object.create(ChainController.prototype);const seen:string[]=[];c.llmCallWithRetry=vi.fn(async(_label:string,prompt:string,options:any)=>{options.physicalCallBudget.remaining--;const items=JSON.parse(prompt.split('【待锁定已选胚子】')[1].split('\n')[0]);seen.push(...items.map((x:any)=>x.premiseId));return {data:report({...initial,selected:initial.selected.filter(item=>items.some((x:any)=>x.premiseId===item.premiseId))}),warnings:[]};});
  const task=c.reviewPremiseSelection(initial,'既定标准','source_drift',{remaining:6},false,[],undefined,undefined,undefined,{pendingIds:new Set(['A']),resolve:()=>pending});const observed=expect(task).rejects.toThrow('原索引未完成');await tick();expect(seen.length).toBeGreaterThan(0);reject(Error('原索引未完成'));await observed;expect(seen).not.toContain('A');
 });
});
