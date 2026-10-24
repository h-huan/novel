import {it,expect,vi} from 'vitest';
import {fulfillDiscoveryGaps,discoveryFailureImproved} from './discovery-fulfillment';
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
