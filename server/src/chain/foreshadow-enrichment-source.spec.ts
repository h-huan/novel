import {describe,it,expect} from 'vitest';
import {foreshadowEnrichmentSources,foreshadowEnrichmentOutputIssues} from './foreshadow-enrichment-source';
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

describe('in-stage foreshadow enrichment output boundary',()=>{
 const originals=[{id:'f1'}];
 it('rejects an event falsely placed in a stage label before persistence',()=>{
  const payload={foreshadowings:[{id:'f1',emotional_impact:'责任归属被重新认识',layered_reveal:[{
   revealStage:'林昭当场点破：模型是在改派七分钟之后才把单派给骑手，不是模型算出来的。',
   content:'最初派单在改派之前，雨天模型记录在改派后才补录。'}]}]};
  expect(foreshadowEnrichmentOutputIssues(payload,originals)).toEqual([
   expect.stringContaining('revealStage须为简短阶段标签')]);
 });
 it('accepts an actual stage label with separate event content without changing its evidence',()=>{
  const payload={foreshadowings:[{id:'f1',emotional_impact:'骑手知道真实责任',layered_reveal:[{
   revealStage:'回收（第4章·投屏）',content:'先派错的记录被揭示，后录入的雨天模型记录只是补记。'}]}]};
  const frozen=JSON.stringify(payload);
  expect(foreshadowEnrichmentOutputIssues(payload,originals)).toEqual([]);
  expect(JSON.stringify(payload)).toBe(frozen);
 });
 it('rejects missing or duplicate original entries instead of writing partial enriched Canon',()=>{
  expect(foreshadowEnrichmentOutputIssues({foreshadowings:[]},originals)).toContain('缺少既有伏笔深度条目：f1');
  expect(foreshadowEnrichmentOutputIssues({foreshadowings:[{id:'f1'},{id:'f1'}]},originals))
   .toContain('伏笔深度存在未知或重复id：f1');
 });
});
