import {it,expect,vi} from 'vitest';
import {normalizePremiseSelectionPayload,SELECTED_PREMISE_FIELDS,ideaGateLocalRepairDirective} from './idea-discovery-contract';
import {premiseSourceComparisonCatalog,materializePremiseSourceReview,type PremiseSelectionReview} from './premise-selection-review';
import {reviewChangedPremiseSources,type PremiseSourceReceipts} from './premise-source-reuse';
const selection=()=>normalizePremiseSelectionPayload({
 pool:['A','B','C','D','E'].map(premiseId=>({premiseId,workingTitle:'题材'+premiseId,storyCore:'原池既定行动、条件和代价均保持真实一致'+premiseId})),
 selectedPremises:['A','B','C','D','E'].map(premiseId=>({premiseId,...Object.fromEntries(SELECTED_PREMISE_FIELDS.filter(key=>key!=='differentiation').map(key=>[key,'既定的具体人物行动、必要条件与结果'+premiseId]))})),
},5,5);
const report=(input:ReturnType<typeof selection>):PremiseSelectionReview=>({passed:true,issues:[],
 sourceChecks:premiseSourceComparisonCatalog(input).map(row=>({ref:row.ref,status:'preserved',reason:'完整核对当前展开与原池必要事实后确认保留'})),
 payoffChecks:input.selected.map((_item,i)=>({ref:`S${i+1}.payoff`,status:'supported',actionEvidenceRef:`S${i+1}.activeChoice`,reversalCheck:{status:'supported',actionEvidenceRef:`S${i+1}.activeChoice`,reason:'前段实际选择支持反转结果成立的必要条件'},reason:'既定行动通过已写明的必要条件造成结果'})),
 genreChecks:input.selected.map((_item,i)=>({ref:`S${i+1}.genre1`,status:'fulfilled',evidenceRef:`S${i+1}.activeChoice`,reason:'当前主动选择已落实指定流派机制'})),
 categoryChecks:input.selected.map((_item,i)=>({ref:`S${i+1}.category`,status:'fulfilled',evidenceRef:`S${i+1}.coreConflict`,reason:'核心冲突与所选分类阅读承诺一致'})),
});
it('reviews only two changed items, restores all fifty checks and rebinds evidence to original positions',async()=>{
 const original=selection(),cache:PremiseSourceReceipts=new Map(),review=vi.fn(async input=>report(input));
 await reviewChangedPremiseSources(original,'same standards+genres',cache,review);
 const next=structuredClone(original);next.selected[1].activeChoice+='新行动';next.selected[4].payoff+='新结果';
 const result=await reviewChangedPremiseSources(next,'same standards+genres',cache,review);
 expect(review.mock.calls.map(([input])=>input.selected.map(item=>item.premiseId))).toEqual([['A','B','C','D','E'],['B','E']]);
 expect(result.passed).toBe(true);expect(result.sourceChecks).toHaveLength(50);
 expect(result.payoffChecks?.find(row=>row.ref==='S5.payoff')?.actionEvidenceRef).toBe('S5.activeChoice');
 expect(result.genreChecks?.find(row=>row.ref==='S2.genre1')?.evidenceRef).toBe('S2.activeChoice');
 expect(result.categoryChecks?.find(row=>row.ref==='S5.category')?.evidenceRef).toBe('S5.coreConflict');
});
it('reuses only complete failed evidence unchanged, never upgrading a rejection; unknown and invalid reviews remain uncached',async()=>{
 const input=selection(),cache:PremiseSourceReceipts=new Map();
 const review=vi.fn(async pending=>{const r=report(pending),index=pending.selected.findIndex(item=>item.premiseId==='B');
  if(index>=0){
   r.sourceChecks!.find(row=>row.ref===`S${index+1}.activeChoice`)!.status='drift';
   r.sourceChecks!.find(row=>row.ref===`S${index+1}.activeChoice`)!.reason='当前展开改变了原池明确的主动选择';
   const isolated={...pending,selected:[pending.selected[index]],pool:pending.pool.filter(seed=>seed.premiseId==='B')};
   const drift=materializePremiseSourceReview({sourceChecks:r.sourceChecks!.filter(row=>row.ref.startsWith(`S${index+1}.`)).map(row=>({...row,ref:row.ref.replace(`S${index+1}.`,'S1.')}))},isolated);
   r.passed=false;r.issues=drift.issues;
  }return r;});
 await reviewChangedPremiseSources(input,'standard',cache,review);
 const result=await reviewChangedPremiseSources(input,'standard',cache,review);
 expect(review.mock.calls.map(([pending])=>pending.selected.map(item=>item.premiseId))).toEqual([['A','B','C','D','E']]);
 expect(cache.size).toBe(5);
 expect(result.passed).toBe(false);expect(result.issues[0].premiseId).toBe('B');
 expect(result.sourceChecks?.find(row=>row.ref==='S2.activeChoice')?.status).toBe('drift');
 const changed=structuredClone(input);changed.selected[1].activeChoice+='新事实';
 await reviewChangedPremiseSources(changed,'standard',cache,review);
 expect(review.mock.calls[1][0].selected.map(item=>item.premiseId)).toEqual(['B']);
 expect(cache.size).toBe(6); // the old rejected version is immutable evidence, not a pass
 const missing=vi.fn(async()=>({passed:true,issues:[]}));const empty:PremiseSourceReceipts=new Map();
 await reviewChangedPremiseSources(input,'standard',empty,missing);expect(empty.size).toBe(0);
 const unknown=vi.fn(async pending=>{const r=report(pending);r.sourceChecks![0].status='unknown';return r;});
 const unknownCache:PremiseSourceReceipts=new Map();
 await reviewChangedPremiseSources(input,'standard',unknownCache,unknown);expect(unknownCache.size).toBe(4); // Other four valid premises remain reusable; the unknown A is excluded.
});
it('keeps definitive source failure after selection reordering without paying for identical evidence',async()=>{
 const original=selection(),cache:PremiseSourceReceipts=new Map(),review=vi.fn(async pending=>{
  const r=report(pending),i=pending.selected.findIndex(row=>row.premiseId==='B');
  if(i<0)return r;
  const check=r.sourceChecks!.find(row=>row.ref===`S${i+1}.activeChoice`)!;
  check.status='drift';check.reason='原池主动选择与当前版本明确互斥，实际不能同时发生';
  const isolated={...pending,selected:[pending.selected[i]],pool:pending.pool.filter(seed=>seed.premiseId==='B')};
  r.issues=materializePremiseSourceReview({sourceChecks:r.sourceChecks!.filter(row=>row.ref.startsWith(`S${i+1}.`)).map(row=>({...row,ref:row.ref.replace(`S${i+1}.`,'S1.')}))},isolated).issues;
  r.passed=false;return r;
 });
 await reviewChangedPremiseSources(original,'standards',cache,review);
 const reversed=structuredClone(original);reversed.selected.reverse();
 const result=await reviewChangedPremiseSources(reversed,'standards',cache,review);
 expect(review).toHaveBeenCalledTimes(1);
 expect(result.passed).toBe(false);
 expect(result.issues.map(issue=>issue.premiseId)).toContain('B');
 expect(result.sourceChecks?.find(row=>row.ref==='S4.activeChoice')?.status).toBe('drift');
});

it('invalidates on source facts, category, standards, genre scope and a new run',async()=>{
 const input=selection(),cache:PremiseSourceReceipts=new Map(),review=vi.fn(async pending=>report(pending));
 await reviewChangedPremiseSources(input,'standards+genres',cache,review);
 const next=structuredClone(input);next.pool[2].storyCore+='新原池事实';next.selected[3].storyCategory='新分类';
 await reviewChangedPremiseSources(next,'standards+genres',cache,review);
 expect(review.mock.calls[1][0].selected.map(item=>item.premiseId)).toEqual(['C','D']);
 await reviewChangedPremiseSources(next,'changed standards or genres',cache,review);
 expect(review.mock.calls[2][0].selected).toHaveLength(5);
 await reviewChangedPremiseSources(input,'standards+genres',new Map(),review);
 expect(review.mock.calls[3][0].selected).toHaveLength(5);
});
it('passes complete per-card standards into a local repair without allowing identity or configuration edits',()=>{
 const prompt=ideaGateLocalRepairDirective([{card:{storyCategory:'古言甜宠'},executionStandard:'本卡甜宠要求：关系升温与具体照顾须推动选择',gateIssues:['修复缺少必要条件的因果']}]);
 expect(prompt).toContain('本卡甜宠要求：关系升温与具体照顾须推动选择');
 expect(prompt).toContain('不能只修点名因果');expect(prompt).toContain('不要输出平台、分类、篇幅、章数或任何内部标识');
});


it('reuses real category and manual-genre evidence after single-card rebinding and reordering',async()=>{
 const original=selection();
 for(const item of [...original.selected,...original.pool])item.storyCategory='悬疑';
 const scope=JSON.stringify({standard:'相同来源与分类要求',requiredGenres:['扮猪吃虎']});
 const cache:PremiseSourceReceipts=new Map(),review=vi.fn(async pending=>report(pending));
 await reviewChangedPremiseSources(original,scope,cache,review);
 expect(cache.size).toBe(5);
 const next=structuredClone(original);
 next.selected=[next.selected[3],next.selected[1],next.selected[0],next.selected[4],next.selected[2]];
 next.selected[1].activeChoice+='一项新的实际行动';
 next.selected[3].payoff+='一项新的实际结果';
 const result=await reviewChangedPremiseSources(next,scope,cache,review);
 expect(review.mock.calls.map(([pending])=>pending.selected.map(item=>item.premiseId)))
  .toEqual([['A','B','C','D','E'],['B','E']]);
 expect(result.passed).toBe(true);
 expect(result.sourceChecks).toHaveLength(50);
 for(let index=0;index<next.selected.length;index++){
  const prefix='S'+(index+1)+'.';
  expect(result.genreChecks?.find(row=>row.ref===prefix+'genre1')?.evidenceRef).toBe(prefix+'activeChoice');
  expect(result.categoryChecks?.find(row=>row.ref===prefix+'category')?.evidenceRef).toBe(prefix+'coreConflict');
 }
});

