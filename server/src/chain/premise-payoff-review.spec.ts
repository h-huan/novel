import {it,expect,vi} from 'vitest';
import {ChainController} from './chain.controller';
import {premisePayoffReviewIssues,materializePremisePayoffReview,premisePayoffReviewDirective} from './premise-payoff-review';
import {retainReviewedPremises} from './premise-selection-review';
const selection={pool:[{premiseId:'P1',storyCore:'她通过已有录音报案，并承担失去工作的代价。'}],selected:[{premiseId:'P1',activeChoice:'她留下录音并向警方报告具体地点。',escalation:'受害人提供已有资料，警方核实现场情况。',payoff:'警方到场解救被困的人，她失去工作。'}],poolTargetMet:true};
const supported={ref:'S1.payoff',status:'supported',actionEvidenceRef:'S1.activeChoice',conditionEvidenceRef:'S1.escalation',reason:'已提供现场地点并由警方核实后到场解救'};
it('requires an independent payoff verdict even when every source check is preserved',()=>{
 expect(premisePayoffReviewIssues({sourceChecks:[]},selection)).toEqual([expect.stringContaining('payoffChecks')]);
 expect(premisePayoffReviewIssues({payoffChecks:[supported]},selection)).toEqual([]);
 expect(premisePayoffReviewDirective(selection)).toContain('不把结局声称');
});
it.each([{...supported,actionEvidenceRef:'S2.activeChoice'},{...supported,actionEvidenceRef:'S1.payoff'},{...supported,actionEvidenceRef:'S1.differentiation'},{...supported,conditionEvidenceRef:'S1.nonexistent'},{...supported,actionEvidenceRef:undefined}])('rejects wrong-card, result-only, absent and missing action references',row=>{
 expect(premisePayoffReviewIssues({payoffChecks:[row]},selection).length).toBeGreaterThan(0);
});
it.each([false,true])('starts both production preselection reviews and drains the peer before returning (failure=%s)',async fail=>{
 const controller=Object.create(ChainController.prototype) as any,started:string[]=[],releases:Record<string,()=>void>={},limiters:unknown[]=[];
 controller.reviewPremiseSelection=vi.fn(async(candidate:any,_standard:string,mode:string,_budget:unknown,_batch:boolean,_genres:unknown,limiter:unknown)=>{
   expect(candidate).toBe(selection);limiters.push(limiter);started.push(mode);
   await new Promise<void>(resolve=>{releases[mode]=resolve;});
   if(fail&&mode==='source_drift')throw Error('source protocol incomplete');
   return {passed:true,issues:[]};
 });
 let done=false;const result=controller.reconcilePremiseSelection(selection,1,1,[],'').then((value:any)=>{done=true;return value;},(error:Error)=>{done=true;return error;});
 expect(started).toEqual(['source_drift','overlap']);expect(limiters[0]).toBe(limiters[1]);
 releases.source_drift();await new Promise(resolve=>setTimeout(resolve,0));expect(done).toBe(false);
 releases.overlap();const value=await result;
 if(fail)expect(value.message).toContain('未生成完整卡');else expect(value.selected).toBe(selection.selected);
 expect(controller.reviewPremiseSelection).toHaveBeenCalledTimes(2);
});
it('routes a real gap to preselection and never retains an unqualified item as locked',()=>{
 const raw={payoffChecks:[{ref:'S1.payoff',status:'gap',reason:'账目没有取得来源，警方也没有实际现场定位依据'}]};
 const issues=materializePremisePayoffReview(raw,selection);
 expect(issues).toHaveLength(1);expect(issues[0].kind).toBe('selection_fit');
 expect(retainReviewedPremises(selection,{passed:false,issues}).selection.selected).toHaveLength(0);
 expect(raw.payoffChecks[0].status).toBe('gap');
 expect(()=>materializePremisePayoffReview({payoffChecks:[{...supported,status:'unknown'}]},selection)).toThrow('未评估');
});
it('allows an actual independent condition in payoff outside the generator index, but does not prove story semantics',()=>{
 const p={...selection.selected[0],payoff:'她把录音交给值班人员，值班人员核验来访登记后通知警员到场。警方暂停处理。',
  causalPlan:[{action:{field:'activeChoice',quote:selection.selected[0].activeChoice},conditions:[],result:{field:'payoff',quote:'警方暂停处理。'}}]};
 const input={...selection,selected:[p]},row={...supported,conditionEvidenceRef:'S1.payoff',conditionEvidenceQuote:'值班人员核验来访登记后通知警员到场',links:[{ref:'S1.causalPlan[0]',status:'supported',reason:'核验登记并通知警员是实际写出的条件'}]};
 expect(premisePayoffReviewIssues({payoffChecks:[row]},input)).toEqual([]);
 for(const quote of [undefined,'警方暂停处理。','暂停处理',p.payoff,'另一题材才有的证据']){
  expect(premisePayoffReviewIssues({payoffChecks:[{...row,conditionEvidenceQuote:quote}]},input).length).toBeGreaterThan(0);
 }
 const rejected={...row,status:'gap',reason:'尽管该行动存在，仍缺少另一项决定性证据'};
 expect(materializePremisePayoffReview({payoffChecks:[rejected]},input)).toHaveLength(1);
 expect(rejected.status).toBe('gap');
});
