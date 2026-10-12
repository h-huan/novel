import { describe, expect, it, afterEach } from 'vitest';
import { CHARACTER_VOICE_POLICY, SYSTEM_WORKFLOW_RULESET_VERSION } from '../../../shared/src/system-workflow-rules.registry';
import { compileCharacterContract } from './character-contract';
import { ModuleStandardsService } from '../module-standards/module-standards.service';
import { standardDirectiveCache } from '../module-standards/standard-directive.cache';
import { verifySemanticEvidence } from './quality-issue';
import { repairPrompt, repairStrategies } from './repair-strategy-registry';

describe('generic character voice execution',()=>{
  afterEach(()=>standardDirectiveCache.clear());
  it('delivers one shared policy to character, outline, prose, review and polish',()=>{
    new ModuleStandardsService().onModuleInit();
    for(const stage of ['character_design','outline','writing','review','polish']){
      const snapshot=standardDirectiveCache.snapshot(stage);
      expect(snapshot.ruleIds).toContain('GEN-006');
      expect(standardDirectiveCache.get(stage)).toContain(CHARACTER_VOICE_POLICY);
      expect(snapshot.rulesetVersion).toBe(SYSTEM_WORKFLOW_RULESET_VERSION);
    }
  });
  it('keeps knowledge, relationships, intent and causality in every local repair',()=>{
    for(const strategy of Object.keys(repairStrategies)){
      expect(repairPrompt(strategy)).toContain('[GEN-006]');
      expect(repairPrompt(strategy)).toContain('知情边界、关系状态、必要因果');
    }
  });
  it.each([
    ['家庭','姐姐说：“我需要全面评估这件事，再制定后续方案。”','弟弟说：“我也需要全面评估这件事，再制定后续方案。”','姐姐想追问，弟弟想躲避，却都采用同一种完整方案说明，没有表现不同应对目的'],
    ['职业','维修员说：“我们应综合评估风险，确保任务顺利开展。”','顾客说：“我们应综合评估成本，确保任务顺利开展。”','维修员确认故障而顾客催促退款，两人却都以同一机构汇报方式回应'],
    ['幻想','学徒说：“我将系统分析局势，再实施有效措施。”','守卫说：“我将系统分析环境，再实施有效措施。”','学徒请求帮助而守卫拒绝放行，两人采用相同解释结构而没有体现请求与拒绝的应对方式'],
  ])('requires comparative evidence and explanation across %s situations',(_scene,evidence,shownEvidence,basisReason)=>{
    const content=evidence+'\n'+shownEvidence;
    const finding={issueType:'same_voice_characters',evidence,shownEvidence,basisReason};
    expect(verifySemanticEvidence(finding,content).verified).toBe(true);
    expect(verifySemanticEvidence({...finding,shownEvidence:''},content).verified).toBe(false);
    expect(verifySemanticEvidence({...finding,shownEvidence:'不存在的另一人物对白'},content).verified).toBe(false);
    expect(verifySemanticEvidence({...finding,basisReason:''},content).verified).toBe(false);
  });
  it('never proves homogeneity from the same short answer and preserves ordinary quote validation',()=>{
    const result=verifySemanticEvidence({issueType:'same_voice_characters',evidence:'知道了。',shownEvidence:'知道了。',basisReason:'两人用同一句话'},'甲说：“知道了。”乙说：“知道了。”');
    expect(result.verified).toBe(false);
    expect(verifySemanticEvidence({issueType:'same_voice_characters',evidence:'拼接假原文',shownEvidence:'乙问：“多久？”',basisReason:'比较解释'},'甲说：“还没完成。”乙问：“多久？”').verified).toBe(false);
  });
});


describe('current character style profiles', () => {
  it('keeps distinct registers, relationships and pressure responses for participating roles', () => {
    const restrained = compileCharacterContract({id:'a', name:'甲', profile_json:{voiceContract:{speechRegister:'克制、含蓄', speechRhythm:['停顿后确认'], toneToDifferentPeople:{family:'放松', stranger:'谨慎'}, dangerBehavior:'先确认出口'}}});
    const defensive = compileCharacterContract({id:'b', name:'乙', profile_json:{voiceContract:{speechRegister:'口语、嘴硬', speechRhythm:['改口'], toneToDifferentPeople:{family:'关心但不直说', stranger:'直接'}, dangerBehavior:'先保护同伴'}}});
    expect(restrained.speechRegister).toBe('克制、含蓄');
    expect(defensive.speechRegister).toBe('口语、嘴硬');
    expect(restrained.toneToDifferentPeople).toEqual({family:'放松', stranger:'谨慎'});
    expect(defensive.dangerBehavior).toBe('先保护同伴');
    expect(restrained.catchphrases).toEqual([]);
    expect(defensive.catchphrases).toEqual([]);
  });
  it('honors author-cleared style fields over old dialogue data and preserves unknown traits', () => {
    const current = compileCharacterContract({id:'a', name:'甲', dialogue_style:'旧方言', profile_json:{voiceContract:{speechRegister:'', catchphrases:[], toneToDifferentPeople:null}}});
    expect(current.speechRegister).toBeNull();
    expect(current.catchphrases).toEqual([]);
    expect(current.toneToDifferentPeople).toBeNull();
    expect(current.dangerBehavior).toBeNull();
  });
  it('changes the contract version when current relational voice preferences change', () => {
    const row={id:'a',name:'甲',profile_json:{voiceContract:{speechRegister:'口语',toneToDifferentPeople:{friend:'熟悉',stranger:'谨慎'}}}};
    const before=compileCharacterContract(row);
    const after=compileCharacterContract({...row,profile_json:{voiceContract:{...row.profile_json.voiceContract,toneToDifferentPeople:{friend:'疏远',stranger:'谨慎'}}}});
    expect(after.version).not.toBe(before.version);
    expect(after.speechRegister).toBe(before.speechRegister);
    expect(after.toneToDifferentPeople).toEqual({friend:'疏远',stranger:'谨慎'});
  });
});
