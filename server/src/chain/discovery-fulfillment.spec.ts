import {it,expect,vi} from 'vitest';
import {fulfillDiscoveryGaps,discoveryFailureImproved,affordableIdeaReplacementCount,readerGoalDeficitRequiresNewPremise} from './discovery-fulfillment';
const assessment=(keys:string[])=>({passed:keys.length===0,issues:[],presentationReview:{titleCompelling:true,openingCompelling:true,distinctFromBatch:true,storyCoherent:true,payoffCredible:true,platformFit:true,issues:[],readerGoals:Object.fromEntries(['click','completion','sharing','immersion'].map(key=>[key,{status:keys.includes(key)?'weak':'supported',reason:'具体已有缺口'}]))}});
it('continues beyond two repairs only while independent blocked dimensions strictly improve',async()=>{
 let missing=['A'],credits=8,defects=['click','completion','sharing'];const accepted={id:'already-passed',text:'不可改动'};const before=JSON.stringify(accepted);
 const repair=vi.fn(async()=>{credits-=2;const prior=assessment(defects);defects=defects.slice(1);if(!defects.length)missing=[];return discoveryFailureImproved(prior,assessment(defects))?['A']:[];});
 const result=await fulfillDiscoveryGaps({missing:()=>missing,hasCard:()=>true,canRepair:()=>credits>=2,repair,canReplace:()=>false,replace:vi.fn(),fingerprint:()=>JSON.stringify({missing,credits,defects})});
 expect(result).toBe('requested_quantity_verified');expect(repair).toHaveBeenCalledTimes(3);expect(credits).toBe(2);expect(JSON.stringify(accepted)).toBe(before);
});
it('switches a stalled card to an original-pool candidate and never repairs or replaces an accepted card',async()=>{
 let missing=['bad'],credits=6,version=0;const rejected=new Set<string>(),calls:string[]=[];
 const result=await fulfillDiscoveryGaps({missing:()=>missing,hasCard:()=>true,canRepair:()=>credits>=2,
  repair:async ids=>{calls.push('repair:'+ids.join(','));credits-=2;return [];},
  canReplace:()=>credits>=2&&rejected.size<2,replace:async id=>{calls.push('replace:'+id);credits--;version++;rejected.add('tried'+version);if(version===1)return 'rejected';missing=[];return 'replaced';},fingerprint:()=>JSON.stringify({missing,credits,version})});
 expect(result).toBe('requested_quantity_verified');expect(calls).toEqual(['repair:bad','replace:bad','replace:bad']);
});
it('batches all missing slots into a single replacement request without modifying accepted cards',async()=>{
 let pending=['B','C'],replacements=0,credits=4;const calls:string[][]=[];
 const result=await fulfillDiscoveryGaps({missing:()=>pending,hasCard:()=>false,canRepair:()=>false,
  repair:vi.fn(),canReplace:()=>credits>=2,
  replaceBatch:async ids=>{calls.push([...ids]);credits-=2;replacements++;pending=[];return 'replaced';},
  fingerprint:()=>JSON.stringify({pending,credits})});
 expect(result).toBe('requested_quantity_verified');expect(replacements).toBe(1);
 expect(calls).toEqual([['B','C']]);expect(credits).toBe(2);
});
it('does not pay for a patch when no independent review credit remains',async()=>{
 const repair=vi.fn(),replace=vi.fn();expect(await fulfillDiscoveryGaps({missing:()=>['A'],hasCard:()=>true,canRepair:()=>false,repair,canReplace:()=>false,replace,fingerprint:()=>''})).toBe('budget_or_original_pool_exhausted');
 expect(repair).not.toHaveBeenCalled();expect(replace).not.toHaveBeenCalled();
});
it('does not treat paraphrased reasons or newly introduced blocked dimensions as improvement',()=>{
 expect(discoveryFailureImproved(assessment(['completion']),assessment(['completion']))).toBe(false);
 expect(discoveryFailureImproved(assessment(['completion','sharing']),assessment(['click']))).toBe(false);
});
it('stops a failed reserve protocol when caller marks its unchanged identity as unavailable, even with ample retry budget',async()=>{
 const replace=vi.fn(async()=>'unavailable' as const),repair=vi.fn();
 const result=await fulfillDiscoveryGaps({missing:()=>['B'],hasCard:()=>false,canRepair:()=>false,
  repair,canReplace:()=>true,replace,fingerprint:()=>'{"remaining":12}'});
 expect(result).toBe('budget_or_original_pool_exhausted');
 expect(replace).toHaveBeenCalledOnce();expect(repair).not.toHaveBeenCalled();
});
it('stops a callback with no candidate, budget or pool progress instead of looping forever',async()=>{
 const replace=vi.fn(async()=>'rejected' as const);
 expect(await fulfillDiscoveryGaps({missing:()=>['A'],hasCard:()=>false,canRepair:()=>false,repair:vi.fn(),canReplace:()=>true,replace,fingerprint:()=>''})).toBe('no_material_progress');
 expect(replace).toHaveBeenCalledTimes(1);
});

it('repairs a newly exposed local title contract before replacing a stalled story and rotates rejected slots',async()=>{
 let deficits=['A','B'],credits=12,scope='story';const calls:string[]=[];
 await fulfillDiscoveryGaps({missing:()=>deficits,hasCard:()=>true,repairScope:id=>id==='B'?scope:'story',
  canRepair:()=>credits>0,repair:async ids=>{calls.push('repair:'+ids.join(','));credits--;if(scope==='story')scope='local_contract';else deficits=deficits.filter(id=>id!=='B');return [];},
  canReplace:()=>credits>0,replace:async id=>{calls.push('replace:'+id);credits--;deficits=[];return 'replaced';},fingerprint:()=>JSON.stringify({deficits,credits,scope})});
 expect(calls).toEqual(['repair:A,B','repair:B','replace:A']);
 let remaining=3;const replacements:string[]=[];
 await fulfillDiscoveryGaps({missing:()=>['A','B'],hasCard:()=>false,canRepair:()=>false,repair:vi.fn(),canReplace:()=>remaining>0,
  replace:async id=>{replacements.push(id);remaining--;return 'rejected';},fingerprint:()=>String(remaining)});
 expect(replacements).toEqual(['A','B','A']);
});

it('retains failed protocol evidence and replaces missing cards while original-pool budget remains',async()=>{
 let missing=['A'],credits=6,attempt=0;const errors:string[]=[];
 const repair=vi.fn(async()=>{credits--;throw Error('scopeBreakdown原文未唯一定位');});
 const replace=vi.fn(async()=>{credits--;if(++attempt===1)throw Error('原池换选审核协议未完成');missing=[];return 'replaced' as const;});
 const result=await fulfillDiscoveryGaps({missing:()=>missing,hasCard:()=>true,canRepair:()=>credits>=2,repair,
  canReplace:()=>credits>=2,replace,fingerprint:()=>JSON.stringify({missing,credits,attempt}),onError:(phase,error)=>errors.push(phase+':'+(error as Error).message)});
 expect(result).toBe('requested_quantity_verified');expect(repair).toHaveBeenCalledOnce();expect(replace).toHaveBeenCalledTimes(2);
 expect(errors).toEqual(['repair:scopeBreakdown原文未唯一定位','replace:原池换选审核协议未完成']);expect(credits).toBe(3);
});
it('stops a throwing replacement with no consumed budget or candidate progress',async()=>{
 const replace=vi.fn(async()=>{throw Error('unexpected callback failure');}),onError=vi.fn();
 expect(await fulfillDiscoveryGaps({missing:()=>['A'],hasCard:()=>false,canRepair:()=>false,repair:vi.fn(),canReplace:()=>true,replace,fingerprint:()=>'',onError})).toBe('no_material_progress');
 expect(replace).toHaveBeenCalledOnce();expect(onError).toHaveBeenCalledOnce();
});

it('reserves full-card review credits and falls back to one replacement without buying extra calls',()=>{
 const grouped=(n:number)=>1;
 expect(affordableIdeaReplacementCount(2,7,2,grouped)).toBe(1);
 expect(affordableIdeaReplacementCount(2,7,3,grouped)).toBe(2);
 expect(affordableIdeaReplacementCount(2,7,1,grouped)).toBe(0);
 expect(affordableIdeaReplacementCount(2,1,5,grouped)).toBe(1);
 expect(affordableIdeaReplacementCount(2,7,4,n=>n)).toBe(2);
 expect(affordableIdeaReplacementCount(2,7,3,n=>n)).toBe(1);
});

it('routes an independently evidenced intrinsic sharing-limit to original-pool replacement without a futile same-premise model repair', async()=>{
 const observed={...assessment(['sharing']),issues:['传播倾向存在已举证薄弱处：门派水权题材较窄，传播面不如其它卡普适。']};
 observed.presentationReview.readerGoals.sharing.reason='哑奴的代价有记忆点，但仙侠门派水权细节较窄，传播面不如其它卡普适';
 expect(readerGoalDeficitRequiresNewPremise(observed)).toBe(true);
 expect(readerGoalDeficitRequiresNewPremise({...observed,issues:[...observed.issues,'篇幅分线合计与总章数不一致']})).toBe(false);
 expect(readerGoalDeficitRequiresNewPremise({...observed,presentationReview:{...observed.presentationReview,issues:['另一项独立证据缺失']}})).toBe(false);
 let remaining=['P11'];
 const repair=vi.fn(),replaceBatch=vi.fn(async()=>{remaining=[];return 'replaced' as const});
 const result=await fulfillDiscoveryGaps({missing:()=>remaining,hasCard:()=>true,
  repairEligible:()=>!readerGoalDeficitRequiresNewPremise(observed),
  canRepair:()=>true,repair,canReplace:()=>true,replaceBatch,fingerprint:()=>JSON.stringify(remaining)});
 expect(result).toBe('requested_quantity_verified');
 expect(repair).not.toHaveBeenCalled();
 expect(replaceBatch).toHaveBeenCalledOnce();
 expect(replaceBatch).toHaveBeenCalledWith(['P11']);
});
it('does not overgeneralize intrinsic sharing limitations to an improvable opening or actual story incoherence',()=>{
 const weak={...assessment(['sharing'])};
 weak.presentationReview.readerGoals.sharing.reason='开头未把人物选择与受害亲属的实际影响展示清楚';
 expect(readerGoalDeficitRequiresNewPremise(weak)).toBe(false);
 const nonSharing=assessment(['click']);
 nonSharing.presentationReview.readerGoals.click.reason='只在介绍背景，首屏没有现实利益冲突';
 expect(readerGoalDeficitRequiresNewPremise(nonSharing)).toBe(false);
 const noCausal={...assessment(['sharing'])};
 noCausal.presentationReview.readerGoals.sharing.reason='仙侠门派水权细节较窄，传播面不如其它卡普适';
 noCausal.presentationReview.storyCoherent=false;
 expect(readerGoalDeficitRequiresNewPremise(noCausal)).toBe(false);
});
