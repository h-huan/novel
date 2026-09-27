import { describe, it, expect } from 'vitest';
import { compileCharacterContract, reviewCharacterContracts, attributeCharacterEvidence } from './character-contract';
import { narrativeTrace } from './narrative-trace';
import { parseStageScore, SCORE_DIMENSIONS, stageJudgePrompt } from './stage-score';
import { readConstitution } from '../project/creative-constitution';
import { qualityGate } from './quality-issue';
import { defaultRepairStrategy, executeRepair, repairPrompt } from './repair-strategy-registry';
import { repairStrategies } from './repair-strategy-registry';

const contract = compileCharacterContract({ id: 'lin', name: '林岚', forbidden_words: '["保证"]', profile_json: JSON.stringify({ voiceContract: { sentenceLength: { max: 20 }, directness: 'direct', moralBoundary: ['不可杀人'] } }) });
const content = '林岚说：“我保证明日归来。”\n' + '风吹过旧城的石墙，铁门上爬满暗红色的锈迹。'.repeat(10);
const COMPLETE_STANDARDS = {
  target_platform: 'fanqie',
  settings: { category: '悬疑', storyTone: ['冷峻'], writingStyle: ['简练'], webNovelGenre: ['都市'], pov: '第三人称限知' },
};
describe('executable character contracts', () => {
  it('compiles stable versions from existing fields and preserves unknowns', () => {
    expect(contract.directness).toBe('direct'); expect(contract.explanationTolerance).toBeNull();
    expect(compileCharacterContract({ id:'c',name:'林',profile_json:'{"directness":"low","speech_style":"short"}' }).version)
      .toBe(compileCharacterContract({ name:'林',id:'c',profile_json:'{"speech_style":"short","directness":"low"}' }).version);
    expect(compileCharacterContract({ id:'lin',name:'林岚',forbidden_words:'别的词' }).version).not.toBe(contract.version);
  });
  it('attributes explicit speech, verifies evidence and refuses ambiguous speakers', () => {
    const review = reviewCharacterContracts({ projectId:'p',runId:'r',content },[contract]);
    expect(review.issues).toHaveLength(1); expect(review.issues[0].entityId).toBe('lin');
    expect(review.issues[0].evidence.verified).toBe(true);
    expect(attributeCharacterEvidence('有人说：“保证。”',[contract])).toHaveLength(0);
    expect(attributeCharacterEvidence('林岚和叶风说：“保证。”',[contract,compileCharacterContract({id:'ye',name:'叶风'})])).toHaveLength(0);
  });
  it('executes voice patches only inside the implicated character evidence', () => {
    const issues = reviewCharacterContracts({projectId:'p',runId:'r',content},[contract]).issues;
    expect(executeRepair('character_voice_contract_patch',{content,issues,contracts:[contract]},[{original:'保证',replacement:'尽量'}])).toContain('尽量');
    expect(() => executeRepair('character_voice_contract_patch',{content,issues,contracts:[contract]},[{original:'铁门',replacement:'木门'}])).toThrow();
    expect(repairPrompt('platform_metric_patch')).not.toBe(repairPrompt('scene_structure_patch'));
  });
  it('states the change budget as a hard limit identical to the executor enforcement', () => {
    // 提示词必须与 applyLocalPatches 的硬闸门同口径：写「尽量控制在…以内」会让模型超预算输出，
    // 执行器直接拒绝 → 整轮精修作废，同一批缺陷还得再跑一轮（用户问题 2「减少重复流程」）。
    for (const id of Object.keys(repairStrategies) as Array<keyof typeof repairStrategies>) {
      const prompt = repairPrompt(id);
      expect(prompt).toContain(`不得超过全文${repairStrategies[id].ratio * 100}%`);
      expect(prompt).not.toContain('尽量把总改动范围控制在');
    }
  });
  it('repairs a blocking logic issue together with its structural root cause', () => {
    expect(defaultRepairStrategy(['constitution.logic', 'structure.scene_event_mismatch', 'pacing.missing_breathing_beat']))
      .toBe('scene_structure_patch');
    const outline = JSON.stringify({
      content: '李明拍下合同，又在回店后拍下合同。',
      scenes: [{ location: '门店', outcome: '倒计时开始' }],
      hook: '再次拍下合同。',
    });
    const repaired = executeRepair('scene_structure_patch', { content: outline, issues: [], structured: true }, [
      { original: '李明拍下合同，又在回店后拍下合同。', replacement: '李明递出合同，倒计时开始。' },
      { original: '再次拍下合同。', replacement: '许苗决定重返1402。' },
    ]);
    expect(JSON.parse(repaired)).toMatchObject({ content: '李明递出合同，倒计时开始。', hook: '许苗决定重返1402。' });
  });
});
describe('non-dilutable scoring and semantic attribution', () => {
  const input = {projectId:'p',runId:'r',stage:'chapter' as const,content,constitution:readConstitution(COMPLETE_STANDARDS),contracts:[contract]};
  const raw = (low: string) => ({dimensions:Object.fromEntries(SCORE_DIMENSIONS.map(k => [k,{score:k===low?65:100,reason:'测试证据',evidence:[content]}]))});
  for (const key of ['character_voice','world_rules','context','logic']) it(`blocks ${key} below its floor despite high weighted score`, () => {
    const score = parseStageScore(raw(key),input); expect(score.overallScore).toBeGreaterThan(90);
    expect(qualityGate(score.issues,true).passed).toBe(false); expect(score.gateStatus).toBe('blocked');
  });
  it('rejects invented character attribution and unknown contract fields', () => {
    const issue = {ruleId:'character_voice.directness',message:'偏移',evidence:'林岚说：“我保证明日归来。”',characterId:'lin',contractVersion:contract.version,contractField:'directness'};
    expect(parseStageScore({issues:[issue]},input).issues).toHaveLength(1);
    expect(parseStageScore({issues:[{...issue,characterId:'invented'}]},input).issues).toHaveLength(0);
  });
  it('asks the judge only for dimensions applicable to the current stage', () => {
    const prompt = stageJudgePrompt(content, 'ctx', readConstitution({ target_platform: 'fanqie' }), 'world');
    // 六维创作前提与本阶段适用的质量维度都进入评审。
    expect(prompt).toContain('platform、category、tone、style、genre、context、logic、completeness、world_rules');
    expect(prompt).toContain('本阶段未设置标准的维度：分类、基调、文风、流派');
    expect(prompt).not.toContain('"prose":');
    expect(prompt).not.toContain('"character_voice":');
  });
});
it('compares scenes and chapters without claiming semantic certainty', () => {
  const scene = '他看见了钥匙。守卫拒绝放行。他握紧拳头。他决定离开。';
  const trace = narrativeTrace(scene+'\n\n'+scene,[{id:'old',content:scene}]);
  expect(trace.risks.some(r => r.comparisonId==='old')).toBe(true);
  expect(trace.status).toBe('heuristic_risk_only');
  const dialogue = narrativeTrace('甲说：“因为我们明日动身，所以现在准备。”\n'.repeat(8),[]);
  expect(dialogue.dialogueFunction.informationRatio).toBe(1);
  expect(dialogue.risks.some(r => r.ruleId.includes('dialogue'))).toBe(true);
});
