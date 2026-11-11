import {it,expect} from 'vitest';
import {isEvaluationOutput,modelSceneTab,standardScene} from './scenario-taxonomy';
it('recognizes independent rechecks without changing the configured model scene',()=>{
 for(const step of ['idea_premise_payoff_recheck','idea_premise_source_drift_review','idea_premise_overlap_review','idea_presentation_review']){
  expect(isEvaluationOutput('idea_generate',step)).toBe(true);
  expect(modelSceneTab('idea_generate')).toBe('idea_generate');
  expect(standardScene('idea_generate',step)).toBe('idea_generate');
 }
 expect(isEvaluationOutput('daily','body_length_recheck')).toBe(true);
 for(const step of ['idea_premise_pool_generation','idea_premise_selection','idea_card_structure','idea_premise_pool_reselection'])expect(isEvaluationOutput('idea_generate',step)).toBe(false);
});
