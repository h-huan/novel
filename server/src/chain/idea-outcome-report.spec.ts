import {it,expect} from 'vitest';
import {latestIdeaFailureReasons} from './idea-discovery-contract';
it('reports the remaining reader-goal weakness, not resolved initial causal issues',()=>{
 const history=[{sourcePremiseId:'P4',passed:false,issues:['前史互斥','换水条件不足','完读因果薄弱']},
   {sourcePremiseId:'P4',passed:false,issues:['完读倾向偏弱：主角有效回报不足']},
   {sourcePremiseId:'P1',passed:true,issues:[]}];
 const before=JSON.stringify(history);
 expect(latestIdeaFailureReasons(history,['P4'])).toEqual(['完读倾向偏弱：主角有效回报不足']);
 expect(JSON.stringify(history)).toBe(before);expect(history[1].passed).toBe(false);
});
it('retains an initial failure without a later actual review, but drops a later passed identity',()=>{
 const history=[{sourcePremiseId:'A',passed:false,issues:['真实初审缺口']},{sourcePremiseId:'B',passed:false,issues:['已修问题']},{sourcePremiseId:'B',passed:true,issues:[]}];
 expect(latestIdeaFailureReasons(history,['A','B'])).toEqual(['真实初审缺口']);
});
