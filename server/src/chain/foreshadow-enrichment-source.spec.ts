import {describe,it,expect} from 'vitest';
import {foreshadowEnrichmentSources} from './foreshadow-enrichment-source';
describe('foreshadow depth source inheritance',()=>{
 it('keeps original payoff evidence and complete setup/recovery plans without duplicating chapters',()=>{
  const items=[{id:'f1',content:'欠款留待处理',buried_chapter_index:1,planned_recovery_chapter_index:3,
   evidence_text:'借条仍在',recovery_condition:'本人承认债务',payoff_description:'按月偿还'},
   {id:'f2',content:'另一线索',buried_chapter_index:1,planned_recovery_chapter_index:3}];
  const chapters=[{id:'c1',content:'完整开篇',scenes:JSON.stringify({foreshadowing:[{content:'借条仍在'}]})},
   {id:'c2',content:'不相关章节'}, {id:'c3',content:'完整结尾'.repeat(1000),plan_json:JSON.stringify({
    characterActions:[{action:'双方约定分期',result:'欠款继续按月偿还'}],foreshadowingRecover:[{method:'账本标欠，按月补齐'}]})}];
  const before=JSON.stringify({items,chapters});const result=foreshadowEnrichmentSources(items,chapters);
  expect(result.foreshadowings[0]).toMatchObject({evidenceText:'借条仍在',recoveryCondition:'本人承认债务',payoffDescription:'按月偿还'});
  expect(result.chapterSources.map(row=>row.chapterNumber)).toEqual([1,3]);
  expect(result.chapterSources[1].content).toBe(chapters[2].content);
  expect(result.chapterSources[1].plan.characterActions[0].result).toBe('欠款继续按月偿还');
  expect(JSON.stringify({items,chapters})).toBe(before);
 });
 it('preserves unparsed source and never invents a missing recovery chapter',()=>{
  const result=foreshadowEnrichmentSources([{id:'f',buried_chapter_index:1,planned_recovery_chapter_index:8}],
   [{id:'c1',content:'实际章节',scenes:'原始非JSON资料'}]);
  expect(result.chapterSources).toHaveLength(1);expect(result.chapterSources[0].plan).toBe('原始非JSON资料');
  expect(result.foreshadowings[0].recoveryChapter).toBe(8);
 });
});
