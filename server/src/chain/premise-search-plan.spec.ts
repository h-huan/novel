import {it,expect} from 'vitest';
import {premiseSearchPlan} from './premise-search-plan';
it('locks unique batch identities and canonical categories before generation while retaining every requested genre',()=>{
 const categories=['甲','甲','乙'],genres=['扮猪吃虎','悬疑推理'];
 const plan=[...premiseSearchPlan(0,2,15,8,categories,genres),...premiseSearchPlan(1,2,15,7,categories,genres)];
 expect(plan).toHaveLength(15);expect(new Set(plan.map(row=>row.premiseId)).size).toBe(15);
 expect(new Set(plan.map(row=>row.storyCategoryId))).toEqual(new Set(['K1','K2']));
 expect(plan.every(row=>!Object.hasOwn(row,'causalDirection'))).toBe(true);
 for(const row of plan){expect(row.requiredGenres).toEqual(genres);expect(row).not.toHaveProperty('costDirection');}
 plan[0].requiredGenres.push('外部变化');expect(genres).toHaveLength(2);expect(plan[1].requiredGenres).toEqual(genres);
 expect(premiseSearchPlan(0,1,3,3,['固定分类'],genres).every(row=>row.storyCategoryId==='K1')).toBe(true);
 expect(()=>premiseSearchPlan(2,2,15,7,categories,genres)).toThrow();
});
