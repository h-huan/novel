import { describe, it, expect } from 'vitest';
import { compileCharacterContract, reviewCharacterContracts, attributeCharacterEvidence } from './character-contract';
import { narrativeTrace } from './narrative-trace';
import { parseStageScore, SCORE_DIMENSIONS } from './stage-score';
import { readConstitution } from '../project/creative-constitution';
import { qualityGate } from './quality-issue';
import { executeRepair, repairPrompt } from './repair-strategy-registry';

const contract = compileCharacterContract({ id: 'lin', name: '林岚', forbidden_words: '["保证"]', profile_json: JSON.stringify({ voiceContract: { sentenceLength: { max: 20 }, directness: 'direct', moralBoundary: ['不可杀人'] } }) });
const content = '林岚说：“我保证明日归来。”\n' + '风吹过旧城的石墙，铁门上爬满暗红色的锈迹。'.repeat(10);
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
});
describe('non-dilutable scoring and semantic attribution', () => {
  const input = {projectId:'p',runId:'r',stage:'chapter' as const,content,constitution:readConstitution({}),contracts:[contract]};
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
