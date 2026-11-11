import {describe,it,expect} from 'vitest';
import {sourceBoundaryEvidenceContext,sourceEvidenceCatalog,sourceEvidenceSpanCatalog,packSourceEvidenceSpans,outlineResultClaimPrompt,validateOutlineResultClaims} from './source-quality-review';
describe('server-owned result-proof source spans',()=>{
 it('round-trips compact transport without removing sources, roles or original text',()=>{
  const packed=packSourceEvidenceSpans(context);
  const decoded=packed.rows.map(([id,path,spans])=>({id,path,spans:(spans as string[][]).map(([id,text])=>({id,text}))}));
  const catalog=sourceEvidenceSpanCatalog(context);
  expect(decoded).toEqual(catalog.map(source=>({id:source.id,path:source.path,spans:source.spans.map(({id,text})=>({id,text}))})));
  expect(catalog.map(source=>source.id)).toEqual(sourceEvidenceCatalog(context).map(source=>source.id));
  expect(catalog.every(source=>source.spans.every(span=>span.text.length>0))).toBe(true);
 });
 const rows=[{id:'c',plan_json:JSON.stringify({characterActions:[{action:'他填好账本。',result:'欠款记入账本。'}]})}];
 const context=sourceBoundaryEvidenceContext(JSON.stringify({chapters:[{content:'双方定下按月结清，什么时候方便什么时候给。她点了头。他在账本填入数字，前面标了个欠字。'}]}));
 const source=sourceEvidenceCatalog(context)[0],span=sourceEvidenceSpanCatalog(context)[0].spans[2];
 const check={ref:'c-A1-R1',status:'supported',basisRef:source.id,basisEvidenceRef:span.id,reason:'填写数字并标明欠款的实际动作支撑入账结果'};
 it('binds a selected actual sentence without requiring a retyped quote',()=>{
  expect(validateOutlineResultClaims({checks:[check]},rows,context)).toMatchObject({verified:true,findings:[]});
  expect(outlineResultClaimPrompt(rows,context)).toContain('basisEvidenceRef');
  expect(outlineResultClaimPrompt(rows,context)).toContain('什么时候方便什么时候给');
  expect(sourceEvidenceSpanCatalog(context)[0].spans.map(row=>row.text).join('')).toBe(source.text);
 });
 it('rejects invented or mismatched source addresses and conflicting supplied quotes',()=>{
  for(const change of [{basisRef:'S999'},{basisEvidenceRef:'S1.E999'},
   {basisEvidence:'他在账本填入数字，省略中间文字后标欠。'}])
   expect(validateOutlineResultClaims({checks:[{...check,...change}]},rows,context).verified).toBe(false);
 });
 it('keeps actual gaps, unknowns and result-self-proof blocked under the existing quality rules',()=>{
  expect(validateOutlineResultClaims({checks:[{...check,status:'gap',reason:'实际动作尚未交代对方接受延期还款的必要条件'}]},rows,context))
   .toMatchObject({verified:true,findings:expect.any(Array)});
  expect(validateOutlineResultClaims({checks:[{...check,status:'unknown'}]},rows,context).verified).toBe(false);
  const own=sourceBoundaryEvidenceContext(JSON.stringify({result:'欠款记入账本。'}));
  expect(validateOutlineResultClaims({checks:[{...check,basisRef:'S1',basisEvidenceRef:'S1.E1'}]},rows,own).verified).toBe(false);
 });
 it('retains independent mechanism proof requirements for extra capabilities',()=>{
  const disputed=[{id:'c',scenes:JSON.stringify({characterActions:[{action:'他在门外转动锁。',result:'屋内的人被反锁。'}]})}];
  const ctx=sourceBoundaryEvidenceContext(JSON.stringify({world:{rule:'这把机关锁在外侧启动后会阻止内侧开门。'},chapters:[{content:'他在门外转动锁，把屋内的人关住。'}]}));
  const sources=sourceEvidenceSpanCatalog(ctx),action=sources.find(row=>row.path.includes('chapters'))!,rule=sources.find(row=>row.path.includes('.rule'))!;
  const candidate={...check,basisRef:action.id,basisEvidenceRef:action.spans[0].id};
  expect(validateOutlineResultClaims({checks:[candidate]},disputed,ctx).verified).toBe(false);
  expect(validateOutlineResultClaims({checks:[{...candidate,mechanismBasisRef:rule.id,mechanismEvidenceRef:rule.spans[0].id}]},disputed,ctx).verified).toBe(true);
 });
});
