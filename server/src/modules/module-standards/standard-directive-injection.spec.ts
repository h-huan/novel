import { ideaCardStructuringDirective } from '../../chain/idea-discovery-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { standardDirectiveCache } from './standard-directive.cache';
import { activeSystemWorkflowRules, WORLD_SOURCE_COMPLETENESS_POLICY, IDEA_PRESELECTION_REVIEW_POLICY, TEMPORAL_FACT_CONTINUITY_POLICY, OUTLINE_STATE_ACCUMULATION_POLICY, CROSS_STAGE_REVIEW_POLICY, STORY_CAUSAL_REVIEW_POLICY, CHARACTER_VOICE_POLICY, READER_ENGAGEMENT_POLICY, PLATFORM_MEASUREMENT_REVIEW_POLICY, SOURCE_QUALITY_POLICY } from './system-workflow-rules.registry';
import { RealLLMService } from '../../chain/real-llm.service';
import { crossStageReviewDirective } from '../../chain/cross-stage-review';
import { buildOutlineContinuityContext, buildOutlineFactReviewPrompt } from '../../chain/outline-fact-ledger';
import { temporalReviewPrompt, temporalReviewCatalog } from '../../chain/temporal-review-coverage';
import { semanticProgressAuditPrompt } from '../../chain/semantic-progress-audit';
import { causalAuditRepairPrompt } from '../writing-quality/causal-review';
import { chapterResponsibilityPlanningDirective, buildChapterResponsibilityAuditPrompt, buildChapterResponsibilityRepairPrompt } from '../../../shared/src/chapter-responsibility-review';

const count = (text: string, policy: string) => text.split(policy).length - 1;
const policies = [TEMPORAL_FACT_CONTINUITY_POLICY, OUTLINE_STATE_ACCUMULATION_POLICY, CROSS_STAGE_REVIEW_POLICY, STORY_CAUSAL_REVIEW_POLICY, CHARACTER_VOICE_POLICY, READER_ENGAGEMENT_POLICY, PLATFORM_MEASUREMENT_REVIEW_POLICY];
afterEach(() => standardDirectiveCache.clear());

describe('public policy single injection', () => {
  it('scopes framework review without removing complete chapter language gates', () => {
    standardDirectiveCache.rebuild();
    const snapshot=standardDirectiveCache.snapshot('review',true,'creation_cross_stage_review');
    expect(snapshot.ruleIds).toEqual(expect.arrayContaining(['AUTH-004','ARCH-002','CTX-006','CTX-007','CTX-008','RPR-004']));
    const frame=standardDirectiveCache.get('review','creation_cross_stage_review')+SOURCE_QUALITY_POLICY+crossStageReviewDirective();
    expect(count(frame,SOURCE_QUALITY_POLICY)).toBe(1);
    expect(count(frame,CROSS_STAGE_REVIEW_POLICY)).toBe(1);
    expect(standardDirectiveCache.snapshot('review').ruleIds).toEqual(expect.arrayContaining(['QLT-003','QLT-011','QLT-014']));
  });
  it.each(['idea_generate','world_build','character_design','timeline','outline','writing','review','refinement','state_extraction','daily'])('preserves temporal and accumulated-state coverage in %s', scenario => {
    standardDirectiveCache.rebuild();
    const prompt = standardDirectiveCache.get(scenario);
    expect(count(prompt, TEMPORAL_FACT_CONTINUITY_POLICY)).toBe(1);
    expect(count(prompt, OUTLINE_STATE_ACCUMULATION_POLICY)).toBe(1);
    expect(count(prompt, WORLD_SOURCE_COMPLETENESS_POLICY)).toBe(1);
    expect(standardDirectiveCache.snapshot(scenario).ruleIds).toContain('CTX-008');
  });
  it('keeps all active rule IDs and independent review, evidence and repair contracts', () => {
    standardDirectiveCache.rebuild();
    expect(activeSystemWorkflowRules()).toHaveLength(60);
    expect(count(standardDirectiveCache.get('idea_generate'),IDEA_PRESELECTION_REVIEW_POLICY)).toBe(1);
    for (const policy of policies) expect(count(standardDirectiveCache.get('review'),policy)).toBe(1);
    expect(standardDirectiveCache.get('review')).toContain('能结构化且可复算的冲突必须指出 identity');
    expect(standardDirectiveCache.get('review')).toContain('呈现信息的原文');
    expect(standardDirectiveCache.get('refinement')).toContain('事实源冲突按 Canon 优先级');
  });
  it('retains full defaults for standalone helpers and one policy in automatically injected calls', async () => {
    standardDirectiveCache.rebuild();
    const factInput = { canonicalBrief:'{}',world:{},previousLedger:[],chapters:[] };
    const auditInput = { executionStandard:'',creativeBrief:'{}',shortStoryCard:{},worldContinuityDirective:'',plan:[] };
    const repairInput = { strategyDirective:'',issueContracts:[],currentPlan:[],creativeBrief:'{}',shortStoryCard:{},worldContinuityDirective:'',requiredChapterCount:5 };
    const catalog = temporalReviewCatalog('今天出门。');
    const pairs = [
      [crossStageReviewDirective(),crossStageReviewDirective(false), CROSS_STAGE_REVIEW_POLICY, 'consistent'],
      [buildOutlineContinuityContext([],[]),buildOutlineContinuityContext([],[],false),TEMPORAL_FACT_CONTINUITY_POLICY,'前批事实台账'],
      [buildOutlineFactReviewPrompt(factInput),buildOutlineFactReviewPrompt({...factInput,includePolicy:false}),TEMPORAL_FACT_CONTINUITY_POLICY,'location1'],
      [temporalReviewPrompt('今天出门。',catalog,'',''),temporalReviewPrompt('今天出门。',catalog,'','',[],false),TEMPORAL_FACT_CONTINUITY_POLICY,'temporalAudit'],
      [semanticProgressAuditPrompt('原文','改文',[],[]),semanticProgressAuditPrompt('原文','改文',[],[],false),TEMPORAL_FACT_CONTINUITY_POLICY,'resolved'],
      [causalAuditRepairPrompt({},[],'正文',{}).prompt,causalAuditRepairPrompt({},[],'正文',{},false).prompt,STORY_CAUSAL_REVIEW_POLICY,'bridgeAnchorId'],
      [chapterResponsibilityPlanningDirective(),chapterResponsibilityPlanningDirective(false),TEMPORAL_FACT_CONTINUITY_POLICY,'CR-2'],
      [buildChapterResponsibilityAuditPrompt(auditInput),buildChapterResponsibilityAuditPrompt({...auditInput,includeSharedPolicies:false}),TEMPORAL_FACT_CONTINUITY_POLICY,'fix'],
      [buildChapterResponsibilityRepairPrompt(repairInput),buildChapterResponsibilityRepairPrompt({...repairInput,includeSharedPolicies:false}),TEMPORAL_FACT_CONTINUITY_POLICY,'resolutions'],
    ];
    const router = {getConfig:()=>({defaults:{maxTokens:4096},scenarios:{}}),getModelForScenario:()=>({modelName:'deepseek-flash',temperature:0.1})};
    const service = new RealLLMService(router as any);
    const call = vi.fn().mockResolvedValue({content:'{"ok":true}',finishReason:'stop'});
    (service as any).callModel=call;
    for (const [standalone, prompt, policy, contract] of pairs) {
      expect(standalone).toContain(policy);
      expect(prompt).not.toContain(policy);
      expect(prompt).toContain(contract);
      await service.generate({prompt,scenario:'review',responseFormat:'json_object'});
      const sent=call.mock.calls.at(-1)!;
      const effective=String(sent[1])+'\n'+String(sent[2]);
      for(const shared of policies) expect(count(effective,shared)).toBe(1);
      expect(sent[1]).toBe(prompt);
    }
  });
});

it('injects the preselection policy once at the actual card-structuring entry', () => {
  standardDirectiveCache.rebuild();
  expect(ideaCardStructuringDirective({premiseId:'A'})).toContain(IDEA_PRESELECTION_REVIEW_POLICY);
  const prompt=ideaCardStructuringDirective({premiseId:'A'},[],false);
  expect(prompt).not.toContain(IDEA_PRESELECTION_REVIEW_POLICY);
  expect(count(prompt+standardDirectiveCache.get('idea_generate'),IDEA_PRESELECTION_REVIEW_POLICY)).toBe(1);
});

it('scopes only the registered temporal workers, preserving authority, dependencies and all full chapter gates',()=>{standardDirectiveCache.rebuild();for(const step of ['alignment_temporal_review','alignment_temporal_contract']){const scoped=standardDirectiveCache.get('review',step);expect(count(scoped,TEMPORAL_FACT_CONTINUITY_POLICY)).toBe(1);expect(scoped).toContain('AUTH-002');expect(scoped).not.toContain('QLT-014');expect(scoped).not.toContain('QLT-003');expect(standardDirectiveCache.snapshot('review',true,step).ruleIds).toContain('CTX-008');}const full=standardDirectiveCache.get('review','alignment_review');expect(full).toContain('QLT-003');expect(full).toContain('QLT-014');expect(activeSystemWorkflowRules()).toHaveLength(60);});

it('scopes insertion workers without removing the full chapter quality gates',()=>{
 standardDirectiveCache.rebuild();
 for(const step of ['body_length_review','body_length_recheck','body_length_evidence_contract']){
  const scoped=standardDirectiveCache.get('review',step);
  for(const id of ['GEN-007','AUTH-002','CTX-008','RPR-004'])expect(scoped).toContain(id);
  expect(scoped).not.toContain('QLT-014');expect(scoped.length).toBeLessThan(standardDirectiveCache.get('review','alignment_review').length);
 }
 expect(standardDirectiveCache.get('review','alignment_review')).toContain('QLT-014');expect(activeSystemWorkflowRules()).toHaveLength(60);
});
it('uses task-specific generation details while retaining full final quality rules and identical rule inventory',()=>{
 standardDirectiveCache.rebuild();
 const full=standardDirectiveCache.get('idea_generate');
 const selected=standardDirectiveCache.get('idea_generate','idea_premise_selection');
 const card=standardDirectiveCache.get('idea_generate','idea_card_structure');
 expect(selected.length).toBeLessThan(full.length);
 expect(card).toContain('普通直接因果');expect(selected).toContain('反转');expect(selected).toContain('必要条件');
 expect(selected).not.toContain('坐标由程序按 UTF-16');
 expect(standardDirectiveCache.snapshot('idea_generate',true,'idea_premise_selection').ruleIds)
  .toEqual(standardDirectiveCache.snapshot('idea_generate').ruleIds);
 expect(standardDirectiveCache.get('idea_generate','idea_presentation_review')).toBe(full);
 expect(standardDirectiveCache.get('review')).toContain('坐标由程序按 UTF-16');
 expect(standardDirectiveCache.snapshot('review').ruleIds).toEqual(expect.arrayContaining(['QLT-003','QLT-011','QLT-014']));
 standardDirectiveCache.clear();
});
it('keeps chapter causal and source requirements during outline generation without injecting prose-report machinery',()=>{
 standardDirectiveCache.rebuild();
 const plan=standardDirectiveCache.get('outline','creation_chapter_detail');
 expect(plan.length).toBeLessThan(standardDirectiveCache.get('outline').length);
 expect(plan).toContain(SOURCE_QUALITY_POLICY);expect(plan).toContain('CR-1');
 expect(plan).toContain('关键');expect(plan).not.toContain('坐标由程序按 UTF-16');
 expect(standardDirectiveCache.get('review','alignment_review')).toContain('坐标由程序按 UTF-16');
 standardDirectiveCache.clear();
});
