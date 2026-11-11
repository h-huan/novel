import {premiseCategoryChoices} from './premise-category-identity';
// Slots bind identities, categories and author genres only. A fixed strategy
// must not replace the selected category's core relationship and conflict.
export function premiseSearchPlan(batchIndex:number,batchCount:number,poolTarget:number,batchSize:number,categories:readonly string[],genres:readonly string[]){
 if(![batchIndex,batchCount,poolTarget,batchSize].every(Number.isInteger)||batchIndex<0||batchCount<1||batchIndex>=batchCount||poolTarget<1||batchSize<1)throw Error('候选搜索槽位参数无效');
 const choices=premiseCategoryChoices(categories);if(!choices.length)throw Error('候选搜索缺少分类目录');
 const offset=Math.floor(poolTarget/batchCount)*batchIndex+Math.min(batchIndex,poolTarget%batchCount);
 return Array.from({length:batchSize},(_,index)=>{const global=offset+index;return {
  premiseId:'B'+(batchIndex+1)+'-P'+(index+1),storyCategoryId:choices[global%choices.length].id,
  requiredGenres:[...genres],
 };});
}
