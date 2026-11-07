import {premiseGenreFitCatalog,premiseGenreFitIssues} from './premise-genre-fit';
import {freezePremiseCreationChoices,bindStructuredIdeaCardToPremise} from './idea-discovery-contract';
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

it('freezes automatic choices with the candidate and inherits them without another decision during full-card expansion',()=>{
 const dictionary={storyTone:['温馨'],writingStyle:['口语化'],webNovelGenre:['扮猪吃虎'],plotTags:['美食'],pov:['第一人称']};
 const raw={storyTone:['温馨'],writingStyle:['口语化'],webNovelGenre:['扮猪吃虎'],plotTags:['美食'],pov:'第一人称'};
 const choices=freezePremiseCreationChoices(raw,{},dictionary,{required:false,options:[]});
 const premise={premiseId:'P1',workingTitle:'他先把木料扛上桥',...choices};
 const card=bindStructuredIdeaCardToPremise(premise,[{title:'他先把木料扛上桥',webNovelGenre:['错误改选'],pov:'第三人称'}]);
 expect(card.webNovelGenre).toEqual(['扮猪吃虎']);expect(card.pov).toBe('第一人称');
 expect(()=>freezePremiseCreationChoices({...raw,plotTags:[]},{},dictionary,{required:false,options:[]})).toThrow('plotTags');
 expect(()=>freezePremiseCreationChoices({...raw,pov:'未知'},{},dictionary,{required:false,options:[]})).toThrow('视角');
});

it('requires independent genre evidence for automatic per-candidate genre choices too',()=>{
 const selection={pool:[],selected:[{premiseId:'A',webNovelGenre:['扮猪吃虎']},{premiseId:'B',webNovelGenre:['悬疑推理','幕后流']}],poolTargetMet:true};
 expect(premiseGenreFitCatalog(selection,[]).map(row=>[row.premiseId,row.genre])).toEqual([['A','扮猪吃虎'],['B','悬疑推理'],['B','幕后流']]);
 expect(premiseGenreFitIssues({genreChecks:[]},selection,[]).length).toBeGreaterThan(0);
});
