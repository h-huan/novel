import {describeChapterResponsibilityPlan} from '../../shared/src/chapter-responsibility-review';
export interface CreationChapterContract {order:number;title:string;func:string;brief:string;prerequisites:string[];timeline:string;exitState:string;threads?:string[];}
/** One lossless adapter from the shared public contract into the creation loop. */
export function creationChapterContracts(value:any, normalizeFunction:(value:string,index:number)=>string):CreationChapterContract[]{
 if(Array.isArray(value?.chapterResponsibilities)&&Array.isArray(value?.chapters)&&JSON.stringify(value.chapterResponsibilities)!==JSON.stringify(value.chapters))throw Error('章节合同出现互斥的两份规划');
 const source=Array.isArray(value?.chapterResponsibilities)?value.chapterResponsibilities:Array.isArray(value?.chapters)?value.chapters:[];
 if(source.some((row:any)=>row?.chapter!==undefined&&row?.order!==undefined&&row.chapter!==row.order))throw Error('章节合同章号互斥');
 const plan=source.map((row:any)=>({...row,chapter:row.chapter??row.order}));
 const errors=describeChapterResponsibilityPlan({chapterResponsibilities:plan});
 if(errors.length)throw Error('章节生成前合同不完整，禁止展开细纲：'+errors.join('；'));
 return plan.map((row:any,index:number)=>({order:index,title:row.title.trim(),func:normalizeFunction(row.function,index),brief:row.responsibility.trim(),prerequisites:[...row.prerequisites],timeline:row.timeline.trim(),exitState:row.exitState.trim(),...((Array.isArray(row.threads)&&row.threads.length)?{threads:row.threads.map((item:unknown)=>String(item).trim()).filter(Boolean)}:{})}));
}
export function creationResponsibilityPlan(rows:readonly CreationChapterContract[]){
 return rows.map((row,index)=>({chapter:index+1,title:row.title,function:row.func,responsibility:row.brief,prerequisites:row.prerequisites===undefined?undefined:[...row.prerequisites],timeline:row.timeline,exitState:row.exitState,...(row.threads?.length?{threads:[...row.threads]}:{})}));
}
