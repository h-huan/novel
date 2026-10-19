import { describe, expect, it } from 'vitest';
import { outlineResultClaimPrompt, resolveSourceEvidenceSpan, sourceEvidenceSpanCatalog, validateOutlineResultClaims } from './source-quality-review';
import { SOURCE_EVIDENCE_REFERENCE_POLICY } from '../../../shared/src/system-workflow-rules.registry';
import { SEED_MODULE_STANDARDS } from '../module-standards/module-standards.seed';

describe('source evidence addresses preserve original source and quality judgments',()=>{
  const context=JSON.stringify({action:'她拿起电话。\r\n\n 对方接通了！她开始询问。',other:'这是另一个来源。'});
  it('preserves every original character between valid endpoints, including blank lines',()=>{
    const spans=sourceEvidenceSpanCatalog(context)[0].spans;
    const first=spans[0],last=spans.at(-1)!;
    expect(resolveSourceEvidenceSpan(context,first.id,'S1')).toBe('她拿起电话。');
    expect(resolveSourceEvidenceSpan(context,first.id+'-'+last.id,['S1'])).toBe(JSON.parse(context).action);
    expect(resolveSourceEvidenceSpan(context,last.id+'-'+last.id,'S1')).toBe(last.text);
  });
  it.each(['S1.E1-S2.E1','S1.E99','S1.E1-S1.E99','S1.E5-S1.E1','S01.E1','S1.E0','S1.E1,E3','S1.E1-E3','S1.E1-S1.E3-extra',null])('rejects invalid or ambiguous address %s',ref=>{
    expect(resolveSourceEvidenceSpan(context,ref,'S1')).toBeNull();
  });
  it('rejects references outside the authorized parent even when the text exists',()=>{
    expect(resolveSourceEvidenceSpan(context,'S1.E1-S1.E5','S2')).toBeNull();
  });
  const rows=[{id:'a',scenes:JSON.stringify({characterActions:[{action:'她拿起电话拨给同事。',result:'电话接通。'}]})}];
  const proof=JSON.stringify({action:'她拿起电话拨给同事。对方接起电话。'});
  const check={ref:'a-A1-R1',status:'supported',basisRef:'S1',basisEvidenceRef:'S1.E1-S1.E2',reason:'同事接听的实际动作支持电话接通结果'};
  it('accepts complete valid ranges without modifying judgments or the report',()=>{
    const report={checks:[check]},before=JSON.stringify(report);
    expect(validateOutlineResultClaims(report,rows,proof)).toMatchObject({verified:true,findings:[]});
    expect(JSON.stringify(report)).toBe(before);
    expect(outlineResultClaimPrompt(rows,proof)).toContain(SOURCE_EVIDENCE_REFERENCE_POLICY);
    expect(JSON.stringify(SEED_MODULE_STANDARDS)).toContain(SOURCE_EVIDENCE_REFERENCE_POLICY);
  });
  it('retains genuine gaps and rejects unknown, conflicting quotes and missing coverage',()=>{
    expect(validateOutlineResultClaims({checks:[{...check,status:'gap',reason:'现有行动没有提供结果成立所需的条件'}]},rows,proof)).toMatchObject({verified:true,findings:[expect.stringContaining('没有提供')]});
    for(const report of [{checks:[{...check,status:'unknown'}]},{checks:[{...check,basisEvidence:'不存在的原文'}]},{checks:[]},{checks:[check,check]}])
      expect(validateOutlineResultClaims(report,rows,proof).verified).toBe(false);
  });
  it('keeps independent mechanism requirements when range references are used',()=>{
    const confinement=[{id:'a',scenes:JSON.stringify({characterActions:[{action:'她启动机关锁。',result:'对手被反锁在屋内。'}]})}];
    const sources=JSON.stringify({chapters:[{content:'她启动机关锁。门闭合了。'}],world:{rules:'机关锁启动后限制内侧开门。只能由外侧解除。'}});
    const candidate={...check,basisEvidenceRef:'S1.E1-S1.E2'};
    expect(validateOutlineResultClaims({checks:[candidate]},confinement,sources).verified).toBe(false);
    expect(validateOutlineResultClaims({checks:[{...candidate,mechanismBasisRef:'S2',mechanismEvidenceRef:'S2.E1-S2.E2'}]},confinement,sources).verified).toBe(true);
    expect(validateOutlineResultClaims({checks:[{...candidate,mechanismBasisRef:'S2',mechanismEvidenceRef:'S1.E1-S1.E2'}]},confinement,sources).verified).toBe(false);
  });
});
