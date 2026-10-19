import {describe,it,expect} from 'vitest';
import {discoveryDimensionSelectionIssues,applyOrderedIdeaRepairPatches,ideaGateLocalRepairDirective} from './idea-discovery-contract';
const options=['都市','小人物','逆袭','打脸回报','悬念反转','成长'];
describe('one contract for discovery tag choices and repairs',()=>{
 it('allows one or several random dictionary choices, including the latest six-tag shape',()=>{
  for(const values of [options.slice(0,1),options.slice(0,3),options])expect(discoveryDimensionSelectionIssues(values,[],options)).toEqual([]);
 });
 it('rejects unknown, empty, duplicate and nonstring choices',()=>{
  for(const value of [[],['未知'],['都市','都市'],[1],[''],null])expect(discoveryDimensionSelectionIssues(value,[],options).length).toBeGreaterThan(0);
 });
 it('requires every manual choice and forbids additions, regardless of count',()=>{
  const selected=['扮猪吃虎','系统流','都市战神'];
  expect(discoveryDimensionSelectionIssues([...selected].reverse(),selected,[])).toEqual([]);
  for(const value of [selected.slice(0,2),[...selected,'未知'],['系统流','系统流','都市战神']])expect(discoveryDimensionSelectionIssues(value,selected,[]).length).toBeGreaterThan(0);
 });
 it('accepts all six allowed labels in a local repair without altering story text',()=>{
  const card={sourcePremiseId:'P1',plotTags:['都市'],description:'原故事的选择和因果保持原样'};
  const result=applyOrderedIdeaRepairPatches([card],[{dimensionPatch:{plotTags:options}}],[],[],[],[{plotTags:options}],[0])[0];
  expect(result.plotTags).toEqual(options);expect(result.description).toBe(card.description);expect(card.plotTags).toEqual(['都市']);
 });
 it('preserves manual all-of inheritance during repair, before further audit',()=>{
  const selected=['扮猪吃虎','系统流','都市战神'],card={sourcePremiseId:'P1',webNovelGenre:selected};
  expect(()=>applyOrderedIdeaRepairPatches([card],[{dimensionPatch:{webNovelGenre:['系统流']}}],[],[],[],[{webNovelGenre:selected}],[0],[{webNovelGenre:selected}])).toThrow();
  expect(applyOrderedIdeaRepairPatches([card],[{dimensionPatch:{webNovelGenre:selected}}],[],[],[],[{webNovelGenre:selected}],[0],[{webNovelGenre:selected}])[0].webNovelGenre).toEqual(selected);
 });
 it('keeps unapproved tag fields and invalid dictionary labels blocked',()=>{
  for(const patch of [{dimensionPatch:{storyTone:['都市']}},{dimensionPatch:{plotTags:['未知']}}])expect(()=>applyOrderedIdeaRepairPatches([{sourcePremiseId:'P1'}],[patch],[],[],[],[{plotTags:options}],[0])).toThrow();
 });
 it('states the same one-or-many and all-manual rules in the repair prompt',()=>{
  const prompt=ideaGateLocalRepairDirective([{dimensionRepairOptions:{plotTags:options},dimensionRepairSelections:{plotTags:['都市','小人物']}}]);
  expect(prompt).not.toContain('选择1-2项');expect(prompt).toContain('手动选择须全部原样继承');
 });
});
