import {type PremiseSelectionResult,SELECTED_PREMISE_FIELDS} from './idea-discovery-contract';
import {type PremiseSelectionReview} from './premise-selection-review';
export function premiseGenreFitCatalog(selection:PremiseSelectionResult,genres:readonly string[]){
 return selection.selected.flatMap((item,index)=>genres.map((genre,g)=>({ref:'S'+(index+1)+'.genre'+(g+1),premiseId:String(item.premiseId),genre})));
}
/** Same server-owned field references as the complete-card evidence protocol.
 * Never search other premises or the original pool to salvage a wrong reference. */
export function premiseGenreEvidenceCatalog(selection:PremiseSelectionResult){
 return selection.selected.flatMap((candidate,index)=>SELECTED_PREMISE_FIELDS
  .filter(field=>typeof candidate[field]==='string'&&candidate[field].trim().length>=8)
  .map(field=>({id:'S'+(index+1)+'.'+field,premiseId:String(candidate.premiseId),field,quote:String(candidate[field])})));
}
export function resolvePremiseGenreEvidence(value:any,selection:PremiseSelectionResult){
 if(!Array.isArray(value?.genreChecks))return value;
 const catalog=premiseGenreEvidenceCatalog(selection);
 return {...value,genreChecks:value.genreChecks.map((row:any)=>{
  if(!row||typeof row!=='object'||row.evidenceRef===undefined)return row;
  const owner=/^S(\d+)\.genre\d+$/.exec(String(row.ref));
  const candidate=selection.selected[Number(owner?.[1])-1];
  const evidence=catalog.find(entry=>entry.id===row.evidenceRef&&entry.premiseId===candidate?.premiseId);
  return {...row,field:evidence?.field,quote:evidence?.quote||''};
 })};
}
export function premiseGenreFitIssues(value:any,selection:PremiseSelectionResult,genres:readonly string[]):string[]{
 if(!genres.length)return [];
 const expected=premiseGenreFitCatalog(selection,genres),rows=resolvePremiseGenreEvidence(value,selection)?.genreChecks;
 if(!Array.isArray(rows)||rows.length!==expected.length)return ['genreChecks须逐卡逐项覆盖全部手动选择的流派'];
 const seen=new Set<string>(),errors:string[]=[];
 for(const row of rows){
  const entry=expected.find(item=>item.ref===row?.ref),candidate=selection.selected.find(item=>item.premiseId===entry?.premiseId);
  if(!entry||seen.has(row.ref)){errors.push('流派核查编号未知或重复');continue;}seen.add(row.ref);
  if(!['fulfilled','missing','unknown'].includes(row.status)||typeof row.reason!=='string'||row.reason.trim().length<8)errors.push(row.ref+'缺少流派落实状态或具体依据');
  if(row.status==='fulfilled'&&(!SELECTED_PREMISE_FIELDS.includes(row.field)||typeof row.quote!=='string'||row.quote.trim().length<8||!String(candidate?.[row.field]||'').includes(row.quote)))errors.push(row.ref+'已落实须引用本题材真实字段中的连续原文');
 }
 return errors;
}
export function materializePremiseGenreFit(value:any,selection:PremiseSelectionResult,genres:readonly string[]):PremiseSelectionReview['issues']{
 const errors=premiseGenreFitIssues(value,selection,genres);if(errors.length)throw Error(errors.join('；'));
 if(!genres.length)return [];
 value=resolvePremiseGenreEvidence(value,selection);
 const catalog=premiseGenreFitCatalog(selection,genres);
 return value.genreChecks.filter((row:any)=>row.status!=='fulfilled').map((row:any)=>{
  const entry=catalog.find(item=>item.ref===row.ref)!,candidate=selection.selected.find(item=>item.premiseId===entry.premiseId)!,source=selection.pool.find(item=>item.premiseId===entry.premiseId)!;
  return {kind:'selection_fit' as const,premiseId:entry.premiseId,referencePremiseId:entry.premiseId,quote:String(candidate.protagonistSituation),referenceQuote:String(source.storyCore),reason:(row.status==='unknown'?'已选流派未确认【':'未落实已选流派【')+entry.genre+'】：'+row.reason};
 });
}
