import {describe,it,expect,afterEach} from 'vitest';
import {NATURAL_PROSE_POLICY,READER_ENGAGEMENT_POLICY,activeSystemWorkflowRules} from '../../../shared/src/system-workflow-rules.registry';
import {ModuleStandardsService} from '../module-standards/module-standards.service';
import {standardDirectiveCache} from '../module-standards/standard-directive.cache';
import {detectForbiddenTells} from '../../chain/hardline-scanner';
describe('natural prose and evidenced reading goals',()=>{
  afterEach(()=>standardDirectiveCache.clear());
  it('keeps one prose owner and delivers the same policy to generation, review and repair',()=>{
    const rules=activeSystemWorkflowRules();
    expect(rules.filter(r=>(r.details||[]).includes(NATURAL_PROSE_POLICY)).map(r=>r.id)).toEqual(['QLT-014']);
    new ModuleStandardsService().onModuleInit();
    for(const stage of ['writing','review','quality_refine']){
      const prompt=standardDirectiveCache.get(stage);
      expect(prompt.split(NATURAL_PROSE_POLICY).length-1).toBe(1);
      expect(prompt).toContain(READER_ENGAGEMENT_POLICY);
    }
  });
  it('does not exchange human tone for broken logic or unnecessary explanations',()=>{
    expect(NATURAL_PROSE_POLICY).toContain('事实矛盾');
    expect(NATURAL_PROSE_POLICY).toContain('必要因果');
    expect(NATURAL_PROSE_POLICY).toContain('确实需要的心理');
    expect(NATURAL_PROSE_POLICY).toContain('未到期谜底不解释');
    expect(NATURAL_PROSE_POLICY).toContain('清楚、句子通顺或偶尔规整本身不是缺陷');
    expect(READER_ENGAGEMENT_POLICY).toContain('不预测实测点击率');
  });
  it('does not reject a natural short exchange for lack of ornamental human signals',()=>{
    const text='“名单呢？”\n\n“还没送来。”\n\n“那先别签。我去问问。”';
    const findings=detectForbiddenTells(text);
    expect(findings.some(f=>['35','35b','42'].includes(f.ruleId))).toBe(false);
  });
});
