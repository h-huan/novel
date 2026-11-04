import {causalAuditRepairTargets,applyCausalAuditRepair,causalAuditRepairPrompt} from './causal-review';
import { expect, it } from 'vitest';
import { materializeCausalAuditAnchors, validateCausalAudit } from './causal-review';
import { causalEvidenceAnchors, causalExitResultAnchors } from './causal-review';
import { preserveCausalCountercheckAnchors } from './causal-review';
import { causalChapterResultAnchors, causalChapterResultReviewGroups, expandCausalReviewedResultAliases, bindUniqueCausalResultAnchors } from './causal-review';

it('逐项目录包括场景、人物、状态及伏笔结果，且不把目标或前态当结果', () => {
 const chapters=[{scenes:[{goal:'先帮老人登记',outcome:'记录已在老人手里。药仍未买到。'}],characterActions:[{action:'把编号记在本子上',result:'登记完成'}],characterStates:[{stateBefore:'尚未登记',stateAfter:'登记已有底稿'}],foreshadowingRecover:[{method:'取回原始记录'}]}];
 const anchors=causalEvidenceAnchors(JSON.stringify(chapters),{});
 const results=causalChapterResultAnchors(anchors,0);
 expect(results.some(row=>row.text.includes('老人手里'))).toBe(true);
 expect(results.filter(row=>row.path==='0.scenes.0.outcome')).toHaveLength(2);
 expect(results.map(row=>row.path)).not.toContain('0.scenes.0.goal');
 expect(results.map(row=>row.path)).not.toContain('0.characterStates.0.stateBefore');
 expect(results.map(row=>row.path)).toContain('0.foreshadowingRecover.0.method');
});
it('补齐遗漏结果只继承服务器章号，不允许借协议修复改章号或沿用旧桥接', () => {
 const original={transitions:[{chapterNumber:4,resultAnchorId:'body:v2'}]};
 const errors=['第1项因果审查缺少行动及成立条件'];
 const fixed=applyCausalAuditRepair(original,errors,{repairs:[{index:0,status:'gap',resultAnchorId:'body:v2'}]});
 expect(fixed.transitions[0]).toMatchObject({chapterNumber:4,status:'gap'});
 expect(fixed.transitions[0].bridgeAnchorId).toBeUndefined();
 expect(()=>applyCausalAuditRepair(original,errors,{repairs:[{index:0,chapterNumber:3}]})).toThrow('不能改变');
});

it('retains the verified bridge only for an unchanged supported pair, never for a new gap or state', () => {
 const body = '她递交材料。\n\n调查员接过材料。';
 const row = {chapterNumber: 1, actionAnchorId: 'body:p1', resultAnchorId: 'body:p2', beforeStateAnchorId: 'body:p1',
  bridgeAnchorId: 'body:p1', status: 'supported', reason: '递交使调查员收到所交的材料'};
 const original = materializeCausalAuditAnchors({status:'evaluated',reason:'核对实际直接递交的结果',transitions:[row]},body,{});
 const omitted = {...row,bridgeAnchorId:''};
 expect(preserveCausalCountercheckAnchors(original,{transitions:[omitted]},body,{}).transitions[0].bridgeAnchorId).toBe('body:p1');
 for (const changed of [{...omitted,status:'gap'},{...omitted,beforeStateAnchorId:'body:p2'},{...omitted,resultAnchorId:'body:p1'}])
  expect(preserveCausalCountercheckAnchors(original,{transitions:[changed]},body,{}).transitions[0].bridgeAnchorId).toBe('');
 const invented = {...original,transitions:[{...original.transitions[0],bridgeEvidence:'不存在的条件'}]};
 expect(preserveCausalCountercheckAnchors(invented,{transitions:[omitted]},body,{}).transitions[0].bridgeAnchorId).toBe('');
});

it('addresses every serialized exit clause without changing original value IDs or quotation text', () => {
 const exitState = '订单已完成。她说：“先回去。”他仍被困在屋内。';
 const body = JSON.stringify([{ responsibility: '先完成订单。', exitState }]);
 const anchors = causalEvidenceAnchors(body, {});
 const results = causalExitResultAnchors(anchors, exitState);
 expect(results.length).toBeGreaterThan(1);
 expect(results.map(row => row.text).join('')).toBe(JSON.stringify(exitState).slice(1, -1));
 expect(anchors.find(row => row.id === 'body:v1')?.text).toBe('先完成订单。');
 expect(results.every(row => body.includes(row.text))).toBe(true);
 expect(results.every(row => row.path === '0.exitState')).toBe(true);
 expect(causalExitResultAnchors(anchors, '不存在的结果')).toEqual([]);
});
it('preserves field roles and original IDs for escaped and empty structured values', () => {
 const sources = {project_context: JSON.stringify({meta: {stage:'outline'},worldRules:['门外插销只能从门外移开。'],
  recentState: ['\n', ''],foreshadowing: ['未来才揭晓。']})};
 const anchors = causalEvidenceAnchors('',sources);
 expect(anchors.find(row=>row.id==='project_context:v2')).toMatchObject({path:'worldRules.0',text:'门外插销只能从门外移开。'});
 expect(anchors.find(row=>row.id==='project_context:v3')?.path).toBe('recentState.0');
 expect(anchors.find(row=>row.id==='project_context:v4')?.path).toBe('foreshadowing.0');
});

const content = '她把公开通知改成暂缓处置。执行人接到撤回命令。他获救了。';
const audit = (row: any) => ({ status: 'evaluated', reason: '已核对行动与执行条件', transitions: [row] });
it('retains an explicit future arrangement without demanding proof of an already fulfilled result', () => {
 const body = '她将待明日再提交材料。身份留待后章揭晓。';
 expect(validateCausalAudit(audit({status:'planned',actionEvidence:'她将待明日再提交材料。',
  resultEvidence:'身份留待后章揭晓。',reason:'原文明示留待后章，不是当前已兑现的身份认定'}),body,{}))
  .toMatchObject({verified:true,issues:[]});
 expect(validateCausalAudit(audit({status:'supported',actionEvidence:'她将待明日再提交材料。',
  resultEvidence:'身份留待后章揭晓。',reason:'当前已经完成司法身份认定'}),body,{}).verified).toBe(false);
});
it('段落编号修复保留准确原文，拒绝伪造编号与非正文行动来源',()=>{
  const body='她发出了通知。\n\n“撤回命令。”他说，“先复核。”\n\n他暂缓执行。';
  const row={status:'supported',reason:'执行人收到命令才暂缓执行',actionAnchorId:'body:p1',resultAnchorId:'body:p3',bridgeAnchorId:'body:p2'};
  const fixed=materializeCausalAuditAnchors(audit(row),body,{});
  expect(fixed.transitions[0].bridgeEvidence).toBe('“撤回命令。”他说，“先复核。”');
  expect(validateCausalAudit(fixed,body,{}).verified).toBe(true);
  expect(validateCausalAudit(materializeCausalAuditAnchors(audit({...row,bridgeAnchorId:'body:p99'}),body,{}),body,{}).verified).toBe(false);
  expect(validateCausalAudit(materializeCausalAuditAnchors(audit({...row,actionAnchorId:'chapter_plan:p1'}),body,{chapter_plan:'她将发出通知。'}),body,{}).verified).toBe(false);
});
it('有行动与结果仍不能用伪造的命令证据证明因果完整', () => {
  expect(validateCausalAudit(audit({ status: 'supported', actionEvidence: '她把公开通知改成暂缓处置。',
    resultEvidence: '他获救了。', basisSource: 'body', bridgeEvidence: '法院判他无罪。', reason: '命令撤回所以停止处置' }), content, {}).verified).toBe(false);
});
it('漏掉账目不能以高分或空问题宣称完成审查', () => {
  expect(validateCausalAudit(undefined, content, {}).verified).toBe(false);
  expect(validateCausalAudit({ status: 'evaluated', reason: '因果完整没有任何问题', transitions: [] }, content, {}).verified).toBe(false);
});
it('实际执行条件可验证，缺口自动转换为具有双端证据的待修问题', () => {
  const row = { status: 'supported', actionEvidence: '她把公开通知改成暂缓处置。', resultEvidence: '他获救了。',
    basisSource: 'body', bridgeEvidence: '执行人接到撤回命令。', reason: '命令撤回所以停止处置' };
  expect(validateCausalAudit(audit(row), content, {})).toMatchObject({ verified: true, issues: [] });
  const gap = validateCausalAudit(audit({ ...row, status: 'gap', bridgeEvidence: '', reason: '通知改动尚不能证明执行人停止处置' }), content, {});
  expect(gap.issues[0]).toMatchObject({ issueType: 'causality_gap', evidence: '他获救了。', basisEvidence: '她把公开通知改成暂缓处置。' });
});

it('corrects only invalid causal evidence while retaining a different valid chain and a genuine gap',()=>{
 const body='她发出命令。\n\n执行人接到命令。\n\n他暂缓执行。';const valid={actionEvidence:'她发出命令。',resultEvidence:'他暂缓执行。',bridgeEvidence:'执行人接到命令。',basisSource:'body',status:'supported',reason:'执行人实际收到命令后停止执行'};
 const gap={...valid,status:'gap',bridgeEvidence:'',reason:'原文所声称的停止结果尚缺执行条件'};
 const original={status:'evaluated',reason:'正在定位一项引用错误',transitions:[{...valid,actionEvidence:'不存在的命令引文'},valid,gap]},errors=['第1项因果审查缺少可验证行动、结果或成立条件'];
 expect(causalAuditRepairTargets(original,errors)).toEqual([0]);expect(causalAuditRepairPrompt(original,errors,body,{}).prompt).toContain('本次仅纠正编号[0]');
 expect(causalAuditRepairPrompt(original,errors,body,{}).systemPrompt).toContain('只修复因果审查的引用合同');
 expect(causalAuditRepairPrompt(null,[],body,{}).systemPrompt).toContain('独立审查行动');
 expect(causalAuditRepairPrompt(null,[],body,{}).systemPrompt).not.toContain('只修复因果审查的引用合同');
 const repaired=applyCausalAuditRepair(original,errors,{repairs:[{index:0,actionAnchorId:'body:p1',resultAnchorId:'body:p3',bridgeAnchorId:'body:p2',status:'supported',reason:'实际收到命令后停止执行，无需新增事件'}]});const materialized=materializeCausalAuditAnchors(repaired,body,{});
 expect(materialized.transitions[1]).toEqual(valid);expect(materialized.transitions[2]).toEqual(gap);expect(validateCausalAudit(materialized,body,{})).toMatchObject({verified:true,issues:[{issueType:'causality_gap'}]});
 for(const rows of [[],[{index:1}],[{index:0},{index:0}]])expect(()=>applyCausalAuditRepair(original,errors,{repairs:rows})).toThrow();
});

it('accepts lossless zero-based index strings but rejects ambiguous numeric formats',()=>{
 const original={status:'evaluated',transitions:[{status:'gap'}]},errors=['第1项因果审查缺少可验证行动、结果或成立条件'];
 expect(applyCausalAuditRepair(original,errors,{repairs:[{index:'0',status:'supported'}]}).transitions[0].index).toBe(0);
 for(const index of ['00','+0','0.0',-1,1])expect(()=>applyCausalAuditRepair(original,errors,{repairs:[{index}]})).toThrow();
});

it('retains and repairs decisive outcomes beyond the former six-row sample ceiling', () => {
 const row = { actionEvidence: '她把公开通知改成暂缓处置。', resultEvidence: '他获救了。',
  basisSource: 'body', bridgeEvidence: '执行人接到撤回命令。', status: 'supported', reason: '执行人收到撤回命令后实际停止处置' };
 const original = { status: 'evaluated', reason: '全部关键结果必须保留',
  transitions: [...Array.from({ length: 6 }, () => ({ ...row })), { ...row, bridgeEvidence: '不存在的执行条件' }] };
 const before = validateCausalAudit(original, content, {});
 expect(before.verified).toBe(false);
 expect(causalAuditRepairTargets(original, before.errors)).toEqual([6]);
 const prompt = causalAuditRepairPrompt(original, before.errors, content, {});
 expect(prompt.prompt).toContain('本次仅纠正编号[6]');
 expect(prompt.prompt).not.toContain('最多六项');
 const repaired = applyCausalAuditRepair(original, before.errors, { repairs: [{ index: 6, ...row }] });
 expect(repaired.transitions).toHaveLength(7);
 expect(repaired.transitions.slice(0, 6)).toEqual(original.transitions.slice(0, 6));
 expect(validateCausalAudit(repaired, content, {})).toMatchObject({ verified: true, issues: [] });
});

it('requires each comma-separated outcome while preserving original addresses, quoted lists and conditional context',()=>{
 const outcome='撤议被否，散时无言，原件没再拿出来';
 const chapters=[{scenes:[{outcome}],characterActions:[{result:'他没有再争，也未失去名声。'}],characterStates:[{stateAfter:'她说“甲，乙”，并留下三份副本（红，蓝，白）'}]}];
 const body=JSON.stringify(chapters),anchors=causalEvidenceAnchors(body,{}),results=causalChapterResultAnchors(anchors,0);
 const scene=results.filter(row=>row.path==='0.scenes.0.outcome');
 expect(scene.map(row=>row.text)).toEqual(['撤议被否，','散时无言，','原件没再拿出来']);
 expect(scene.map(row=>row.text).join('')).toBe(outcome);
 expect(anchors.find(row=>row.id==='body:v1')?.text).toBe(outcome);
 expect(results.filter(row=>row.path==='0.characterActions.0.result').map(row=>row.text)).toEqual(['他没有再争，','也未失去名声。']);
 expect(results.filter(row=>row.path==='0.characterStates.0.stateAfter').map(row=>row.text)).toEqual(['她说“甲，乙”，','并留下三份副本（红，蓝，白）']);
 expect(results.every(row=>body.includes(row.text))).toBe(true);
 const exit='如果收到原件，才可办理；副本仍未提交。';
 const inventory=causalExitResultAnchors(causalEvidenceAnchors(JSON.stringify([{exitState:exit}]),{}),exit);
 expect(inventory.map(row=>row.text).join('')).toBe(exit);
 expect(inventory.map(row=>row.text)).toContain('如果收到原件，才可办理；');
});

it('keeps conditional prerequisites attached while still inventorying unrelated outcomes',()=>{
 const examples=[
  {text:'如果核验完成，才可移交原件，复印件仍未签收。',expected:['如果核验完成，才可移交原件，','复印件仍未签收。']},
  {text:'只有手续齐全，才能办理，原记录仍在库中。',expected:['只有手续齐全，才能办理，','原记录仍在库中。']},
  {text:'只有一个人到场，另两人离开。',expected:['只有一个人到场，','另两人离开。']},
  {text:'若干人到场，另一组完成清点。',expected:['若干人到场，','另一组完成清点。']},
  {text:'一旦审查通过，就交还物件，仍不代表获得全部权利。',expected:['一旦审查通过，就交还物件，','仍不代表获得全部权利。']},
 ];
 for(const {text,expected} of examples){
  const anchors=causalEvidenceAnchors(JSON.stringify([{exitState:text}]),{});
  const parts=causalExitResultAnchors(anchors,text).map(row=>row.text);
  expect(parts).toEqual(expected);
  expect(parts.join('')).toBe(text);
  expect(anchors.some(row=>row.source==='body'&&row.text===text)).toBe(true);
 }
});

it('does not accept a result-only parent paragraph as its own independent causal bridge',()=>{
 const body='灯影出现在街口。\n这时候想往回退，已经来不及了。';
 const audit={status:'evaluated',reason:'逐项核对行动和结果的原文依据',transitions:[{
  actionAnchorId:'body:p1',resultAnchorId:'body:projection:s2',bridgeAnchorId:'body:p2',
  actionEvidence:'灯影出现在街口。',resultEvidence:'已经来不及了。',bridgeEvidence:'这时候想往回退，已经来不及了。',
  basisSource:'body',status:'supported',reason:'收束句已明确写退回去来不及了。'}]};
 const checked=validateCausalAudit(audit,body,{});
 expect(checked.verified).toBe(false);expect(checked.errors[0]).toContain('结果自身');
 expect(checked.issues).toEqual([]);
 const fixed={...audit,transitions:[{...audit.transitions[0],status:'gap',bridgeEvidence:'',reason:'灯影出现并未建立封堵退路的实际行动条件'}]};
 expect(validateCausalAudit(fixed,body,{}).issues).toHaveLength(1);
 const direct={...audit,transitions:[{...audit.transitions[0],actionEvidence:'这时候想往回退，已经来不及了。'}]};
 // A same-paragraph direct action is not rejected by this address-only check;
 // its actual causal sufficiency remains the independent semantic duty.
 expect(validateCausalAudit(direct,body,{}).verified).toBe(true);
});

it('offers independent condition clauses from narrative and world sources without creating extra result obligations',()=>{
 const chapters=[{content:'操作员拉下开关。线路失电，触点无法闭合，设备停机。',characterActions:[{action:'拉下开关',result:'设备停机。'}]}];
 const body=JSON.stringify(chapters),sources={project_context:JSON.stringify({rules:['只有隔离闸断开，才允许检修，现场仍要核对警示灯。']})};
 const anchors=causalEvidenceAnchors(body,sources);
 const action=anchors.find(x=>x.path==='0.content'&&x.text==='操作员拉下开关。')!;
 const bridge=anchors.find(x=>x.path==='0.content'&&x.text==='线路失电，')!;
 const result=causalChapterResultAnchors(anchors,0);
 expect(action.id).toBe('body:v1:c1');expect(bridge.id).toBe('body:v1:c2:s1');
 expect(result).toHaveLength(1);expect(result[0].path).toBe('0.characterActions.0.result');
 expect(anchors.some(x=>x.source==='project_context'&&x.text==='只有隔离闸断开，才允许检修，')).toBe(true);
 expect(anchors.some(x=>x.source==='project_context'&&x.text==='只有隔离闸断开，')).toBe(false);
 const reviewed=materializeCausalAuditAnchors({status:'evaluated',reason:'核对断电条件与当前停机结果的真实来源',transitions:[{
  actionAnchorId:action.id,resultAnchorId:result[0].id,bridgeAnchorId:bridge.id,status:'supported',reason:'拉下开关使线路失电，触点无法闭合，故设备停机。',
 }]},body,sources);
 expect(validateCausalAudit(reviewed,body,sources)).toMatchObject({verified:true,issues:[]});
 expect(reviewed.transitions[0].bridgeEvidence).toBe('线路失电，');
 expect(JSON.parse(body)).toEqual(chapters);
});

it('uses the same fine condition directory for plain prose and structured chapter content',()=>{
 const text='操作员拉下开关。线路失电，触点无法闭合，设备停机。';
 const plain=causalEvidenceAnchors(text,{}),structured=causalEvidenceAnchors(JSON.stringify([{content:text}]),{});
 expect(plain.find(x=>x.id==='body:p1')?.text).toBe(text);
 for(const clause of ['操作员拉下开关。','线路失电，','触点无法闭合，','设备停机。']){
  expect(plain.some(x=>x.text===clause)).toBe(true);expect(structured.some(x=>x.text===clause)).toBe(true);
 }
 const conditional=causalEvidenceAnchors('只有隔离闸断开，才允许检修，现场仍要核对警示灯。',{});
 expect(conditional.some(x=>x.text==='只有隔离闸断开，才允许检修，')).toBe(true);
 expect(conditional.some(x=>x.text==='只有隔离闸断开，')).toBe(false);
});

it('groups only literally identical chapter results across fields, never changed scope or negation',()=>{
 const chapter={scenes:[{outcome:'银行收到了这份有签名的申请。'}],
  characterActions:[{result:'银行收到了这份有签名的申请。'}],
  characterStates:[{stateAfter:'银行尚未批准这份有签名的申请。'}]};
 const body=JSON.stringify([chapter]);
 const all=causalEvidenceAnchors(body,{});
 const inventory=causalChapterResultAnchors(all,0);
 const groups=causalChapterResultReviewGroups(all,0);
 expect(inventory).toHaveLength(3);
 expect(groups.review).toHaveLength(2);
 const original=groups.review.find(row=>row.text==='银行收到了这份有签名的申请。')!;
 expect(groups.aliasesByReview[original.id]).toHaveLength(1);
 const accepted={status:'evaluated',reason:'审查收件动作不等于批准，仅证明收到资料',
  transitions:[{chapterNumber:1,actionAnchorId:original.id,resultAnchorId:original.id,
    bridgeAnchorId:original.id,status:'gap',reason:'收件动作存在，但尚未证明具体签收人或机构确认'}]};
 const materialized=materializeCausalAuditAnchors(accepted,body,{});
 const expanded=expandCausalReviewedResultAliases(materialized,groups.aliasesByReview,body,{});
 expect(expanded.transitions).toHaveLength(2);
 expect(expanded.transitions.map((row:any)=>row.resultAnchorId)).toContain(groups.aliasesByReview[original.id][0]);
 expect(expanded.transitions.every((row:any)=>row.status==='gap')).toBe(true);
 expect(groups.review.some(row=>row.text.startsWith('银行尚未批准'))).toBe(true);
 const changed={...groups.aliasesByReview,[original.id]:[groups.review.find(row=>row.text.startsWith('银行尚未批准'))!.id]};
 expect(()=>expandCausalReviewedResultAliases(materialized,changed,body,{})).toThrow('不一致');
});
it('keeps repeated literal event text within a single field as separate obligations',()=>{
 const body=JSON.stringify([{scenes:[{outcome:'重新确认。然后又重新确认。'}]}]);
 const all=causalEvidenceAnchors(body,{});
 const groups=causalChapterResultReviewGroups(all,0);
 expect(groups.review).toHaveLength(causalChapterResultAnchors(all,0).length);
 expect(Object.keys(groups.aliasesByReview)).toHaveLength(0);
});
it('only sends failed causal rows to the existing repair call and keeps all preserved rows server-side',()=>{
 const row={status:'supported',actionAnchorId:'body:p1',resultAnchorId:'body:p2',bridgeAnchorId:'body:p1',reason:'完成直接行动已有原文条件证据'};
 const original={status:'evaluated',reason:'逐项核实全部结果',transitions:[...Array.from({length:40},()=>({...row})),{...row,actionAnchorId:'body:p99'}]};
 const prompt=causalAuditRepairPrompt(original,['第41项因果审查缺少可验证行动、结果或成立条件'],
  '实际行动发生。\n\n结果确实发生。',{}).prompt;
 expect(prompt).toContain('本次仅纠正编号[40]');
 expect(prompt).toContain('retainedValidatedRows');
 expect(prompt).not.toContain('"transitions":[');
 expect(prompt).toContain('"index":40');
 const patched=applyCausalAuditRepair(original,['第41项因果审查缺少可验证行动、结果或成立条件'],
  {repairs:[{index:40,...row}]});
 expect(patched.transitions).toHaveLength(41);
 expect(patched.transitions.slice(0,40)).toEqual(original.transitions.slice(0,40));
});

it('recovers only unique literal result address within its own chapter, retaining an exact action quotation',()=>{
 const chapter={chapterNumber:2,content:'职员当面接收该份材料。',scenes:[{outcome:'职员确认收到该份材料。'}]};
 const body=JSON.stringify([chapter]),anchors=causalEvidenceAnchors(body,{});
 const inventory=causalChapterResultReviewGroups(anchors,0).review;
 expect(inventory).toHaveLength(1);
 const raw={status:'evaluated',reason:'已核对当面交接与实际收件两个动作',transitions:[{
  chapterNumber:2,actionEvidence:chapter.content,resultEvidence:chapter.scenes[0].outcome,
  bridgeAnchorId:anchors.find(row=>row.path==='0.content')!.id,
  status:'supported',reason:'当面递交与确认收件属于同一个可验证的完成过程',
 }]};
 const result=bindUniqueCausalResultAnchors(raw,[{chapterNumber:2,resultAnchorIds:inventory.map(row=>row.id)}],anchors);
 expect(result.transitions[0].resultAnchorId).toBe(inventory[0].id);
 const materialized=materializeCausalAuditAnchors(result,body,{});
 expect(materialized.transitions[0].actionEvidence).toBe(chapter.content);
 expect(validateCausalAudit(materialized,body,{})).toMatchObject({verified:true,issues:[]});
 const invented={...raw,transitions:[{...raw.transitions[0],resultAnchorId:'body:v999'}]};
 expect(bindUniqueCausalResultAnchors(invented,[{chapterNumber:2,resultAnchorIds:inventory.map(row=>row.id)}],anchors)
  .transitions[0].resultAnchorId).toBe('body:v999');
 expect(validateCausalAudit(materializeCausalAuditAnchors(invented,body,{}),body,{}).verified).toBe(false);
 const wrongChapter={...raw,transitions:[{...raw.transitions[0],chapterNumber:3}]};
 expect(bindUniqueCausalResultAnchors(wrongChapter,[{chapterNumber:2,resultAnchorIds:inventory.map(row=>row.id)}],anchors)
  .transitions[0].resultAnchorId).toBeUndefined();
});
it('distinguishes missing action quote, result quote and bridge while keeping existing targeted-repair indices',()=>{
 const text='她提交资料。对方收到资料。';
 const row={actionEvidence:'没有发生过的行动',resultEvidence:'对方收到资料。',bridgeEvidence:'',status:'supported',reason:'声称资料已经接收，但未给出可信步骤'};
 const checked=validateCausalAudit({status:'evaluated',reason:'审查缺口',transitions:[row]},text,{});
 expect(checked.verified).toBe(false);
 expect(checked.errors.join('；')).toContain('actionEvidence不是正文连续原文');
 expect(checked.errors.join('；')).toContain('supported缺少有效成立条件原文');
 expect(causalAuditRepairTargets({transitions:[row]},checked.errors)).toEqual([0]);
});
