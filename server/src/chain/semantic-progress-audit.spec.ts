import { TEMPORAL_FACT_CONTINUITY_POLICY } from '../../shared/src/system-workflow-rules.registry';
import { describe, expect, it } from 'vitest';
import { validateSemanticProgressAudit, semanticProgressAuditPrompt } from './semantic-progress-audit';
const existing={id:0,status:'existing',beforeAnchorId:'before:p1',afterAnchorId:'after:p1',reason:'原稿和候选均没有印出改版纸样，因此是原有缺口。'};
describe('bounded semantic progress evidence contract',()=>{
  it('accepts a complete existing-defect audit with real before and after anchors',()=>{
    expect(validateSemanticProgressAudit({findings:[existing]},'原稿。','候选。',1)).toBe(true);
  });
  it('rejects newly introduced or uncertain defects even with valid references',()=>{
    for(const status of ['introduced','unverified']) expect(validateSemanticProgressAudit({findings:[{...existing,status}]},'原稿。','候选。',1)).toBe(false);
  });
  it('rejects missing, duplicated, fabricated or reversed source references',()=>{
    expect(validateSemanticProgressAudit({findings:[]},'原稿。','候选。',1)).toBe(false);
    expect(validateSemanticProgressAudit({findings:[existing,existing]},'原稿。','候选。',2)).toBe(false);
    for(const beforeAnchorId of ['before:p99','after:p1']) expect(validateSemanticProgressAudit({findings:[{...existing,beforeAnchorId}]},'原稿。','候选。',1)).toBe(false);
  });
  it('requires a proved original resolution when the reviewer count does not fall',()=>{
    const resolved={beforeIssueId:0,beforeAnchorId:'before:p1',afterAnchorId:'after:p1',reason:'原来的未送药钱已改为失约，并且删除全部已收到药钱的描述。'};
    expect(validateSemanticProgressAudit({findings:[existing]},'原稿。','候选。',1,2)).toBe(false);
    expect(validateSemanticProgressAudit({findings:[existing],resolved:[resolved]},'原稿。','候选。',1,2)).toBe(true);
    expect(validateSemanticProgressAudit({findings:[existing],resolved:[{...resolved,beforeIssueId:9}]},'原稿。','候选。',1,2)).toBe(false);
    expect(validateSemanticProgressAudit({findings:[existing],resolved:[{...resolved,afterAnchorId:'after:p99'}]},'原稿。','候选。',1,2)).toBe(false);
  });
 it('uses the same interval constraints when deciding whether a local repair introduced a conflict',()=>{
  const prompt=semanticProgressAuditPrompt('已经等了三个小时。','已经等了两个多小时。',['与明确时点不符'],['比原上界更紧']);
  expect(prompt).toContain(TEMPORAL_FACT_CONTINUITY_POLICY);
  expect(prompt).toContain('原问题'); expect(prompt).toContain('改前/改后全文段落');
 });

});
