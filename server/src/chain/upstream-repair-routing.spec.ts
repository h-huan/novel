import { describe,it,expect } from 'vitest';
import { upstreamRepairTrigger,upstreamDiagnosisInput,validateUpstreamDiagnosis } from './upstream-repair-routing';
describe('upstream repair routing',()=>{
  it('does not infer an upstream fault on the first failure or on a passed draft',()=>{
    expect(upstreamRepairTrigger([],['对话占比不足'])).toBeNull();
    expect(upstreamRepairTrigger([['重复取物']],[])).toBeNull();
  });
  it('routes recurring families even when wording changes and issue count shrinks',()=>{
    expect(upstreamRepairTrigger([['对白占比不足','开篇事件后移']],['对话占比仍然过低'])).toContain('同类');
    expect(upstreamRepairTrigger([['倒计时错误']],['时间先后不一致'])).toContain('同类');
  });
  it('routes growing and repeated downstream cycles',()=>{
    expect(upstreamRepairTrigger([['旧问题']],['旧问题','新发现问题'])).toContain('增长');
    expect(upstreamRepairTrigger([['问题甲'],['问题乙']],['问题丙'])).toContain('连续');
  });
  it('requires actual cross-source evidence and the proper origin',()=>{
    const {catalog}=upstreamDiagnosisInput('她已经离开。',{outline:'她留在屋里。',context:'她仍在屋里。',review:'人物位置冲突'},['位置矛盾'],'同类问题');
    const row={stage:'generation_execution',anchorIds:['body:p1','outline:p1'],reason:'正文离开与本章要求留在屋里的明确事件不一致。',nextAction:'先核对生成请求是否完整消费这一章节合同，再检查其它人物位置。'};
    expect(validateUpstreamDiagnosis({status:'evaluated',findings:[row]},catalog)?.findings[0].evidence[0].text).toBe('她已经离开。');
    expect(validateUpstreamDiagnosis({status:'evaluated',findings:[{...row,anchorIds:['body:p99','outline:p1']}]},catalog)).toBeNull();
    expect(validateUpstreamDiagnosis({status:'evaluated',findings:[{...row,anchorIds:['body:p1','body:p1']}]},catalog)).toBeNull();
    expect(validateUpstreamDiagnosis({status:'evaluated',findings:[{...row,stage:'context_assembly'}]},catalog)).toBeNull();
  });
  it('marks truncated sources rather than claiming missing input',()=>{
    const input=upstreamDiagnosisInput('正文',{context:'原始资料。'.repeat(5000)},['缺陷'],'诊断');
    expect(input.catalog.find(a=>a.source==='context')?.complete).toBe(false);
    expect(input.prompt).toContain('截断资料不能证明不存在');
  });
});
