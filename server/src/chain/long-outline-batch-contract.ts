import {readChapterForeshadowing,describeForeshadowingDefect,mergePlannedForeshadowingActions} from './foreshadowing-contract';
/** The prompt, retry validator and final apply boundary use the same existing
 * chapter/foreshadow contracts. No reference is guessed or silently replanted. */
export function longOutlineBatchIssues(value:any,input:{count:number;firstChapter:number;minWords:number;maxWords:number;priorThreads:readonly any[]}):string[]{
 const chapters=Array.isArray(value)?value:value?.chapters;
 if(!Array.isArray(chapters)||chapters.length!==input.count)return ['详细章纲必须返回本批全部'+input.count+'章'];
 const errors:string[]=[];let threads=[...input.priorThreads];
 for(const [index,chapter]of chapters.entries()){
  const number=input.firstChapter+index;
  if(!chapter?.title||!chapter?.content||!chapter?.conflict||!chapter?.hook||!Array.isArray(chapter?.scenes))errors.push('全书第'+number+'章章纲字段不完整');
  const target=Number(chapter?.targetWords);
  if(!Number.isInteger(target)||target<input.minWords||target>input.maxWords||!String(chapter?.wordCountReason||'').trim())errors.push('全书第'+number+'章须给出有效的动态目标字数与篇幅理由');
  const actions=readChapterForeshadowing(chapter||{});
  for(const action of actions){const defect=describeForeshadowingDefect(action);if(defect)errors.push('全书第'+number+'章伏笔不符合契约：'+defect);}
  try{threads=mergePlannedForeshadowingActions(threads,actions,number);}catch(error){errors.push(String((error as Error).message));}
 }
 return errors;
}
