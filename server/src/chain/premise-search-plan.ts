import {premiseCategoryChoices} from './premise-category-identity';
// Search directions describe causal roles, never plot facts, scores or approval.
// All author genres apply to EVERY slot; independent review still judges truth.
const paths=[
 '主角以现场真实操作改变原有约束，相关人物根据实际可见结果作出有动机的决定',
 '主角主动承受眼前损失换取关键机会，对手随后自主选择并承担该选择实际造成的后果',
 '主角改变相互依赖者的交换条件，各方为自己的明确利益采取行动，关系与胜负因此变化',
 '主角让对手既有两项利益无法兼得，对手在真实约束下选择，放弃的一项成为不可逆转折',
 '主角收回对手实际依赖的资源或配合，对手因可核实的损失而作出真实让步',
 '主角冒险保护另一个人，对方在已有权限与真实动机内付出代价回应，双方选择改变局面',
];
const costs=['改变一段具体关系及彼此后续选择','失去一项已经拥有的现实机会','付出由自己选择直接造成的资源损失','改变在群体中的地位并承担具体后续责任'];
export function premiseSearchPlan(batchIndex:number,batchCount:number,poolTarget:number,batchSize:number,categories:readonly string[],genres:readonly string[]){
 if(![batchIndex,batchCount,poolTarget,batchSize].every(Number.isInteger)||batchIndex<0||batchCount<1||batchIndex>=batchCount||poolTarget<1||batchSize<1)throw Error('候选搜索槽位参数无效');
 const choices=premiseCategoryChoices(categories);if(!choices.length)throw Error('候选搜索缺少分类目录');
 const offset=Math.floor(poolTarget/batchCount)*batchIndex+Math.min(batchIndex,poolTarget%batchCount);
 return Array.from({length:batchSize},(_,index)=>{const global=offset+index;return {
  premiseId:'B'+(batchIndex+1)+'-P'+(index+1),storyCategoryId:choices[global%choices.length].id,
  requiredGenres:[...genres],causalDirection:paths[global%paths.length],costDirection:costs[Math.floor(global/paths.length)%costs.length],
 };});
}
