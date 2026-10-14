import { describe, expect, it, vi } from 'vitest';
import { ChapterDerivedDataSyncService } from './chapter-derived-data-sync.service';

const input: any = {projectId:'p',chapterId:'c',beforeContent:'第二天。第二天。',afterContent:'第二天。第二天。',reason:'manual_resync',validatedOutlineProof:{runId:'r',outlineFingerprint:'o'}};
function service(overrides: any = {}, missing = false) {
 const quality = {gate:{passed:true},stageScore:{dimensions:{timeline:{score:78,status:'evaluated'}},issues:[]},...overrides};
 const get = vi.fn(() => missing ? null : {id:'r',quality_payload:JSON.stringify(quality)});
 const db = {prepare:vi.fn(() => ({get,all:()=>[],run:vi.fn()})),exec:vi.fn()};
 return {svc:new ChapterDerivedDataSyncService({getDb:()=>db} as any,null as any,null as any,null as any,null as any,null as any) as any,db,get};
}
describe('exact-body timeline proof reuse',()=>{
 it('requires the explicit accepted run',()=>{const {svc,get}=service();expect(svc.validatedTimelineRun({...input,validatedOutlineProof:undefined})).toBeNull();expect(get).not.toHaveBeenCalled();});
 it('requires exact current body, project and chapter in its lookup',()=>{const {svc,db,get}=service();expect(svc.validatedTimelineRun(input)).toBe('r');expect(get).toHaveBeenCalledWith('r','p','c',input.afterContent);expect(db.prepare.mock.calls[0][0]).toContain('c.content=r.output_text');});
 it('does not reuse stale or mismatched evidence',()=>{expect(service({},true).svc.validatedTimelineRun(input)).toBeNull();});
 it('does not let a passed aggregate gate hide an open time conflict',()=>{const stageScore={dimensions:{timeline:{score:66,status:'evaluated'}},issues:[{ruleId:'timeline.countdown_drift',status:'open',severity:'medium'}]};expect(service({stageScore}).svc.validatedTimelineRun(input)).toBeNull();});
 it('rejects missing, unevaluated or failed timeline assessments',()=>{for(const timeline of [undefined,{score:78,status:'not_evaluated'},{score:59,status:'evaluated'}]) expect(service({stageScore:{dimensions:{timeline},issues:[]}}).svc.validatedTimelineRun(input)).toBeNull();});
 it('keeps manual duplicate-word warning and confirmed event removal',()=>{
  const {svc,db}=service();svc.validatedTimelineRun=()=>null;
  db.prepare.mockImplementation(()=>({all:()=>[{id:'event',summary:'已确认事件',review_status:'confirmed',title:'event'}]}));
  svc.persistReviews=vi.fn((_i:any,_c:any,_t:any,issues:any[])=>issues);
  const result=svc.reviewTimeline({...input,beforeContent:'已确认事件',validatedOutlineProof:undefined},'hash');
  expect(result.map((i:any)=>i.type)).toEqual(['confirmed_event_overturned','time_order_risk']);expect(result[0].block).toBe(true);
 });
 it('suppresses only the weak duplicate probe after validated review, retaining real event removal',()=>{
  const {svc,db}=service();svc.validatedTimelineRun=()=> 'r';svc.retireDuplicateTimeProbes=vi.fn();
  db.prepare.mockImplementation(()=>({all:()=>[{id:'event',summary:'已确认事件',review_status:'confirmed',title:'event'}]}));
  svc.persistReviews=vi.fn((_i:any,_c:any,_t:any,issues:any[])=>issues);
  const result=svc.reviewTimeline({...input,beforeContent:'已确认事件'},'hash');expect(result.map((i:any)=>i.type)).toEqual(['confirmed_event_overturned']);
 });
 it('archives only nonblocking duplicate probes at the exact body checksum',()=>{const {svc,db}=service();svc.retireDuplicateTimeProbes(input,'current-hash','r');expect(db.prepare.mock.calls[0][0]).toContain("issue_type='time_order_risk' AND blocks_lock=0 AND status='pending'");expect(db.prepare.mock.calls[0][0]).toContain('content_checksum=?');});
});

describe('summary truncation persistence boundary', () => {
 it('rejects a truncated nonempty summary without inserting it or retrying', async () => {
  const {svc,db}=service();const writes: string[]=[];
  db.prepare.mockImplementation((sql:string)=>({get:()=>({id:'old',summary:'完整的旧摘要',status:'current',content_checksum:'old-hash'}),run:()=>writes.push(sql)}));
  const generate=vi.fn(async()=>({content:'关系变化：他尚未',finishReason:'length'}));
  svc.moduleRef={get:()=>({isAvailable:async()=>true,generate})};
  const warnings:string[]=[];
  const result=await svc.syncChapterSummary({...input,beforeContent:'old body',afterContent:'new body'},'new-hash',warnings);
  expect(result.status).toBe('warning');expect(generate).toHaveBeenCalledTimes(1);
  expect(warnings.join(' ')).toContain('truncated');
  expect(writes.some(sql=>sql.includes('INSERT INTO chapter_summaries'))).toBe(false);
 });
});
