import {describe,it,expect,afterEach} from 'vitest';
import {CHAPTER_PROSE_SCOPE_POLICY,NATURAL_PROSE_POLICY,READER_ENGAGEMENT_POLICY,activeSystemWorkflowRules} from '../../../shared/src/system-workflow-rules.registry';
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
      expect(prompt.split(CHAPTER_PROSE_SCOPE_POLICY).length-1).toBe(1);
    }
  });
  it('drives humor, reversals and character highlights from already confirmed actions, not random inserted scenes',()=>{
    for(const phrase of ['已确认的欲望、弱点、关系和说话策略','具体触发','高光和钩子','前置可回溯信息','不为爽点强迫每章反转或牺牲']){
      expect(CHAPTER_PROSE_SCOPE_POLICY).toContain(phrase);
    }
    new ModuleStandardsService().onModuleInit();
    for(const stage of ['writing','review','quality_refine']){
      expect(standardDirectiveCache.get(stage)).toContain('高光和钩子只突出已经安排');
    }
  });
  it('requires expressive punctuation, natural paragraph breaks, flexible numerals, and traceable dialogue without a second style gate',()=>{
    for(const phrase of ['问号、感叹号','【】可用于','一至五字','谁在当前场景对谁说','“三分钟”','不要求把自然口语'])
      expect(NATURAL_PROSE_POLICY).toContain(phrase);
    const punctuation=detectForbiddenTells('“真的吗？！”她问。\\n\\n【次日·门口】他看完通知，回到办公室。');
    expect(punctuation.some(row=>row.ruleId==='56-punct-stacking')).toBe(false);
    new ModuleStandardsService().onModuleInit();
    for(const stage of ['writing','review','quality_refine']){
      const standard=standardDirectiveCache.get(stage);
      expect(standard.split(NATURAL_PROSE_POLICY).length-1).toBe(1);
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
