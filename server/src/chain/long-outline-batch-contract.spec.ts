import {it,expect} from 'vitest';
import {longOutlineBatchIssues} from './long-outline-batch-contract';
const thread=(content:string,action:string,reference?:string)=>({content,action,reference,scope:'volume',type:'clue',riskLevel:'medium',evidenceText:'本章已发生的明确行动证据',recoveryWindowStart:2,recoveryWindowEnd:4,recoveryCondition:'完成已有线索核验',payoffDescription:'实际改变人物的选择'});
const chapter=(foreshadowing:any[])=>({title:'既定章节',content:'具体事件推动已有冲突。',conflict:'双方争夺既有资源',hook:'下一步会如何变化',scenes:[],targetWords:3500,wordCountReason:'本章需要完成实际交付和对手反制',foreshadowing});
it('validates chronological thread identity inside the existing model retry without changing any prior facts',()=>{
 const input={count:2,firstChapter:1,minWords:3000,maxWords:5000,priorThreads:[]};
 const valid={chapters:[chapter([thread('旧地图的缺口','埋设')]),chapter([thread('他认出一条河','激活','旧地图的缺口')])]};
 const before=JSON.stringify(valid);expect(longOutlineBatchIssues(valid,input)).toEqual([]);expect(JSON.stringify(valid)).toBe(before);
 const invalid={chapters:[valid.chapters[0],chapter([thread('他认出一条河','激活')])]};
 expect(longOutlineBatchIssues(invalid,input).join()).toContain('缺少已埋设');
 expect(longOutlineBatchIssues({chapters:[valid.chapters[0]]},input).join()).toContain('本批全部2章');
 expect(longOutlineBatchIssues({chapters:[{...valid.chapters[0],targetWords:1},valid.chapters[1]]},input).join()).toContain('动态目标');
});
