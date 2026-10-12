import { validateChapterTimePlan } from './chapter-time-plan';
import { createHash } from 'node:crypto';
/** A review retry must reuse a persisted prose run, then repeat every current gate. */
export function chapterReviewRetryContent(run: any, projectId: string, chapterIndex: number): string {
  // 最终一致性失败记录保存的是待修正文，但历史日志将其标作 review。
  // 普通评审记录仍拒绝；这里只恢复明确阻断的正文，随后重跑所有验收。
  const blockedProse = run?.status === 'failed' && run?.gate_status === 'blocked'
    && ['【本章大纲一致性】', '【评审未完成】', '【正文硬红线】'].some(prefix => String(run?.error || '').startsWith(prefix));
  if (!run || run.project_id !== projectId || Number(run.chapter_index) !== chapterIndex
    || !['chapter', 'refinement'].includes(run.stage) || (run.scenario === 'review' && !blockedProse)
    || !String(run.output_text || '').trim() || String(run.output_text).trim().startsWith('{')) {
    throw new Error('评审重试必须引用同项目同章节的已留存正文，不能使用评审JSON或其它章节记录');
  }
  return String(run.output_text);
}

export function chapterReviewRetrySource(run:any,projectId:string,chapterIndex:number):string|undefined {
 const content=chapterReviewRetryContent(run,projectId,chapterIndex);
 let payload:any;try{payload=JSON.parse(run.quality_payload||'{}');}catch{return undefined;}
 const source=payload?.expansionSource;
 if(source?.version!==1||source.draftHash!==createHash('sha256').update(content).digest('hex')||typeof source.sourceDraft!=='string'||!source.sourceDraft.trim()||source.sourceDraft.trim().startsWith('{'))return undefined;
 return source.sourceDraft;
}

/** Only reuse the plan bound to this exact draft and unchanged chapter contract. */
export function chapterReviewRetryTimePlan(run:any,projectId:string,chapterIndex:number,outline:string) {
 const content=chapterReviewRetryContent(run,projectId,chapterIndex);
 let payload:any;try{payload=JSON.parse(run.quality_payload||'{}');}catch{return undefined;}
 const saved=payload.timePlan;
 if(saved?.version!==1||saved.draftHash!==createHash('sha256').update(content).digest('hex')||saved.outlineHash!==createHash('sha256').update(outline).digest('hex'))return undefined;
 try{return validateChapterTimePlan({timers:saved.timers},outline);}catch{return undefined;}
}
