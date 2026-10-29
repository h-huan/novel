import {it,expect,vi} from 'vitest';
import {ChainController} from './chain.controller';
import {premisePayoffReviewIssues,materializePremisePayoffReview,premisePayoffReviewDirective,quarantineUnprovenReversalEvidence} from './premise-payoff-review';
import {retainReviewedPremises,premiseReselectionPlan} from './premise-selection-review';
import { PREMISE_PAYOFF_REVIEW_POLICY, PREMISE_REPLACEMENT_COMPARISON_POLICY } from '../../shared/src/system-workflow-rules.registry';
import { standardDirectiveCache } from '../modules/module-standards/standard-directive.cache';
const selection={pool:[{premiseId:'P1',storyCore:'她通过已有录音报案，并承担失去工作的代价。'}],selected:[{premiseId:'P1',activeChoice:'她留下录音并向警方报告具体地点。',escalation:'受害人提供已有资料，警方核实现场情况。',payoff:'警方到场解救被困的人，她失去工作。'}],poolTargetMet:true};
const supported={ref:'S1.payoff',status:'supported',actionEvidenceRef:'S1.activeChoice',conditionEvidenceRef:'S1.escalation',reason:'已提供现场地点并由警方核实后到场解救'};
it('does not reuse a claimed capture as its own prior reversal action when the plan only concludes a later reward',()=>{
 const item={...selection.selected[0],reversalEffect:'第三夜对手在后山取走旧批货物，被负责人当场截住并指认。',
  payoff:'主角被调入核心部门，从此失去原有清净生活。',
  causalPlan:[{action:{field:'reversalEffect',quote:'第三夜对手在后山取走旧批货物，被负责人当场截住'},
   conditions:[{field:'escalation',quote:selection.selected[0].escalation}],
   result:{field:'payoff',quote:'主角被调入核心部门'}}]};
 const input={...selection,selected:[item]},row={...supported,actionEvidenceRef:'S1.reversalEffect',
  reversalCheck:{status:'supported',actionEvidenceRef:'S1.reversalEffect',reason:'负责人到场截住并指认，因此反转已经成立'},
  links:[{ref:'S1.causalPlan[0]',status:'supported',reason:'先被当场截住，之后主角获得新的岗位'}]};
 expect(premisePayoffReviewIssues({payoffChecks:[row]},input).join('')).toContain('不能用结果自证');
 const normalized=quarantineUnprovenReversalEvidence({payoffChecks:[row]},input);
 expect(materializePremisePayoffReview(normalized,input)[0]).toMatchObject({premiseId:'P1',protocolIncomplete:true});
});
it('reuses existing exact causal action in reversalEffect without an invented second quotation',()=>{
 const candidate={...selection.selected[0],
  reversalEffect:'我把原始文件交给窗口，工作人员核验身份后暂停登记。',
  causalPlan:[
   {action:{field:'reversalEffect',quote:'我把原始文件交给窗口'},conditions:[],
    result:{field:'reversalEffect',quote:'工作人员核验身份后暂停登记'}},
   {action:{field:'reversalEffect',quote:'工作人员核验身份后暂停登记'},conditions:[],
    result:{field:'payoff',quote:selection.selected[0].payoff}},
  ]};
 const input={...selection,selected:[candidate]};
 const row={...supported,reversalCheck:{status:'supported' as const,
   actionEvidenceRef:'S1.reversalEffect',reason:'文件已交给窗口，随后工作人员核验并暂停登记'},
   links:candidate.causalPlan.map((_,i)=>({ref:`S1.causalPlan[${i}]`,status:'supported',
     reason:'逐环节核对实际行动和发生条件'}))};
 expect(premisePayoffReviewIssues({payoffChecks:[row]},input)).toEqual([]);
 const wrong={...candidate,causalPlan:[{...candidate.causalPlan[0],action:{field:'reversalEffect',
   quote:'工作人员核验身份后暂停登记'}},candidate.causalPlan[1]]};
 expect(premisePayoffReviewIssues({payoffChecks:[row]}, {...input,selected:[wrong]}).length).toBeGreaterThan(0);
 const withoutPlan={...candidate,causalPlan:[{...candidate.causalPlan[0],action:{field:'activeChoice',
   quote:candidate.activeChoice}},candidate.causalPlan[1]]};
 const resultOnly={...row,reversalCheck:{...row.reversalCheck,actionEvidenceQuote:'工作人员核验身份后暂停登记'}};
 expect(premisePayoffReviewIssues({payoffChecks:[resultOnly]},input).join('')).toContain('不能用结果自证');
 expect(premisePayoffReviewIssues({payoffChecks:[{...row,
   reversalCheck:{...row.reversalCheck,actionEvidenceQuote:undefined}}]},input)).toEqual([]);
});
it('isolates one unprovable reversal citation without approving it or losing its independently vetted peer',()=>{
 const first={...selection.selected[0],premiseId:'P1',reversalEffect:'检查完成以后，公司宣布所有订单恢复。'};
 const second={...selection.selected[0],premiseId:'P2',reversalEffect:'报告地点后，值班人员确认现场并派人到场。'};
 const input={...selection,pool:[{...selection.pool[0],premiseId:'P1'},{...selection.pool[0],premiseId:'P2'}],selected:[first,second]};
 const checks={payoffChecks:[
   {...supported,ref:'S1.payoff',reversalCheck:{status:'supported',actionEvidenceRef:'S1.reversalEffect',reason:'公司称已恢复订单，但没有独立行动锚点'}},
   {...supported,ref:'S2.payoff',actionEvidenceRef:'S2.activeChoice',conditionEvidenceRef:'S2.escalation',
     reversalCheck:{status:'supported',actionEvidenceRef:'S2.activeChoice',reason:'主角提出报告并促使值班人员核实和派人'}}]};
 const normalized=quarantineUnprovenReversalEvidence(checks,input);
 expect(checks.payoffChecks[0].status).toBe('supported');
 expect(normalized.payoffChecks.map((row:any)=>row.status)).toEqual(['unknown','supported']);
 expect(premisePayoffReviewIssues(normalized,input)).toEqual([]);
 expect(materializePremisePayoffReview(normalized,input)).toEqual([expect.objectContaining({kind:'selection_fit',premiseId:'P1',repairMode:'replace_from_pool'})]);
 expect(quarantineUnprovenReversalEvidence(normalized,input)).toEqual(normalized);
 expect(quarantineUnprovenReversalEvidence({payoffChecks:[null]},input)).toEqual({payoffChecks:[null]});
});
it('audits reversal success independently from later costs within the existing payoff Gate',()=>{
 const input={...selection,selected:[{...selection.selected[0],
   reversalEffect:'警方核实收到的录音和具体地点后实际到场，解救了被困人员。'}]};
 const ok={...supported,reversalCheck:{status:'supported',actionEvidenceRef:'S1.activeChoice',
   reason:'主角交付录音和地点，警方核对之后实际到场救人，形成具体行动条件'}};
 expect(premisePayoffReviewIssues({payoffChecks:[supported]},input).join('')).toContain('反转阶段');
 expect(premisePayoffReviewIssues({payoffChecks:[ok]},input)).toEqual([]);
 expect(premisePayoffReviewIssues({payoffChecks:[{...ok,reversalCheck:{...ok.reversalCheck,actionEvidenceRef:'S1.reversalEffect'}}]},input).join('')).toContain('逐字锚点');
 const inReversal={...ok,reversalCheck:{...ok.reversalCheck,actionEvidenceRef:'S1.reversalEffect',
   actionEvidenceQuote:'警方核实收到的录音和具体地点后实际到场'}};
 expect(premisePayoffReviewIssues({payoffChecks:[inReversal]},input)).toEqual([]);
 expect(premisePayoffReviewIssues({payoffChecks:[{...ok,reversalCheck:{status:'gap',reason:'客户签约缺少真实承诺及决定依据'}}]},input).join('')).toContain('整体不得通过');
 const bad={...input,selected:[{...input.selected[0],
   reversalEffect:'只发现机器故障，没获得配件也没试机，却声称已经恢复交货并得到续单。'}]};
 const gap={...ok,status:'gap',gapRepair:'replace_from_pool',reversalCheck:{status:'gap',
   reason:'缺少正确配件取得、装配与试机，尚不足以支持恢复交货'}};
 const failures=materializePremisePayoffReview({payoffChecks:[gap]},bad);
 expect(failures).toHaveLength(1);
 expect(failures[0].quote).toBe(bad.selected[0].reversalEffect);
 expect(failures[0].reason).toContain('缺少正确配件取得、装配与试机');
 expect(premisePayoffReviewDirective(input)).toContain('不能只审payoff段');
});
it('requires an independent payoff verdict even when every source check is preserved',()=>{
 expect(premisePayoffReviewIssues({sourceChecks:[]},selection)).toEqual([expect.stringContaining('payoffChecks')]);
 expect(premisePayoffReviewIssues({payoffChecks:[supported]},selection)).toEqual([]);
 expect(premisePayoffReviewDirective(selection)).toContain('不把结局声称');
 expect(premisePayoffReviewDirective(selection)).toContain('对象、数量和时间跨度');
 expect(premisePayoffReviewDirective(selection)).toContain('未来可能获得的资格');
 expect(premisePayoffReviewDirective(selection)).toContain('不能替故事补出未写的补救行动');
});
it.each([{...supported,actionEvidenceRef:'S2.activeChoice'},{...supported,actionEvidenceRef:'S1.payoff'},{...supported,actionEvidenceRef:'S1.differentiation'},{...supported,conditionEvidenceRef:'S1.nonexistent'},{...supported,actionEvidenceRef:undefined}])('rejects wrong-card, result-only, absent and missing action references',row=>{
 expect(premisePayoffReviewIssues({payoffChecks:[row]},selection).length).toBeGreaterThan(0);
});
it.each([false,true])('starts both production preselection reviews and drains the peer before returning (failure=%s)',async fail=>{
 const pair={...selection,selected:[selection.selected[0],{...selection.selected[0],premiseId:'P2'}]};
 const controller=Object.create(ChainController.prototype) as any,started:string[]=[],releases:Record<string,()=>void>={},limiters:unknown[]=[];
 controller.reviewPremiseSelection=vi.fn(async(candidate:any,_standard:string,mode:string,_budget:unknown,_batch:boolean,_genres:unknown,limiter:unknown)=>{
   expect(candidate).toBe(pair);limiters.push(limiter);started.push(mode);
   await new Promise<void>(resolve=>{releases[mode]=resolve;});
   if(fail&&mode==='source_drift')throw Error('source protocol incomplete');
   return {passed:true,issues:[]};
 });
 let done=false;const result=controller.reconcilePremiseSelection(pair,2,2,[],'').then((value:any)=>{done=true;return value;},(error:Error)=>{done=true;return error;});
 expect(started).toEqual(['source_drift','overlap']);expect(limiters[0]).toBe(limiters[1]);
 releases.source_drift();await new Promise(resolve=>setTimeout(resolve,0));expect(done).toBe(false);
 releases.overlap();const value=await result;
 if(fail)expect(value.message).toContain('未生成完整卡');else expect(value.selected).toBe(pair.selected);
 expect(controller.reviewPremiseSelection).toHaveBeenCalledTimes(2);
});
it('routes a real gap to preselection and never retains an unqualified item as locked',()=>{
 const raw={payoffChecks:[{ref:'S1.payoff',status:'gap',gapRepair:'replace_from_pool',reason:'账目没有取得来源，警方也没有实际现场定位依据'}]};
 const issues=materializePremisePayoffReview(raw,selection);
 expect(issues).toHaveLength(1);expect(issues[0].kind).toBe('selection_fit');
 expect(issues[0].repairMode).toBe('replace_from_pool');
 const plan=premiseReselectionPlan(selection,{passed:false,issues});
 expect(plan.repairSlots[0].mode).toBe('replace_from_pool');
 expect(plan.availableCandidates).toEqual([]);
 expect(retainReviewedPremises(selection,{passed:false,issues}).selection.selected).toHaveLength(0);
 expect(raw.payoffChecks[0].status).toBe('gap');
 expect(materializePremisePayoffReview({payoffChecks:[{...supported,status:'unknown',reason:'兑现真实条件尚未获得独立确认'}]},selection)).toEqual([expect.objectContaining({kind:'selection_fit',premiseId:'P1',repairMode:'replace_from_pool'})]);
});
it('permits restoring an omitted condition only with real same-ID original-pool evidence',()=>{
 const raw={...supported,status:'gap',gapRepair:'restore_source_conditions',
  sourceConditionQuote:'她通过已有录音报案',reason:'展开遗漏原池已有录音报案这一实际证据取得和交付条件'};
 const issues=materializePremisePayoffReview({payoffChecks:[raw]},selection);
 expect(issues[0].repairMode).toBeUndefined();
 expect(premiseReselectionPlan(selection,{passed:false,issues}).repairSlots[0].mode).toBe('correct_or_replace_from_pool');
 for(const sourceConditionQuote of [undefined,'警方回队调取原池没有的门禁刷卡记录','已有录音']){
  expect(premisePayoffReviewIssues({payoffChecks:[{...raw,sourceConditionQuote}]},selection).length).toBeGreaterThan(0);
 }
 expect(premisePayoffReviewIssues({payoffChecks:[{...raw,status:'supported'}]},selection).length).toBeGreaterThan(0);
 expect(premisePayoffReviewDirective(selection)).toContain('sourceConditionQuote');
});
it('allows an actual independent condition in payoff outside the generator index, but does not prove story semantics',()=>{
 const p={...selection.selected[0],payoff:'她把录音交给值班人员，值班人员核验来访登记后通知警员到场。警方暂停处理。',
  causalPlan:[{action:{field:'activeChoice',quote:selection.selected[0].activeChoice},conditions:[],result:{field:'payoff',quote:'警方暂停处理。'}}]};
 const input={...selection,selected:[p]},row={...supported,conditionEvidenceRef:'S1.payoff',conditionEvidenceQuote:'值班人员核验来访登记后通知警员到场',links:[{ref:'S1.causalPlan[0]',status:'supported',reason:'核验登记并通知警员是实际写出的条件'}]};
 expect(premisePayoffReviewIssues({payoffChecks:[row]},input)).toEqual([]);
 for(const quote of [undefined,'警方暂停处理。','暂停处理',p.payoff,'另一题材才有的证据']){
  expect(premisePayoffReviewIssues({payoffChecks:[{...row,conditionEvidenceQuote:quote}]},input).length).toBeGreaterThan(0);
 }
 const rejected={...row,status:'gap',gapRepair:'replace_from_pool',reason:'尽管该行动存在，仍缺少另一项决定性证据'};
 expect(materializePremisePayoffReview({payoffChecks:[rejected]},input)).toHaveLength(1);
 expect(rejected.status).toBe('gap');
});

it('renders every required causal link inside the final payoff JSON example', () => {
  const candidate = { ...selection.selected[0], causalPlan: [
    { action: {field:'activeChoice',quote:selection.selected[0].activeChoice}, conditions: [], result:{field:'payoff',quote:selection.selected[0].payoff} },
    { action: {field:'escalation',quote:selection.selected[0].escalation}, conditions: [], result:{field:'payoff',quote:selection.selected[0].payoff} },
  ] };
  const prompt = premisePayoffReviewDirective({...selection,selected:[candidate]});
  const example = JSON.parse(prompt.split('形状为')[1].split('。证据编号')[0]);
  expect(example.links.map((row:any)=>row.ref)).toEqual(['S1.causalPlan[0]','S1.causalPlan[1]']);
  expect(example.links.every((row:any)=>row.status==='supported|gap|unknown' && row.reason.length>=8)).toBe(true);
});

it('uses the single GEN-002 authority contract before full-card generation instead of repeating it in the task prompt',()=>{
 standardDirectiveCache.rebuild();
 const authoritative=standardDirectiveCache.get('idea_generate','idea_premise_source_drift_review');
 const task= premisePayoffReviewDirective(selection);
 expect(PREMISE_PAYOFF_REVIEW_POLICY).toContain('报备不等于获准实施');
 expect(PREMISE_PAYOFF_REVIEW_POLICY).toContain('离岗者不自动具有操作权限');
 expect(authoritative).toContain(PREMISE_PAYOFF_REVIEW_POLICY);
 expect(PREMISE_PAYOFF_REVIEW_POLICY).toContain('指认具体下毒者、造假者或操纵者');
 expect(PREMISE_PAYOFF_REVIEW_POLICY).toContain('发现毒物、异常材料、毁证动机仅证明异常存在');
 expect(PREMISE_PAYOFF_REVIEW_POLICY).toContain('原池与展开都缺归责桥接时判gap');
 expect(task).not.toContain('发现毒物、异常材料、毁证动机仅证明异常存在');
 const replacementDirective=standardDirectiveCache.get('idea_generate','idea_premise_pool_reselection');
 expect(replacementDirective).toContain(PREMISE_REPLACEMENT_COMPARISON_POLICY);
 expect(replacementDirective).toContain('GEN-002');
 expect(task).toContain('按已注入GEN-002的兑现必要条件合同');
 expect(task).not.toContain('报备不等于获准实施');
 const gap={...supported,status:'gap',gapRepair:'replace_from_pool',reason:'仅有报备行为，缺少有权人员实际启动和审批的必要桥接'};
 const failures=materializePremisePayoffReview({payoffChecks:[gap]},selection);
 expect(failures).toHaveLength(1);
 expect(premiseReselectionPlan(selection,{passed:false,issues:failures}).repairSlots[0].mode).toBe('replace_from_pool');
 expect(materializePremisePayoffReview({payoffChecks:[supported]},selection)).toEqual([]);
});
it('requires existing independent payoff review to check evidence delivery to an authorized decision-maker',()=>{
 const prompt=premisePayoffReviewDirective(selection);
 expect(prompt).toContain('谁实际交付、谁接收');
 expect(prompt).toContain('能录到内容不等于取得受他人控制的原件');
 expect(prompt).toContain('实际取得或获准复制、保全不被撤销、移交接收');
 expect(prompt).toContain('原池和展开都漏掉这道决定性桥接时整体应为gap');
 expect(prompt).toContain('不能仅核对作者自行列出的环节');
});
