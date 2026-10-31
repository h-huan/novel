import {describe,it,expect,vi} from 'vitest';
import {ChainController} from './chain.controller';
import {applyUncommittedWorldPatch,buildWorldSourceReviewPrompt,describeWorldSourceReview,materializeWorldSourceReview,worldSourceAnchors,worldCreationAuthority,worldReviewFailureOrigin} from './world-source-review';
const parent={confirmed:{relation:'店主欠俱乐部人情。',place:'店铺占一楼大厅与二楼训练间。'}};
const child={history:'俱乐部欠店主人情。',geography:'店铺在二楼，一楼大厅另有机器。',rules:['每局结束分别结算。','对方能拒绝诱饵。'],specialSettings:''};
const findings=()=>[
 {upperRef:'U1',lowerRef:'L1',conflict:'人情债务主体方向与确认人物关系相反',suggestedFix:'恢复已确认债务方向'},
 {upperRef:'U2',lowerRef:'L2',conflict:'既有整体占用两层被改成仅在二楼的店铺',suggestedFix:'恢复既定占用布局'},
];
function report(conflicts=findings()){
 const anchors=worldSourceAnchors(child);
 return {consistent:conflicts.length===0,fieldChecks:Object.keys(child).map(field=>({field,status:conflicts.some(c=>anchors.find(a=>a.ref===c.lowerRef)?.path[0]===field)?'conflict':'compatible',reason:'逐项核对当前字段中的人物关系、条件及实际排他范围'})),contradictions:conflicts};
}
describe('unpublished world source review and minimal repair',()=>{
 it('requires actual full field coverage even when the global verdict is a valid old report',()=>{
  expect(describeWorldSourceReview({consistent:true,contradictions:[]},parent,child)).toContainEqual(expect.stringContaining('全部实际世界观字段'));
  const value=report();expect(describeWorldSourceReview(value,parent,child)).toEqual([]);
  expect(describeWorldSourceReview({...value,fieldChecks:value.fieldChecks.slice(1)},parent,child).length).toBeGreaterThan(0);
  expect(describeWorldSourceReview({...value,fieldChecks:[...value.fieldChecks,value.fieldChecks[0]]},parent,child).length).toBeGreaterThan(0);
 });
 it('binds conflict quotes from the correct two original sources and preserves all judgments',()=>{
  const value=report(),before=JSON.stringify(value),result=materializeWorldSourceReview(value,parent,child);
  expect(JSON.stringify(value)).toBe(before);expect(result.consistent).toBe(false);
  expect(result.contradictions[0]).toContain('店主欠俱乐部人情。');expect(result.contradictions[0]).toContain('俱乐部欠店主人情。');
  expect(result.conflicts).toHaveLength(2);
 });
 it('rejects invalid IDs, missing evidence and incompatible checklist verdicts',()=>{
  for(const row of [{...findings()[0],upperRef:'U99'},{...findings()[0],lowerRef:'L99'},{...findings()[0],conflict:''}])expect(describeWorldSourceReview(report([row]),parent,child).length).toBeGreaterThan(0);
  const value=report();value.fieldChecks[0].status='compatible';expect(describeWorldSourceReview(value,parent,child).length).toBeGreaterThan(0);
  expect(describeWorldSourceReview({...report(),fieldChecks:[null,...report().fieldChecks.slice(1)]},parent,child).length).toBeGreaterThan(0);
 });
 it('allows distinct conflicting claims within the same source pair, but rejects exact duplicate findings',()=>{
  const first=findings()[0],second={...first,conflict:'同一段中的另一条明确状态也与上层事实互斥'};
  expect(describeWorldSourceReview(report([first,second]),parent,child)).toEqual([]);
  expect(describeWorldSourceReview(report([first,first]),parent,child).length).toBeGreaterThan(0);
 });
 it('keeps unknown as unassessed and never routes it into a story repair',()=>{
  const value=report([]);value.consistent=false;value.fieldChecks[0].status='unknown';
  expect(describeWorldSourceReview(value,parent,child)).toEqual([]);
  expect(()=>materializeWorldSourceReview(value,parent,child)).toThrow('未评估');
 });
 it('applies both evidenced local edits atomically without touching other characters or the original',()=>{
  const before=JSON.stringify(child),review=materializeWorldSourceReview(report(),parent,child);
  const next=applyUncommittedWorldPatch(child,{edits:[{ref:'L1',match:'俱乐部欠店主',replacement:'店主欠俱乐部'},{ref:'L2',match:'店铺在二楼',replacement:'店铺占一楼与二楼'}]},review);
  expect(next).toEqual({...child,history:'店主欠俱乐部人情。',geography:'店铺占一楼与二楼，一楼大厅另有机器。'});
  expect(JSON.stringify(child)).toBe(before);
 });
 it('rejects full regeneration, omitted targets, nonunique matches and edits outside audited locations',()=>{
  const review=materializeWorldSourceReview(report(),parent,child),before=JSON.stringify(child);
  for(const payload of [child,{edits:[]},{edits:[{ref:'L1',match:child.history,replacement:'新内容'}]},
   {edits:[{ref:'L3',match:'每局',replacement:'每场'}]},
   {edits:[{ref:'L1',match:'不存在',replacement:'新内容'},{ref:'L2',match:child.geography,replacement:'新布局'}]}])expect(()=>applyUncommittedWorldPatch(child,payload,review)).toThrow();
  expect(JSON.stringify(child)).toBe(before);
 });
 it('distinguishes newly found old text from defects in a changed location',()=>{
  const review=materializeWorldSourceReview(report(),parent,child),next={...child,history:'仅改这一字段。'};
  expect(worldReviewFailureOrigin(child,next,review)).toEqual([expect.stringContaining('已修改位置仍有问题'),expect.stringContaining('原文未改，复检新增发现')]);
 });
 it('uses a single original source copy and a complete checklist in the prompt',()=>{
  const prompt=buildWorldSourceReviewPrompt({parentName:'确认题材',parent,childName:'候选世界观',child,executionStandard:'原标准'});
  expect(prompt).toContain('所有冲突一次汇总');expect(prompt).toContain('社会身份');
  expect(prompt.split(child.history)).toHaveLength(2);
  for(const field of Object.keys(child))expect(prompt).toContain(field);
 });
 it('production rejects missing coverage and stops unknown without invoking another generation',async()=>{
  const controller=Object.create(ChainController.prototype) as any;
  const unknown=report([]);unknown.consistent=false;unknown.fieldChecks[0].status='unknown';
  controller.llmCallWithRetry=vi.fn(async(_label:string,prompt:string,options:any)=>{
   expect(prompt).toContain('fieldChecks');expect(options.validate({consistent:true,contradictions:[]})).toBe(false);
   expect(options.validate(unknown)).toBe(true);return {data:unknown};
  });
  await expect(controller.reviewChildSource('p','上层',parent,'世界观',child,'标准')).rejects.toThrow('未评估');
  expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(1);
 });
});

it('does not submit the confirmed story twice to world generation and independent source review',()=>{
 const story={hook:'父亲被误登记出院，女儿必须公开两户同号病历。',ending:'女儿失去岗位后，两户老人恢复各自记录。'};
 const constitution={targetPlatform:'fanqie',storyTone:['现实'],confirmedStory:structuredClone(story)};
 const snapshot=JSON.stringify(constitution);
 const authority=worldCreationAuthority(story,constitution);
 expect(authority).toEqual({confirmedStory:story,constitution:{targetPlatform:'fanqie',storyTone:['现实']}});
 expect(JSON.stringify(constitution)).toBe(snapshot);
 const anchors=worldSourceAnchors(authority,'U');
 expect(anchors.filter(row=>row.text===story.hook)).toHaveLength(1);
 expect(anchors.filter(row=>row.text===story.ending)).toHaveLength(1);
 expect(anchors.some(row=>row.text==='fanqie')).toBe(true);
});
