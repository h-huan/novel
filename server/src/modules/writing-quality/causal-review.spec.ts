import {causalAuditRepairTargets,applyCausalAuditRepair,causalAuditRepairPrompt} from './causal-review';
import { expect, it } from 'vitest';
import { materializeCausalAuditAnchors, validateCausalAudit } from './causal-review';
import { causalEvidenceAnchors, causalExitResultAnchors } from './causal-review';
import { preserveCausalCountercheckAnchors } from './causal-review';
import { causalChapterResultAnchors } from './causal-review';

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
