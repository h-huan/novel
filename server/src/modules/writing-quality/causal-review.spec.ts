import {causalAuditRepairTargets,applyCausalAuditRepair,causalAuditRepairPrompt,quarantineUnprovedCausalBridges} from './causal-review';
import { expect, it } from 'vitest';
import { materializeCausalAuditAnchors, validateCausalAudit } from './causal-review';
import { causalEvidenceAnchors, causalExitResultAnchors } from './causal-review';
import { preserveCausalCountercheckAnchors } from './causal-review';
import { causalChapterResultAnchors, causalChapterResultReviewGroups, causalPlanningProofGroups, causalPlanningProofPromptCatalog, causalPlanningProofResultPartitions, decodePlanningProofRows, expandCausalReviewedResultAliases, normalizeReviewedCausalResultAliases, bindCausalReviewEvidenceAddresses, causalChapterEvidenceCatalog, causalChapterEvidenceAddressIssues } from './causal-review';

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
it('causal source splitter binds dependent antecedents to their consequence without dropping independent outcomes', () => {
 const cases=[
  ['因为档案解封，管理员才同意复制，证据随后封存。','因为档案解封，管理员才同意复制，','证据随后封存。'],
  ['由于名单未核准，申请仍被退回，负责人随后重新签字。','由于名单未核准，申请仍被退回，','负责人随后重新签字。'],
  ['虽然她已递交资料，窗口仍未批准，翌日才安排复核。','虽然她已递交资料，窗口仍未批准，','翌日才安排复核。'],
  ['为了保留追回机会，律师先提出异议，法院随后登记。','为了保留追回机会，律师先提出异议，','法院随后登记。'],
  ['即使对手否认记录，申诉仍被受理，决定仍未生效。','即使对手否认记录，申诉仍被受理，','决定仍未生效。'],
 ] as const;
 for (const [outcome,first,second] of cases) {
   const chapter=[{chapterNumber:1,scenes:[{outcome}]}];
   const anchors=causalEvidenceAnchors(JSON.stringify(chapter),{});
   const results=causalChapterResultAnchors(anchors,0);
   expect(results.map(row=>row.text)).toEqual([first,second]);
   expect(results.map(row=>row.text).join('')).toBe(outcome);
   expect(results.every(row=>row.path==='0.scenes.0.outcome')).toBe(true);
   expect(causalChapterEvidenceCatalog(chapter,anchors).entries[0].resultAnchorIds).toEqual(results.map(row=>row.id));
 }
 const trulyDistinct=[{chapterNumber:1,characterActions:[{result:'取得钥匙，打开门锁，转交给保管员。'}]}];
 const distinct=causalChapterResultAnchors(causalEvidenceAnchors(JSON.stringify(trulyDistinct),{}),0);
 expect(distinct).toHaveLength(3);
 expect(distinct.map(row=>row.text).join('')).toBe('取得钥匙，打开门锁，转交给保管员。');
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
 expect(causalAuditRepairPrompt(original,errors,body,{}).prompt).not.toContain('"actionAnchorId":"目录中的真实行动编号"');
 expect(causalAuditRepairPrompt(null,[],body,{}).prompt).not.toContain('"resultAnchorId":"目录中的真实结果编号"');
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
it('corrects structured outline citations using the same selectable IDs as the server, not prose-only paragraph IDs',()=>{
 const source=JSON.stringify([{content:'养马人当众牵出老马。',scenes:[{outcome:'都尉验明马龄，拒收了这匹马。'}]}]);
 const bad={status:'evaluated',reason:'需要纠正结构化章纲中的实际引文位置',
  transitions:[{actionEvidence:'不在结构化原文里的行动',resultEvidence:'都尉验明马龄，拒收了这匹马。',
   bridgeEvidence:'',status:'gap',reason:'行动定位错误，但不以来源协议错误断言故事成立'}]};
 const errors=validateCausalAudit(bad,source,{}).errors;
 const prompt=causalAuditRepairPrompt(bad,errors,source,{}).prompt;
 expect(prompt).toContain('可选原文证据编号（唯一允许的地址全集）');
 expect(prompt).toContain('body:v');
 expect(prompt).not.toContain('"actionAnchorId":"body段落编号"');
 const all=causalEvidenceAnchors(source,{});
 const action=all.find(anchor=>anchor.source==='body'&&anchor.text==='养马人当众牵出老马。')!;
 const result=all.find(anchor=>anchor.source==='body'&&anchor.text==='都尉验明马龄，拒收了这匹马。')!;
 expect(action).toBeDefined();expect(result).toBeDefined();
 const patched=applyCausalAuditRepair(bad,errors,{repairs:[{index:0,actionAnchorId:action.id,
  resultAnchorId:result.id,bridgeAnchorId:'',status:'gap',reason:'现有信息不能证明都尉拒收的完整决定依据'}]});
 const materialized=materializeCausalAuditAnchors(patched,source,{});
 expect(validateCausalAudit(materialized,source,{})).toMatchObject({verified:true});
 expect(materialized.transitions[0].status).toBe('gap');
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

it('server-owned chapter catalog binds all address roles consistently and blocks same-text cross-chapter IDs',()=>{
 const chapters=[
  {chapterNumber:3,content:'养马人当面提交了验马册。',exitState:'都尉登记了战马。',
   scenes:[{outcome:'都尉登记了战马。'}]},
  {chapterNumber:4,content:'养马人当面提交了验马册。',exitState:'都尉登记了战马。',
   scenes:[{outcome:'都尉登记了战马。'}]},
 ];
 const source=JSON.stringify(chapters),anchors=causalEvidenceAnchors(source,{});
 const {entries}=causalChapterEvidenceCatalog(chapters,anchors,'exitState');
 expect(entries).toHaveLength(2);
 expect(entries[0].resultAnchorIds[0]).not.toBe(entries[1].resultAnchorIds[0]);
 const quote='养马人当面提交了验马册。';
 const raw={status:'evaluated',reason:'逐章核实提交验马册后的真实结果',transitions:[{
  chapterNumber:4,actionEvidence:quote,beforeStateEvidence:quote,
  resultEvidence:chapters[1].exitState,bridgeEvidence:quote,status:'supported',
  reason:'当面提交记录作为审查的真实行动和初始状态',
 }]};
 const bound=bindCausalReviewEvidenceAddresses(raw,entries,anchors,'exitState');
 const action=anchors.find(a=>a.path==='1.content')!.id;
 expect(bound.transitions[0].actionAnchorId).toBe(action);
 expect(bound.transitions[0].beforeStateAnchorId).toBe(action);
 expect(bound.transitions[0].resultAnchorId).toBe(entries[1].resultAnchorIds[0]);
 // The bridge quote is in two chapters and cannot be inferred by its words.
 expect(bound.transitions[0].bridgeAnchorId).toBeUndefined();
 expect(causalChapterEvidenceAddressIssues(bound,entries,'exitState')).toEqual([]);
 const cross={...bound,transitions:[{...bound.transitions[0],actionAnchorId:anchors.find(a=>a.path==='0.content')!.id}]};
 expect(causalChapterEvidenceAddressIssues(cross,entries,'exitState').join('；')).toContain('行动编号未绑定本章');
 const wrongResult={...bound,transitions:[{...bound.transitions[0],resultAnchorId:entries[0].resultAnchorIds[0]}]};
 expect(causalChapterEvidenceAddressIssues(wrongResult,entries,'exitState').join('；')).toContain('结果编号未绑定本章');
 const wrongBefore={...bound,transitions:[{...bound.transitions[0],beforeStateAnchorId:anchors.find(a=>a.path==='0.content')!.id}]};
 expect(causalChapterEvidenceAddressIssues(wrongBefore,entries,'exitState').join('；')).toContain('行动前状态编号未绑定本章');
 const wrongProvided={...raw,transitions:[{...raw.transitions[0],actionAnchorId:'body:v999'}]};
 expect(bindCausalReviewEvidenceAddresses(wrongProvided,entries,anchors,'exitState').transitions[0].actionAnchorId).toBe('body:v999');
 const paraphrased={...raw,transitions:[{...raw.transitions[0],actionEvidence:'养马人提交了验马记录。'}]};
 expect(bindCausalReviewEvidenceAddresses(paraphrased,entries,anchors,'exitState').transitions[0].actionAnchorId).toBeUndefined();
 const duplicate={...chapters[1],characterActions:[{action:quote}]};
 const dupAnchors=causalEvidenceAnchors(JSON.stringify([duplicate]),{});
 const dupEntries=causalChapterEvidenceCatalog([duplicate],dupAnchors,'exitState').entries;
 expect(bindCausalReviewEvidenceAddresses(raw,dupEntries,dupAnchors,'exitState').transitions[0].actionAnchorId).toBeUndefined();
});
it('locates an identical exit result only through the declared chapter index',()=>{
 const chapters=[{chapterNumber:1,exitState:'通知已生效。'},{chapterNumber:2,exitState:'通知已生效。'}];
 const anchors=causalEvidenceAnchors(JSON.stringify(chapters),{});
 const first=causalExitResultAnchors(anchors,chapters[0].exitState,0);
 const second=causalExitResultAnchors(anchors,chapters[1].exitState,1);
 expect(first).toHaveLength(1);expect(second).toHaveLength(1);
 expect(first[0].id).not.toBe(second[0].id);
 expect(first[0].path).toBe('0.exitState');expect(second[0].path).toBe('1.exitState');
});
it('preserves a valid explicit body ID and rejects a duplicate chapter number in the same audit',()=>{
 const chapters=[{chapterNumber:3,content:'甲完成交付。'},{chapterNumber:3,content:'乙完成复核。'}];
 const anchors=causalEvidenceAnchors(JSON.stringify(chapters),{});
 const entries=causalChapterEvidenceCatalog(chapters,anchors).entries;
 const row={chapterNumber:3,actionAnchorId:anchors.find(x=>x.path==='0.content')!.id,
  resultAnchorId:anchors.find(x=>x.path==='0.content')!.id};
 expect(causalChapterEvidenceAddressIssues({transitions:[row]},entries).join('；')).toContain('章号不存在或不唯一');
});

it('distinguishes missing action quote, result quote and bridge while keeping existing targeted-repair indices',()=>{
 const text='她提交资料。对方收到资料。';
 const row={actionEvidence:'没有发生过的行动',resultEvidence:'对方收到资料。',bridgeEvidence:'',status:'supported',reason:'声称资料已经接收，但未给出可信步骤'};
 const checked=validateCausalAudit({status:'evaluated',reason:'审查实际因果证据中的缺失和无效引文',transitions:[row]},text,{});
 expect(checked.verified).toBe(false);
 expect(checked.errors.join('；')).toContain('actionEvidence不是正文连续原文');
 expect(checked.errors.join('；')).toContain('supported缺少有效成立条件原文');
 expect(causalAuditRepairTargets({transitions:[row]},checked.errors)).toEqual([0]);
});

it('stress: 60 chapter result projections require 20 distinct semantic checks, but every negative field stays rejected',()=>{
 const results=Array.from({length:20},(_,index)=>'第'+(index+1)+'笔核算已经得到不同的验收结果。');
 const chapter={chapterNumber:2,content:'核对人员正在核算原始账目，但仍未取得签署权限。',
  scenes:results.map(outcome=>({outcome})),
  characterActions:results.map(result=>({result})),
  characterStates:results.map(stateAfter=>({stateAfter}))};
 const body=JSON.stringify([chapter]),anchors=causalEvidenceAnchors(body,{});
 const all=causalChapterResultAnchors(anchors,0),groups=causalChapterResultReviewGroups(anchors,0);
 expect(all).toHaveLength(60);
 expect(groups.review).toHaveLength(20);
 expect(Object.values(groups.aliasesByReview).flat()).toHaveLength(40);
 const action=anchors.find(row=>row.path==='0.content'&&row.text===chapter.content)!;
 const review=materializeCausalAuditAnchors({status:'evaluated',reason:'逐笔核算不等于具有签署或批准资格',
  transitions:groups.review.map(result=>({chapterNumber:2,actionAnchorId:action.id,resultAnchorId:result.id,
   bridgeAnchorId:'',status:'gap',reason:'现有核算动作没有建立由有权人员作出批准的必要条件'}))},body,{});
 const expanded=expandCausalReviewedResultAliases(review,groups.aliasesByReview,body,{});
 expect(expanded.transitions).toHaveLength(60);
 const checked=validateCausalAudit(expanded,body,{});
 expect(checked.verified).toBe(true);
 expect(checked.issues).toHaveLength(60);
 expect(checked.issues.every(row=>row.issueType==='causality_gap')).toBe(true);
});

it('retains independently reviewed identical outcome aliases instead of aborting the entire outline',()=>{
 const chapter={chapterNumber:1,scenes:[{outcome:'承办人记录了当面提交的申请。'}],
  characterActions:[{result:'承办人记录了当面提交的申请。'}]};
 const body=JSON.stringify([chapter]),anchors=causalEvidenceAnchors(body,{});
 const grouped=causalChapterResultReviewGroups(anchors,0);
 expect(grouped.review).toHaveLength(1);
 const lead=grouped.review[0],alias=grouped.aliasesByReview[lead.id][0];
 const audit=materializeCausalAuditAnchors({status:'evaluated',reason:'分别核对相同结果字段的实际行动及必要条件',
  transitions:[
   {chapterNumber:1,actionAnchorId:lead.id,resultAnchorId:lead.id,bridgeAnchorId:'',
    status:'gap',reason:'尚未证明承办人实际收到申请原件'},
   {chapterNumber:1,actionAnchorId:alias,resultAnchorId:alias,bridgeAnchorId:'',
    status:'gap',reason:'独立复核的同一提交结果仍缺实际签收条件'}
  ]},body,{});
 const expanded=expandCausalReviewedResultAliases(audit,grouped.aliasesByReview,body,{});
 expect(expanded.transitions).toHaveLength(2);
 expect(expanded.transitions[1].reason).toContain('独立复核');
 const checked=validateCausalAudit(expanded,body,{});
 expect(checked.verified).toBe(true);
 expect(checked.issues).toHaveLength(2); // genuine defects still block saving
 expect(checked.issues.every((row:any)=>row.issueType==='causality_gap')).toBe(true);
 const duplicate={...audit,transitions:[...audit.transitions,audit.transitions[1]]};
 expect(()=>expandCausalReviewedResultAliases(duplicate,grouped.aliasesByReview,body,{}))
  .toThrow('同一结果地址存在多条互斥审查');
});

it('does not reclassify missing supported bridge as a pass; it becomes a documented blocking causal gap after correction',()=>{
 const body='申请已经提交。部门随后决定批准。';
 const evidence={actionEvidence:'申请已经提交。',resultEvidence:'部门随后决定批准。',
  bridgeEvidence:'',basisSource:'body',status:'supported',
  reason:'审查员声称申请已得到有权部门批准，但没有提供成立条件'};
 const audit={status:'evaluated',reason:'逐项审查行动与实际决定的条件',transitions:[evidence]};
 const errors=['第33项因果审查缺少可验证行动、结果或成立条件（supported缺少有效成立条件原文）'];
 // The real 33rd slot is also mapped without changing any unrelated entries.
 const thirtyThree={...audit,transitions:Array.from({length:32},()=>({
  ...evidence,status:'gap',reason:'原申请没有证明有权部门已经核准这一决定',
 })).concat(evidence)};
 const downgraded=quarantineUnprovedCausalBridges(thirtyThree,errors,body,{});
 expect(downgraded).not.toBe(thirtyThree);
 expect(downgraded.transitions.slice(0,32)).toEqual(thirtyThree.transitions.slice(0,32));
 expect(downgraded.transitions[32]).toMatchObject({status:'gap',bridgeEvidence:''});
 const validated=validateCausalAudit(downgraded,body,{});
 expect(validated.verified).toBe(true);
 expect(validated.issues).toHaveLength(33);
 expect(validated.issues[32].issueType).toBe('causality_gap');
 expect(quarantineUnprovedCausalBridges(thirtyThree,
  [...errors,'结构化结果逐项核对未完整覆盖：body:v9'],body,{})).toBe(thirtyThree);
 expect(quarantineUnprovedCausalBridges({...audit,transitions:[{...evidence,actionEvidence:'不存在的申请。'}]},
  ['第1项因果审查缺少可验证行动、结果或成立条件（supported缺少有效成立条件原文）'],body,{})).toEqual({...audit,transitions:[{...evidence,actionEvidence:'不存在的申请。'}]});
});

it('recovers only a unique literal condition address without changing the independent supported verdict',()=>{
 const body='她递交了原始合同。\n\n柜台职员登记接收了原件。\n\n经正式核验后申请获批。';
 const row={actionAnchorId:'body:p1',resultAnchorId:'body:p3',status:'supported',
  bridgeEvidence:'柜台职员登记接收了原件。',reason:'收到原件是实际核验并作出决定前已经发生的条件'};
 const reviewed=materializeCausalAuditAnchors({
  status:'evaluated',reason:'逐项核对实际行动及完成结果',transitions:[row]},body,{});
 expect(reviewed.transitions[0].bridgeAnchorId).toBe('body:p2');
 expect(reviewed.transitions[0].bridgeEvidence).toBe('柜台职员登记接收了原件。');
 expect(validateCausalAudit(reviewed,body,{})).toMatchObject({verified:true,errors:[]});
 const wrong=materializeCausalAuditAnchors({
  status:'evaluated',reason:'拒绝以不存在的原文编号替代证明',transitions:[{...row,bridgeAnchorId:'body:p999'}]},body,{});
 expect(wrong.transitions[0].bridgeEvidence).toBe('');
 expect(validateCausalAudit(wrong,body,{}).verified).toBe(false);
 const repeated=body+'\n\n柜台职员登记接收了原件。';
 const ambiguous=materializeCausalAuditAnchors({
  status:'evaluated',reason:'重复原文不能猜测是哪个独立执行动作',transitions:[row]},repeated,{});
 expect(ambiguous.transitions[0].bridgeAnchorId).toBeUndefined();
 expect(validateCausalAudit(ambiguous,repeated,{}).verified).toBe(false);
});


it('locks a server-owned omitted result even at the 112th audit row; only its cause may be reviewed',()=>{
 const retained=Array.from({length:111},(_,index)=>({
   chapterNumber:4,resultAnchorId:'body:v'+(index+1),actionAnchorId:'body:v1',
   status:'gap',reason:'此前已经逐项独立审定的真实缺口不能因漏审修复而被覆盖'}));
 const missed={chapterNumber:4,resultAnchorId:'body:v56:s3'};
 const original={status:'evaluated',reason:'逐项审核',transitions:[...retained,missed]};
 const errors=['结构化结果逐项核对未完整覆盖：body:v56:s3',
   '第112项因果审查缺少该出口结果的行动及成立条件'];
 expect(causalAuditRepairTargets(original,errors)).toEqual([111]);
 const repair={index:111,actionAnchorId:'body:v2',bridgeAnchorId:'',
   status:'gap',reason:'此结果尚无独立可核验的执行动作与必要条件'};
 const fixed=applyCausalAuditRepair(original,errors,{repairs:[repair]});
 expect(fixed.transitions).toHaveLength(112);
 expect(fixed.transitions.slice(0,111)).toEqual(retained);
 expect(fixed.transitions[111]).toMatchObject({
   chapterNumber:4,resultAnchorId:'body:v56:s3',actionAnchorId:'body:v2',status:'gap'});
 expect(()=>applyCausalAuditRepair(original,errors,{repairs:[
   {...repair,resultAnchorId:'body:v12'}]})).toThrow('不能改动服务器锁定的结果编号');
 expect(()=>applyCausalAuditRepair(original,errors,{repairs:[
   {...repair,chapterNumber:5}]})).toThrow('不能改变点名行章号');
 // Existing invalid references are not locked: only appended missing-result
 // placeholders have no prior action, status or evidence.
 const invalid={transitions:[{chapterNumber:4,actionAnchorId:'body:v1',
   resultAnchorId:'invalid:result',status:'gap',reason:'引用编号有误'}]};
 const corrected=applyCausalAuditRepair(invalid,['第1项因果审查结果编号无效'],
   {repairs:[{index:0,actionAnchorId:'body:v1',resultAnchorId:'body:v2',
     status:'gap',reason:'源文本结果仍缺必要条件'}]});
 expect(corrected.transitions[0].resultAnchorId).toBe('body:v2');
});

it('repair prompt identifies the exact missing result without claiming its causality was reviewed',()=>{
 const chapters=[{chapterNumber:4,content:'她向掌柜递交证据。',scenes:[{outcome:'掌柜收到证据。'}]}];
 const body=JSON.stringify(chapters),anchors=causalEvidenceAnchors(body,{});
 const outcome=causalChapterResultAnchors(anchors,0)[0];
 const original={status:'evaluated',transitions:[{chapterNumber:4,resultAnchorId:outcome.id}]};
 const prompt=causalAuditRepairPrompt(original,['第1项因果审查缺少该出口结果的行动及成立条件'],body,{}).prompt;
 expect(prompt).toContain('服务器锁定的漏审结果');
 expect(prompt).toContain(outcome.id);
 expect(prompt).toContain('掌柜收到证据');
 expect(prompt).toContain('遗漏结果尚未经语义审核');
 expect(prompt).toContain('resultAnchorId可省略');
 expect(prompt).toContain('可选原文证据编号（唯一允许的地址全集）');
});


it('binds an actually reviewed exact same-chapter alias to its advertised result without another model call',()=>{
 const chapters=[{chapterNumber:9,content:'她当面交出了登记簿。',
  scenes:[{outcome:'管理员收下登记簿。'}],
  characterActions:[{action:'她当面交出了登记簿。',result:'管理员收下登记簿。'}]}];
 const body=JSON.stringify(chapters),anchors=causalEvidenceAnchors(body,{});
 const {entries,aliasesByReview}=causalChapterEvidenceCatalog(chapters,anchors);
 const representative=entries[0].resultAnchorIds[0];
 const alias=aliasesByReview[representative][0];
 const action=anchors.find(row=>row.source==='body'&&row.path==='0.content')!;
 const row={chapterNumber:9,resultAnchorId:alias,actionAnchorId:action.id,
   status:'gap',reason:'仅提交登记簿还不能证明管理员已正式登记或赋予效力'};
 const normalized=normalizeReviewedCausalResultAliases({status:'evaluated',reason:'保留原语义判断',
   transitions:[row]},aliasesByReview,anchors);
 expect(normalized.transitions[0]).toMatchObject({resultAnchorId:representative,status:'gap',actionAnchorId:action.id});
 const expanded=expandCausalReviewedResultAliases(normalized,aliasesByReview,body,{});
 expect(expanded.transitions.map((x:any)=>x.resultAnchorId)).toEqual([representative,alias]);
 expect(expanded.transitions.every((x:any)=>x.status==='gap')).toBe(true);
 const withIndependentRepresentative=normalizeReviewedCausalResultAliases({
  transitions:[{...row,resultAnchorId:representative,status:'supported'},row]
 },aliasesByReview,anchors);
 // Independent contradictory review rows remain available to the strict
 // validator; the helper never overwrites an actual verdict to force success.
 expect(withIndependentRepresentative.transitions.map((x:any)=>x.resultAnchorId))
   .toEqual([representative,alias]);
 expect(withIndependentRepresentative.transitions.map((x:any)=>x.status))
   .toEqual(['supported','gap']);
});

it('never aliases same words across different chapters or changed assertions',()=>{
 const chapters=[{chapterNumber:2,scenes:[{outcome:'账目已经核查。'}]},
  {chapterNumber:3,scenes:[{outcome:'账目已经核查。'}]}];
 const body=JSON.stringify(chapters),anchors=causalEvidenceAnchors(body,{});
 const {entries,aliasesByReview}=causalChapterEvidenceCatalog(chapters,anchors);
 expect(Object.keys(aliasesByReview)).toHaveLength(0);
 const foreign={transitions:[{chapterNumber:3,resultAnchorId:entries[0].resultAnchorIds[0],status:'gap'}]};
 expect(normalizeReviewedCausalResultAliases(foreign,aliasesByReview,anchors)).toEqual(foreign);
});


it('splits a hundred independent final-scene claims into two complete-chapter audits without dropping obligations',()=>{
 const chapters=[1,2,3].map(chapterNumber=>({
  chapterNumber,chapterFunction:'resolution',
  scenes:Array.from({length:18},(_,i)=>({outcome:'第'+chapterNumber+'章第'+(i+1)+'个真实结果已生效。'})),
  characterActions:Array.from({length:16},(_,i)=>({result:'第'+chapterNumber+'章第'+(i+1)+'项人物行动有结果。'})),
 }));
 const groups=causalPlanningProofGroups(chapters);
 expect(groups).toHaveLength(2);
 expect(groups.flat()).toEqual(chapters);
 expect(groups.every(group=>group.length>0)).toBe(true);
 const original=chapters.reduce((n,chapter)=>
   n+causalChapterResultReviewGroups(causalEvidenceAnchors(JSON.stringify([chapter]),{}),0).review.length,0);
 const distributed=groups.flat().reduce((n,chapter)=>
   n+causalChapterResultReviewGroups(causalEvidenceAnchors(JSON.stringify([chapter]),{}),0).review.length,0);
 expect(original).toBeGreaterThan(100);
 expect(distributed).toBe(original);
 expect(causalPlanningProofGroups(chapters.slice(0,1))).toEqual([chapters.slice(0,1)]);
 expect(causalPlanningProofGroups(chapters.slice(0,2),1000)).toEqual([chapters.slice(0,2)]);
 // If one chapter alone carries too many distinct assertions, partitioning
 // by whole chapter cannot make either single-pass reviewer reliable. Preserve
 // the prior correction opportunity rather than falsely advertising a fix.
 const dominated=[{
   chapterNumber:10,scenes:Array.from({length:85},(_,i)=>({outcome:`第十章独立结果${i}已经成立。`}))
  },{chapterNumber:11,scenes:[{outcome:'另一章完成登记。'}]},
    {chapterNumber:12,scenes:[{outcome:'末章撤回通知。'}]}];
 expect(causalPlanningProofGroups(dominated)).toEqual([dominated]);
 expect(causalPlanningProofGroups(dominated.slice(0,1))).toEqual([dominated.slice(0,1)]);
});

it('limits a targeted missing-result correction to the matching chapter while retaining global world evidence',()=>{
 const chapters=[{chapterNumber:1,content:'他保留登记凭证。',scenes:[{outcome:'第一章的登记成立。'}]},
   {chapterNumber:2,content:'她向窗口提交申请。',scenes:[{outcome:'第二章的窗口收到申请。'}]},
   {chapterNumber:3,content:'第三章有人要求作出决定。',scenes:[{outcome:'第三章的处理结果待定。'}]}];
 const body=JSON.stringify(chapters),anchors=causalEvidenceAnchors(body,{});
 const missing=causalChapterResultAnchors(anchors,1)[0];
 const review={status:'evaluated',transitions:[{chapterNumber:2,resultAnchorId:missing.id}]};
 const reason=['第1项因果审查缺少该出口结果的行动及成立条件'];
 const prompt=causalAuditRepairPrompt(review,reason,body,{project_context:JSON.stringify({worldRules:'窗口收到申请不等于审批通过。'})}).prompt;
 const segment=prompt.split('可选原文证据编号（唯一允许的地址全集）：')[1].split('\n本次仅纠正编号')[0];
 const choices=JSON.parse(segment);
 expect(choices.some((a:any)=>a.id===missing.id)).toBe(true);
 expect(choices.some((a:any)=>a.text.includes('她向窗口提交申请'))).toBe(true);
 expect(choices.some((a:any)=>a.text.includes('窗口收到申请不等于审批通过'))).toBe(true);
 expect(choices.some((a:any)=>a.text.includes('他保留登记凭证'))).toBe(false);
 expect(choices.some((a:any)=>a.text.includes('第三章有人要求'))).toBe(false);
 expect(prompt).toContain('遗漏结果尚未经语义审核');
});


it('losslessly reviews 105 independent chapter outcomes through compact tuples while preserving every negative Gate',()=>{
 const chapters=[1,2,3].map(chapterNumber=>({
   chapterNumber,content:'她提交了核对清单。',
   scenes:Array.from({length:35},(_,i)=>({outcome:'第'+chapterNumber+'章第'+(i+1)+'项处理结果已经生效。'})),
 }));
 const body=JSON.stringify(chapters), anchors=causalEvidenceAnchors(body,{});
 const {entries}=causalChapterEvidenceCatalog(chapters,anchors);
 const expected=entries.flatMap(entry=>entry.resultAnchorIds.map(resultAnchorId=>({chapterNumber:entry.chapterNumber,resultAnchorId})));
 let ordinal=0;
 const proofRows=entries.flatMap((entry,index)=>{
   const action=anchors.find(a=>a.path===index+'.content'&&a.source==='body');
   expect(action).toBeDefined();
   return entry.resultAnchorIds.map(()=>[
     ++ordinal,action!.id,'','gap','只有提交核对清单的行动，未实际建立每项最终生效的决定条件'
   ]);
 });
 expect(proofRows).toHaveLength(105);
 const decoded=decodePlanningProofRows({status:'evaluated',reason:'逐章核对结果与真实成立条件',proofRows},expected);
 expect(decoded.proofRows).toBeUndefined();
 expect(decoded.transitions).toHaveLength(105);
 const bound=materializeCausalAuditAnchors(decoded,body,{});
 expect(causalChapterEvidenceAddressIssues(bound,entries)).toEqual([]);
 expect(validateCausalAudit(bound,body,{})).toMatchObject({verified:true});
 expect(validateCausalAudit(bound,body,{}).issues).toHaveLength(105);
 const catalogIds=new Set(entries.flatMap(entry=>entry.resultAnchorIds));
 expect(new Set(bound.transitions.map((row:any)=>row.resultAnchorId))).toEqual(catalogIds);
 const reordered=decodePlanningProofRows({status:'evaluated',reason:'结果地址由序号绑定而非输出位置',proofRows:[...proofRows].reverse()},expected);
 expect(reordered.transitions.map((row:any)=>row.resultAnchorId)).toEqual([...expected].reverse().map(item=>item.resultAnchorId));
 expect(()=>decodePlanningProofRows({status:'evaluated',reason:'同序号不许重复',proofRows:[...proofRows.slice(0,104),proofRows[0]]},expected)).toThrow(/结果序号无效、重复或越界/);
 expect(()=>decodePlanningProofRows({status:'evaluated',reason:'逐章核对结果与真实成立条件',
   proofRows:proofRows.slice(0,104)},expected)).toThrow(/结果数量与服务器目录不一致/);
 const wrong=decodePlanningProofRows({status:'evaluated',reason:'逐章核对结果与真实成立条件',
   proofRows:[...proofRows.slice(0,104),[105,'body:invalid:action','','gap','独立结果的行动证据必须来自同章实际原文']]},expected);
 const wrongBound=materializeCausalAuditAnchors(wrong,body,{});
 expect(causalChapterEvidenceAddressIssues(wrongBound,entries).length).toBeGreaterThan(0);
 expect(validateCausalAudit(wrongBound,body,{}).verified).toBe(false);
});

it('compact initial proof removes repeated body prose but retains all result and world evidence and protocol failures',()=>{
 const chapters=[{chapterNumber:1,content:'她提交了核对清单。',
   supportingNotes:Array.from({length:40},(_,i)=>'第'+i+'项已有独立核验记录但最终批准权限仍属于管理员。'),
   scenes:[{outcome:'管理员暂时受理申请，最终是否批准尚不确定。'}]}];
 const body=JSON.stringify(chapters),sources={project_context:JSON.stringify({worldRules:'受理申请不等于准许最终登记。'})};
 const base=causalAuditRepairPrompt(null,[],body,sources,false,false);
 const compact=causalAuditRepairPrompt(null,[],body,sources,false,false,true);
 expect(compact.prompt).toContain('proofRows每行恰好5项');
 expect(compact.prompt).toContain('受理申请不等于准许最终登记');
 const inventory=causalChapterEvidenceCatalog(chapters,causalEvidenceAnchors(body,sources)).entries[0].resultAnchorIds;
 for(const id of inventory)expect(compact.prompt).toContain(id);
 expect(base.prompt).toContain('她提交了核对清单。');
 expect(compact.prompt).not.toContain('"text":"她提交了核对清单。"');
 expect(compact.prompt.length).toBeLessThan(base.prompt.length);
 expect(decodePlanningProofRows({status:'evaluated',reason:'旧版本完整结果账目',
   transitions:[{chapterNumber:1,resultAnchorId:'body:v1',status:'gap'}]}).transitions).toHaveLength(1);
 const expected=[{chapterNumber:1,resultAnchorId:'body:v2'}];
 for(const invalid of [
   {status:'evaluated',reason:'拒绝双格式',transitions:[],proofRows:[]},
   {status:'evaluated',reason:'拒绝假冒通过',proofRows:[[1,'body:v1','', 'supported','没有独立桥接证据']]},
   {status:'evaluated',reason:'拒绝缺项',proofRows:[[1,'body:v1','gap','理由']]},
   {status:'evaluated',reason:'拒绝伪造',proofRows:[[1,'body:invented',null,'gap','独立状态与结果不成立的实际理由']]},
 ])expect(()=>decodePlanningProofRows(invalid,expected)).toThrow();
 expect(()=>decodePlanningProofRows({status:'evaluated',reason:'不存在权威结果目录',proofRows:[
   [1,'body:v1','','gap','未确认实际成立条件']]})).toThrow(/服务器结果目录/);
});

it('partitions a dominant chapter by server-owned result identities without omitting any result or chapter context',()=>{
 const chapters=[
  {chapterNumber:10,chapterFunction:'climax',content:'已有身份与行动均按完整事实保留。',
   scenes:Array.from({length:85},(_,index)=>({outcome:'第十章结果'+index+'需要分别审查。'}))},
  {chapterNumber:11,chapterFunction:'resolution',content:'完整故事中的前章因果仍需核对。',
   scenes:[{outcome:'另一章真正完成了登记。'}]},
 ];
 const full=causalChapterEvidenceCatalog(chapters,causalEvidenceAnchors(JSON.stringify(chapters),{}))
  .entries.flatMap(entry=>entry.resultAnchorIds);
 const partitions=causalPlanningProofResultPartitions(chapters);
 expect(partitions).toHaveLength(2);
 expect(partitions.every(part=>part.length<=72)).toBe(true);
 expect(partitions.flat()).toEqual(full);
 expect(new Set(partitions.flat()).size).toBe(full.length);
 const tighter=causalPlanningProofResultPartitions(chapters,40);
 expect(tighter).toHaveLength(2);
 expect(tighter.flat()).toEqual(full);
 expect(new Set(tighter.flat()).size).toBe(full.length);
});


it('shards more than 144 independent results without adding model calls or losing claims',()=>{
 const chapters=[{chapterNumber:3,chapterFunction:'climax',content:'主角实际递交材料，对方是否接受仍需分别核对。',
   scenes:Array.from({length:200},(_,index)=>({outcome:'独立结果第'+(index+1)+'项需要逐个反证成立条件。'}))}];
 const body=JSON.stringify(chapters);
 const catalog=causalChapterEvidenceCatalog(chapters,causalEvidenceAnchors(body,{})).entries;
 const all=catalog.flatMap(entry=>entry.resultAnchorIds);
 expect(all.length).toBeGreaterThan(144);
 // One huge call previously exceeded the provider output cap. Spend the
 // same initial + correction budget on two disjoint first passes.
 const parts=causalPlanningProofResultPartitions(chapters);
 expect(parts).toHaveLength(2);
 expect(parts.flat()).toEqual(all);
 expect(new Set(parts.flat()).size).toBe(all.length);
 const anchors=causalEvidenceAnchors(body,{});
 const action=anchors.find(item=>item.path==='0.content');
 expect(action).toBeDefined();
 let approved=0;
 for(const part of parts){
  const expected=part.map(resultAnchorId=>({chapterNumber:3,resultAnchorId}));
  const proofRows=part.map((_,index)=>[index+1,action!.id,'','gap','逐项要求的结果尚未得到实际决定者的有效批准']);
  const checked=materializeCausalAuditAnchors(decodePlanningProofRows({
   status:'evaluated',reason:'实际逐一核对各个结果成立条件',proofRows},expected),body,{});
  expect(causalChapterEvidenceAddressIssues(checked,[{
   chapterNumber:3,anchorIds:catalog[0].anchorIds,resultAnchorIds:part
  }])).toEqual([]);
  expect(validateCausalAudit(checked,body,{}).verified).toBe(true);
  approved+=checked.transitions.length;
 }
 expect(approved).toBe(all.length);
});

it('large outline audit keeps every exact result but avoids resending all action IDs',()=>{
 const chapters=[{chapterNumber:3,chapterFunction:'climax',content:'员工核对异常，但主管尚未作出最终决定。',
   scenes:[{outcome:'主管暂缓处分决定。'}],
   characterActions:[{character:'员工',action:'员工当面递交带签名的记录。',result:'主管暂缓处分决定。'},
     {character:'员工',action:'员工向人事递交离职申请。',result:'离职申请已交，人事尚未批准。'}]}];
 const body=JSON.stringify(chapters),anchors=causalEvidenceAnchors(body,{});
 const {entries,aliasesByReview}=causalChapterEvidenceCatalog(chapters,anchors);
 const shown=causalPlanningProofPromptCatalog(chapters,entries,anchors);
 expect(shown).toHaveLength(1);
 expect(shown[0].bodyIndex).toBe(0);
 expect(shown[0].resultAnchorIds).toEqual(entries[0].resultAnchorIds);
 expect(shown[0]).not.toHaveProperty('anchorIds');
 expect(shown[0].actionLookup.length).toBeGreaterThan(0);
 const reviewedScene=anchors.find(a=>a.path==='0.scenes.0.outcome'&&shown[0].resultAnchorIds.includes(a.id));
 const siblingAction=anchors.find(a=>a.path==='0.characterActions.0.action');
 expect(reviewedScene).toBeDefined();
 expect(siblingAction).toBeDefined();
 // The scene result won the exact-text alias; its original character action
 // must still be available as a hint, without being assumed causal proof.
 expect(shown[0].actionLookup).toContainEqual({
   resultAnchorId:reviewedScene!.id,actionAnchorId:siblingAction!.id,
 });
 for(const hint of shown[0].actionLookup){
   const action=anchors.find(a=>a.id===hint.actionAnchorId)!;
   const result=anchors.find(a=>a.id===hint.resultAnchorId)!;
   expect(action.source).toBe('body');
   expect(action.path?.startsWith('0.characterActions.')).toBe(true);
   expect(result.source).toBe('body');
   expect(result.path?.startsWith('0.')).toBe(true);
   expect(action.text).not.toEqual(result.text);
 }
 // Small examples can grow when a valid cross-field address hint is added.
 // Preserve the complete proof inventory and avoid a misleading size claim.
 expect(shown[0]).not.toHaveProperty('anchorIds');
 expect(new Set(shown[0].resultAnchorIds).size).toBe(entries[0].resultAnchorIds.length);
 expect(shown[0].actionLookup.every(hint=>shown[0].resultAnchorIds.includes(hint.resultAnchorId))).toBe(true);
 expect(Object.values(aliasesByReview).flat().length).toBeGreaterThan(0);
 const hint=shown[0].actionLookup[0];
 const checked=materializeCausalAuditAnchors({status:'evaluated',reason:'核对主管实际处分或批准的前置条件',
   transitions:[{chapterNumber:3,actionAnchorId:hint.actionAnchorId,resultAnchorId:hint.resultAnchorId,
     bridgeAnchorId:'',status:'gap',reason:'递交记录或申请并不自动证明处分或审批已经发生'}]},body,{});
 expect(validateCausalAudit(checked,body,{}).verified).toBe(true);
 expect(validateCausalAudit(checked,body,{}).issues).toHaveLength(1);
});
