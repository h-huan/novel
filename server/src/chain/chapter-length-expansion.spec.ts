import { describe, expect, it, vi } from 'vitest';
import { chapterLengthReviewBatches, chapterLengthReviewEvidenceErrors, chapterLengthEvidenceAnchors, materializeChapterLengthEvidenceCorrection, chapterLengthConflictProofErrors, mergeChapterLengthEvidenceCorrection, chapterLengthReviewInput, validateChapterLengthReview, applyChapterLengthInsertions, chapterLengthInsertionAnchors, applyChapterLengthReviewRepairs } from './chapter-length-expansion';
import { ChainController } from './chain.controller';
import { chapterLengthInsertionChoices, CHAPTER_LENGTH_INSERTION_LIMIT } from './chapter-length-expansion';
it('bounds long-draft expansion choices to the existing patch budget without dropping source prose or changing positions', () => {
 const body=Array.from({length:124},(_,i)=>`第${i}段既定行动。`).join('\n\n');
 const all=chapterLengthInsertionAnchors(body), choices=chapterLengthInsertionChoices(body);
 expect(choices).toHaveLength(CHAPTER_LENGTH_INSERTION_LIMIT);
 expect(new Set(choices.map(a=>a.id)).size).toBe(CHAPTER_LENGTH_INSERTION_LIMIT);
 expect(choices[0]).toEqual(all[0]);expect(choices.at(-1)).toEqual(all.at(-1));
 expect(choices.every(a=>all.some(original=>original.id===a.id&&original.position===a.position))).toBe(true);
 const controller=Object.create(ChainController.prototype) as any;
 const prompt=controller.buildChapterLengthInsertionPrompt('既定全部场景',body,200,400,1,{min:380,max:440});
 expect(prompt).toContain(body);
 // The catalogue is finite while the separately supplied source remains complete.
 expect(prompt.match(/"id":"p-/g)).toHaveLength(CHAPTER_LENGTH_INSERTION_LIMIT);
 expect(chapterLengthInsertionChoices('开头。\n\n结尾。')).toEqual(chapterLengthInsertionAnchors('开头。\n\n结尾。'));
 expect(()=>applyChapterLengthInsertions(body,{insertions:Array.from({length:14},(_,i)=>({anchorId:all[i].id,text:'新增。'}))})).toThrow('1–12');
});
it.each([false,true])('checks time consumption before expansion and retains the actual source; retained=%s',async retained=>{
 const c=Object.create(ChainController.prototype) as any;const source='她推开门。\n\n门外有人等着？';
 c.resolveHardlineProfile=vi.fn(()=>undefined);c.logger={error:vi.fn(),warn:vi.fn()};
 c.generationMetrics={getLengthCalibration:()=>null,beginRun:vi.fn(()=>({id:'failed-preparation'})),finishRun:vi.fn(),record:vi.fn()};
 c.realLLM={generate:vi.fn().mockResolvedValue({content:source})};
 await expect(c.generateBodyWithLengthGuard({basePrompt:'本章出口',targetWords:40,scenario:'writing',wordRange:{min:30,max:100},initialContent:retained?source:undefined,metricsContext:{projectId:'p'},prepareInitialDraft:async()=>{throw Error('时间消费未完成');}})).rejects.toThrow('时间消费未完成');
 expect(c.realLLM.generate).toHaveBeenCalledTimes(retained?0:1);expect(c.logger.error.mock.calls[0][0]).toContain('正文时间计划消费核对失败');expect(c.generationMetrics.finishRun).toHaveBeenCalledWith('failed-preparation','failed',expect.any(Number),source,'时间消费未完成');
 expect(c.generationMetrics.record).toHaveBeenCalledWith(expect.objectContaining({stepKey:'body_time_plan_consumption_contract'}));
});

function installLengthReview(controller:any) {
 const generate=controller.realLLM.generate;
 controller.realLLM.generate=vi.fn((request:any)=>{
  if(request.metrics?.stepKey!=='body_length_review')return generate(request);
  const items=JSON.parse(request.prompt.slice(request.prompt.indexOf('\n')+1));
  return Promise.resolve({content:JSON.stringify({checks:items.map((item:any)=>({id:item.id,status:'supported',addedEvidence:item.text,sourceEvidence:item.following||item.previous,reason:'新增选择与前后状态衔接，没有重复原动作。'}))})});
 });
}
describe('chapter length preserves the story exit',()=>{
 it('uses current paragraph IDs after layout merges sentences, rejecting guessed mid-paragraph anchors',()=>{
  const body='我收起信。次日清晨，我又来到门口。\n\n她递来钥匙。\n\n门后有人吗？';
  expect(()=>applyChapterLengthInsertions(body,{insertions:[{before:'次日清晨，我又来到门口。',text:'新增场景'}]})).toThrow('既有段落之前');
  const anchor=chapterLengthInsertionAnchors(body).find(a=>a.preview==='她递来钥匙。')!;
  const text='我站在门边听了一会儿。';
  const result=applyChapterLengthInsertions(body,{insertions:[{anchorId:anchor.id,text}]});
  expect(result.replace(text+'\n\n','')).toBe(body);
  expect(result.endsWith('门后有人吗？')).toBe(true);
  expect(()=>applyChapterLengthInsertions(body+'新内容',{insertions:[{anchorId:anchor.id,text}]})).toThrow('不属于当前正文');
  expect(()=>applyChapterLengthInsertions(body,{insertions:[{anchorId:anchor.id,text},{before:'她递来钥匙。',text}]})).toThrow('位置重复');
  expect(()=>applyChapterLengthInsertions(body,{insertions:[{anchorId:anchor.id,before:'我收起信。',text}]})).toThrow('不一致');
 });
 it('records a rejected insertion after successful model calls instead of hiding the validation failure',async()=>{
  const controller=Object.create(ChainController.prototype) as any;
  const first='她收起信。门外又有人敲门。\n\n谁在那里？';
  controller.resolveHardlineProfile=vi.fn(()=>undefined);
  controller.logger={error:vi.fn(),warn:vi.fn()};
  controller.generationMetrics={getLengthCalibration:()=>null,beginRun:vi.fn(()=>({id:'rejection'})),finishRun:vi.fn(),record:vi.fn()};
  controller.realLLM={generate:vi.fn().mockResolvedValueOnce({content:first}).mockImplementationOnce(async(options:any)=>{
   expect(options.prompt).toContain('anchorId');expect(options.prompt).toContain('可插入位置');
   expect(options.prompt).toContain('1–12个补丁');expect(options.prompt).toContain('每个anchorId只使用一次');
   return {content:JSON.stringify({insertions:[{anchorId:'模型虚构编号',text:'新增场景'}]})};
  })};
  installLengthReview(controller);
  await expect(controller.generateBodyWithLengthGuard({basePrompt:'本章出口',targetWords:40,scenario:'writing',wordRange:{min:30,max:100},metricsContext:{projectId:'p',chapterIndex:2}})).rejects.toThrow('编号无效');
  expect(controller.generationMetrics.finishRun).toHaveBeenCalledWith('rejection','failed',expect.any(Number),expect.any(String),expect.stringContaining('编号无效'));
  expect(controller.generationMetrics.record).toHaveBeenCalledWith(expect.objectContaining({projectId:'p',chapterIndex:2,stepKey:'body_length_contract',status:'failed',phase:'validation'}));
 });
 it.each([null,{samples:8,ratio:0.64,medianTarget:40}])('states the real first-pass target even without history: %j',async calibration=>{
  const controller=Object.create(ChainController.prototype) as any;
  controller.resolveHardlineProfile=vi.fn(()=>undefined);
  controller.generationMetrics={getLengthCalibration:vi.fn(()=>calibration)};
  controller.realLLM={generate:vi.fn().mockImplementation(async(options:any)=>{
   const values=JSON.parse(options.prompt.split('【本次首稿篇幅验收参数】')[1].trim());
   expect(values).toMatchObject({targetWords:40,minWords:30,maxWords:100,countingBasis:'汉字数＋英文词数；标点、空白、纯数字不计入'});
   expect(values.historicalFirstPass).toEqual(calibration?{samples:8,actualToTargetRatio:0.64}:null);
   return {content:'她沿着门边留下的痕迹找到钥匙，又拿出信封核对收件人，终于确认屋里的人已经离开了。'};
  })};
  installLengthReview(controller);
  const result=await controller.generateBodyWithLengthGuard({basePrompt:'既定场景',targetWords:40,scenario:'writing',wordRange:{min:30,max:100},metricsContext:{projectId:'new-project'}});
  expect(result).toContain('已经离开了');expect(controller.realLLM.generate).toHaveBeenCalledTimes(1);
 });
 it.each(['雨停了，她把门推开。','钟响了，他把门推开。'])('adds inside existing scenes while preserving all original paragraphs: %s',opening=>{
  const body=opening+'\n\n她问，下一次还能见到你吗？';
  const result=applyChapterLengthInsertions(body,{insertions:[{before:'她问，下一次还能见到你吗？',text:'她把钥匙握紧，听完对方的话，才把最后的问题说出口。'}]});
  expect(result.startsWith(opening)).toBe(true);
  expect(result.endsWith('她问，下一次还能见到你吗？')).toBe(true);
  expect(result.replace('她把钥匙握紧，听完对方的话，才把最后的问题说出口。\n\n','')).toBe(body);
 });
 it('rejects ambiguous, mid-paragraph and absent anchors instead of appending',()=>{
  for(const before of ['重复','不存在','问']) expect(()=>applyChapterLengthInsertions('重复\n\n重复\n\n最后一问。',{insertions:[{before,text:'新增内容'}]})).toThrow();
 });
 it('uses the production length loop to insert before the ending instead of concatenating a continuation',async()=>{
  const controller=Object.create(ChainController.prototype) as any;
  const first='她推开门。\n\n门外有人等着？';
  controller.resolveHardlineProfile=vi.fn(()=>undefined);
  controller.realLLM={generate:vi.fn().mockResolvedValueOnce({content:first}).mockImplementationOnce(async(options:any)=>{
   expect(options.responseFormat).toBe('json_object');expect(options.prompt).toContain('章内插入');
   return {content:JSON.stringify({insertions:[{before:'门外有人等着？',text:'她把钥匙放回口袋，仔细听完屋里的声音，然后看着门边那个人，等他把来意说清。'}]})};
  })};
  installLengthReview(controller);
  const result=await controller.generateBodyWithLengthGuard({basePrompt:'本章结束在门口',targetWords:40,scenario:'writing',wordRange:{min:30,max:100}});
  expect(result.startsWith('她推开门。')).toBe(true);expect(result.endsWith('门外有人等着？')).toBe(true);
  expect(controller.realLLM.generate).toHaveBeenCalledTimes(3);
 });
 it('does not silently cut the exit to satisfy an upper bound',async()=>{
  const controller=Object.create(ChainController.prototype) as any;
  controller.resolveHardlineProfile=vi.fn(()=>undefined);
  controller.realLLM={generate:vi.fn().mockResolvedValue({content:'这是一个已经发生的完整事件。'.repeat(15)+'最后的钩子必须保留。'})};
  installLengthReview(controller);
  await expect(controller.generateBodyWithLengthGuard({basePrompt:'本章出口锁定',targetWords:40,scenario:'writing',wordRange:{min:30,max:100}})).rejects.toThrow('禁止截掉收尾');
 });
});

it('allows legitimate time advancement in a length candidate while preserving source paragraphs', () => {
  const original='倒计时：23:59:47。\n\n她把门关上。';
  const added='十秒后，倒计时：23:59:37。';
  const result=applyChapterLengthInsertions(original,{insertions:[{before:'她把门关上。',text:added}]});
  expect(result.replace(added+'\n\n','')).toBe(original);
  // Candidate merging does not certify quality; the existing full time gate still owns approval.
});

it('preserves ordinary scene enrichment and already present readings across separator styles', () => {
  const original='屏幕显示倒计时：23:59:47。\n\n她把门关上。';
  const added='她核对截图上的23：59：47，把手指挪开，又望了一眼门缝。';
  const result=applyChapterLengthInsertions(original,{insertions:[{before:'她把门关上。',text:added}]});
  expect(result.replace(added+'\n\n','')).toBe(original);
});

it('passes the source draft to final review only after a successful insertion', async () => {
  const controller=Object.create(ChainController.prototype) as any;
  const original='她推开门。\n\n门外有人等着？';
  controller.resolveHardlineProfile=vi.fn(()=>undefined);
  controller.realLLM={generate:vi.fn().mockResolvedValueOnce({content:original}).mockResolvedValueOnce({content:JSON.stringify({insertions:[{before:'门外有人等着？',text:'她把钥匙放回口袋，仔细听完屋里的声音，然后看着门边那个人，等他把来意说清。'}]})})};
  const source=vi.fn();
  installLengthReview(controller);
  await controller.generateBodyWithLengthGuard({basePrompt:'本章结束在门口',targetWords:40,scenario:'writing',wordRange:{min:30,max:100},onLengthInsertion:source});
  expect(source).toHaveBeenCalledTimes(1);expect(source).toHaveBeenCalledWith(original);
});

it('keeps the expansion source outside the ordinary context truncation in the actual review request', async () => {
  const controller=Object.create(ChainController.prototype) as any;
  controller.resolveHardlineProfile=vi.fn(()=>undefined);
  controller.logger={warn:vi.fn()};
  controller.realLLM={generate:vi.fn(async(request:any)=>{
    expect(request.prompt).toContain('来源原稿');
    expect(request.prompt).toContain('接餐的手也是热的。');
    expect(request.prompt).toContain('接餐的手很凉。');
    throw new Error('test stops before any external call');
  })};
  const result=await controller.checkChapterAlignment({chapterIndex:1,chapterTitle:'本章',outlineContract:'明确章节任务与既定事件。'.repeat(20),storyContext:'背景'.repeat(10000),content:'接餐的手很凉。',lengthSourceDraft:'接餐的手也是热的。'});
  expect(controller.realLLM.generate).toHaveBeenCalledTimes(1);
  expect(result.evaluationStatus).toBe('not_evaluated');
});

it('rejects replayed repeated action before accepting length insertions',()=>{
 const body='他把手机翻到那一单的详情，点开虚拟号，按了拨号。\n\n电话接通了。';
 const added='他还是按了拨号。屏幕暗下去，通话界面亮起来。';
 const input=chapterLengthReviewInput(body,{insertions:[{before:body.split('\n')[0],text:added}]});
 const review={checks:[{id:'I1',status:'conflict',addedEvidence:added,sourceEvidence:body.split('\n')[0],conflictProof:{kind:'action_replay',sourcePhase:'reexecute',addedPhase:'completed',sourceState:'后邻将再次拨号',addedState:'新增先完成拨号',completionEvidence:added,incompatibility:'同一已完成拨号无理由重演'},reason:'同一拨号动作重复搬演。'}]};
 expect(()=>validateChapterLengthReview(review,input.items)).toThrow('同一拨号动作');
 expect(()=>validateChapterLengthReview({...review,checks:[]},input.items)).toThrow('全部');
 expect(()=>validateChapterLengthReview({checks:[{...review.checks[0],sourceEvidence:'模型改写原文'}]},input.items)).toThrow('引文');
 expect(()=>validateChapterLengthReview({checks:[{...review.checks[0],status:'unknown'}]},input.items)).toThrow('未通过');
});

it('accepts only layout differences in insertion review citations, not rewritten evidence',()=>{
 const body='她接通电话。\n\n对方没有说话。';
 const input=chapterLengthReviewInput(body,{insertions:[{before:'她接通电话。',text:'她想报名字。\n\n又忍住了。'}]});
 const valid={checks:[{id:'I1',status:'supported',addedEvidence:'她想报名字。又忍住了。',sourceEvidence:'她接通电话。对方没有说话。',reason:'准备说话与拨通电话不是同一动作。'}]};
 expect(()=>validateChapterLengthReview(valid,input.items)).not.toThrow();
 expect(()=>validateChapterLengthReview({checks:[{...valid.checks[0],addedEvidence:'她本想报名字，却忍住了。'}]},input.items)).toThrow('引文');
});

it('reviews neighboring insertions against the whole candidate without treating them as original facts',()=>{
 const body='她交出钥匙。\n\n门开了。\n\n她离开。';
 const proposal={insertions:[{before:'门开了。',text:'她又把钥匙塞回口袋。'},{before:'她交出钥匙。',text:'她已经把钥匙放在桌上。'}]};
 const input=chapterLengthReviewInput(body,proposal);
 expect(input.items[0].candidatePrevious).toContain('她已经把钥匙放在桌上。');
 expect(input.items[0].previous).not.toContain('她已经把钥匙放在桌上。');
 const rows=input.items.map(item=>({id:item.id,status:item.id==='I1'?'conflict':'supported',addedEvidence:item.text,sourceEvidence:item.id==='I1'?'她已经把钥匙放在桌上。':'她交出钥匙。',conflictProof:item.id==='I1'?{kind:'state_conflict',sourcePhase:'completed',addedPhase:'advance',sourceState:'钥匙已离手',addedState:'钥匙再次入袋',stateRelation:'impossible_transition',transitionBasis:'钥匙已交出且未取回却重新入袋，物件交割状态衔接没有成立',incompatibility:'钥匙未取回却再次在手'}:undefined,reason:item.id==='I1'?'钥匙已离手，未取回又塞回口袋，缺少状态桥接。':'新增动作与原稿衔接。'}));
 expect(()=>validateChapterLengthReview({checks:rows},input.items)).toThrow('缺少状态桥接');
});
it('resumes a retained short draft at length expansion rather than regenerating its first pass',async()=>{
 const controller=Object.create(ChainController.prototype) as any;const original='她推开门。\n\n门外有人等着？';
 controller.resolveHardlineProfile=vi.fn(()=>undefined);
 controller.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify({insertions:[{before:'门外有人等着？',text:'她把钥匙放回口袋，仔细听完屋里的声音，然后看着门边那个人，等他把来意说清。'}]})})};
 installLengthReview(controller);
 const result=await controller.generateBodyWithLengthGuard({basePrompt:'本章出口',initialContent:original,targetWords:40,scenario:'writing',wordRange:{min:30,max:100}});
 expect(result.startsWith('她推开门。')).toBe(true);expect(controller.realLLM.generate.mock.calls.map((call:any)=>call[0].metrics.stepKey)).toEqual(['body_length_retry','body_length_review']);
});
it('does not call a model for a retained draft already within its word range',async()=>{
 const controller=Object.create(ChainController.prototype) as any;controller.realLLM={generate:vi.fn()};
 const original='她收起信封，沿着门口的痕迹追到楼下，终于找到那个迟迟没有回话的人。';
 const result=await controller.generateBodyWithLengthGuard({basePrompt:'本章出口',initialContent:original,targetWords:40,scenario:'writing',wordRange:{min:20,max:100}});
 expect(result).toBe(original);expect(controller.realLLM.generate).not.toHaveBeenCalled();
});

it('repairs only proven insertion conflicts and rejects uncertain or misplaced repairs',()=>{
 const proposal={insertions:[{before:'第一段',text:'保留内容'},{before:'第二段',text:'重复动作'}]};
 const findings=[{id:'I2',status:'conflict',reason:'动作重复'}];
 const repaired=applyChapterLengthReviewRepairs(proposal,findings,{repairs:[{id:'I2',text:'新的选择后果'}]});
 expect(repaired.insertions[0]).toBe(proposal.insertions[0]);
 expect(repaired.insertions[1]).toEqual({before:'第二段',text:'新的选择后果'});
 expect(proposal.insertions[1].text).toBe('重复动作');
 for(const repairs of [[],[{id:'I1',text:'越界'}],[{id:'I2',text:''}],[{id:'I2',text:'甲'},{id:'I2',text:'乙'}]])
  expect(()=>applyChapterLengthReviewRepairs(proposal,findings,{repairs})).toThrow();
 expect(()=>applyChapterLengthReviewRepairs(proposal,[{...findings[0],status:'unknown'}],{repairs:[{id:'I2',text:'猜测'}]})).toThrow('未知');
});

it.each(['supported','conflict','unknown'])('bounds insertion repair and rechecks the entire candidate: %s',async finalStatus=>{
 const controller=Object.create(ChainController.prototype) as any;
 const original='她已经推开门。\n\n屋里没有人。\n\n门外有人等着？';
 const proposal={insertions:[{before:'屋里没有人。',text:'她又推开门。'},{before:'门外有人等着？',text:'她把钥匙放回口袋。'}]};
 const repairedText='她沿着门框上的划痕看过去，发现门锁底下有一小片碎纸，边缘还没湿透。';
 controller.resolveHardlineProfile=vi.fn(()=>undefined);
 controller.logger={error:vi.fn(),warn:vi.fn()};
 controller.realLLM={generate:vi.fn(async(request:any)=>{
  const step=request.metrics.stepKey;
  if(step==='body_length_retry')return {content:JSON.stringify(proposal)};
  if(step==='body_length_local_repair')return {content:JSON.stringify({repairs:[{id:'I1',text:repairedText}]})};
  const items=JSON.parse(request.prompt.slice(request.prompt.indexOf('\n')+1));
  expect(items).toHaveLength(2);
  if(step==='body_length_recheck'){
   expect(items[0].text).toBe(repairedText);expect(items[1].text).toBe(proposal.insertions[1].text);
  }
  return {content:JSON.stringify({checks:items.map((item:any)=>({id:item.id,status:item.id==='I1'?(step==='body_length_review'?'conflict':finalStatus):'supported',addedEvidence:item.text,sourceEvidence:item.previous||item.following,conflictProof:item.id==='I1'&&(step==='body_length_review'||finalStatus==='conflict')?{kind:'action_replay',sourcePhase:'completed',addedPhase:'reexecute',sourceState:'门已经推开',addedState:'再次推开同门',completionEvidence:item.previous||item.following,incompatibility:'原开门动作已经完成却再次执行'}:undefined,reason:'核对新增动作与原稿衔接。'}))})};
 })};
 const accepted=vi.fn();
 const action=controller.generateBodyWithLengthGuard({basePrompt:'本章出口',initialContent:original,targetWords:60,scenario:'writing',wordRange:{min:50,max:100},onLengthInsertion:accepted});
 if(finalStatus==='supported'){
  const result=await action;expect(result.replace(repairedText,'').replace(proposal.insertions[1].text,'').replace(/\s/g,'')).toBe(original.replace(/\s/g,''));
  expect(accepted).toHaveBeenCalledOnce();
 }else{await expect(action).rejects.toThrow('扩写衔接未通过');expect(accepted).not.toHaveBeenCalled();}
 expect(controller.realLLM.generate.mock.calls.map((call:any)=>call[0].metrics.stepKey)).toEqual(['body_length_retry','body_length_review','body_length_local_repair','body_length_recheck']);
});


it('requires completion evidence rather than treating an ongoing journey as a repeated departure',()=>{
 const body='她跨上车，往学校去。\n\n她抵达学校，交还书本。';
 const input=chapterLengthReviewInput(body,{insertions:[{before:'她抵达学校，交还书本。',text:'她确认路线，继续往学校去。'}]});
 const row={id:'I1',status:'conflict',addedEvidence:input.items[0].text,sourceEvidence:input.items[0].previous,reason:'同一目的地出现两次。'};
 expect(chapterLengthConflictProofErrors({checks:[row]},input.items)).toHaveLength(1);
 const proof={kind:'action_replay',sourcePhase:'ongoing',addedPhase:'continue',sourceState:'正在路上',addedState:'确认后继续前往',completionEvidence:input.items[0].previous,incompatibility:'两个句子都提到了学校'};
 expect(()=>validateChapterLengthReview({checks:[{...row,conflictProof:proof}]},input.items)).toThrow('动作重演必须证明');
 expect(input.items[0].following).toContain('抵达学校');
 expect(chapterLengthConflictProofErrors({checks:[{...row,conflictProof:{...proof,sourcePhase:'completed',addedPhase:'reexecute',completionEvidence:input.items[0].following}}]},input.items)).toHaveLength(1);
 const supported={...row,status:'supported',reason:'前段只开始行程，新增段确认路线后继续，后段才到达。'};
 const merged=mergeChapterLengthEvidenceCorrection({checks:[row]},[{id:'I1',reason:'缺完成证据'}],{checks:[supported]});
 expect(()=>validateChapterLengthReview(merged,input.items)).not.toThrow();
 expect(()=>mergeChapterLengthEvidenceCorrection({checks:[row]},[{id:'I1',reason:'缺完成证据'}],{checks:[{...supported,id:'I2'}]})).toThrow('仅覆盖');
 const anchors=chapterLengthInsertionAnchors(body);expect(anchors[1].previous).toContain('跨上车');expect(anchors[1].following).toContain('抵达学校');
});

it('corrects only the unsupported conflict once and preserves other findings without rewriting prose',async()=>{
 const c=Object.create(ChainController.prototype) as any;
 const body='她出发。\n\n她抵达。';const input=chapterLengthReviewInput(body,{insertions:[{before:'她抵达。',text:'她确认方向，继续走。'},{before:'她出发。',text:'她收好书本。'}]});
 const rows=input.items.map((x,i)=>({id:x.id,status:i===0?'conflict':'supported',addedEvidence:x.text,sourceEvidence:x.previous||x.following,reason:'核对真实场景状态的先后关系。'}));
 c.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify({checks:[{...rows[0],status:'supported',reason:'出发后仍在路上，确认方向未重复完成行程。'}]})})};
 const result=await c.completeLengthReviewEvidence({checks:rows},input,{projectId:'p'});
 expect(result.checks[1]).toBe(rows[1]);expect(c.realLLM.generate).toHaveBeenCalledOnce();expect(result.checks[0].status).toBe('supported');
 c.realLLM.generate.mockResolvedValue({content:JSON.stringify({checks:[rows[0]]})});await expect(c.completeLengthReviewEvidence({checks:rows},input,{})).rejects.toThrow('仍未完成');
});


it('records an unsupported review as review failure and never attempts prose repair',async()=>{
 const c=Object.create(ChainController.prototype) as any;const source='她出发。\n\n她抵达。';
 c.resolveHardlineProfile=vi.fn(()=>undefined);c.logger={error:vi.fn(),warn:vi.fn()};c.generationMetrics={getLengthCalibration:()=>null,beginRun:vi.fn(()=>({id:'incomplete-review'})),finishRun:vi.fn(),record:vi.fn()};
 c.realLLM={generate:vi.fn(async(r:any)=>{
  if(r.metrics.stepKey==='body_length_retry')return {content:JSON.stringify({insertions:[{before:'她抵达。',text:'她确认方向，继续走向目的地，沿路观察来往的人。'}]})};
  return {content:JSON.stringify({checks:[{id:'I1',status:'conflict',addedEvidence:'她确认方向，继续走向目的地，沿路观察来往的人。',sourceEvidence:'她出发。',reason:'两句方向一致，所以动作重演。'}]})};
 })};
 await expect(c.generateBodyWithLengthGuard({basePrompt:'真实上下文',initialContent:source,targetWords:40,wordRange:{min:30,max:100},scenario:'writing',metricsContext:{projectId:'p'}})).rejects.toThrow('扩写评审未完成');
 expect(c.realLLM.generate.mock.calls.map((x:any)=>x[0].metrics.stepKey)).toEqual(['body_length_retry','body_length_review','body_length_evidence_contract']);
 expect(c.generationMetrics.finishRun).toHaveBeenCalledWith('incomplete-review','failed',expect.any(Number),source,expect.stringContaining('扩写评审未完成'));
 expect(c.generationMetrics.record).toHaveBeenCalledWith(expect.objectContaining({stepKey:'body_length_review_contract'}));
});

it('corrects a supported row with a transcribed source quote and keeps every semantic verdict',async()=>{
 const source='她把手机翻过来，扣在桌上。\n\n餐出来了。',input=chapterLengthReviewInput(source,{insertions:[{before:'餐出来了。',text:'她又拿起手机看了一眼。'}]});
 const row={id:'I1',status:'supported',reason:'等待期间查看手机后继续等餐，不是重复已完成的事件。',addedEvidence:input.items[0].text,sourceEvidence:'她又把手机翻过来，扣在桌上。'};
 const errors=chapterLengthReviewEvidenceErrors({checks:[row]},input.items);expect(errors).toEqual([{id:'I1',reason:'引文无法定位插入文本与邻近原文'}]);
 const c=Object.create(ChainController.prototype) as any;c.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify({checks:[{id:'I1',status:'conflict',reason:'不能改判',addedAnchorId:'I1:text:p1',sourceAnchorId:'I1:previous:p1'}]})})};
 const fixed=await c.completeLengthReviewEvidence({checks:[row]},input,{});expect(fixed.checks[0].status).toBe('supported');expect(fixed.checks[0].reason).toBe(row.reason);expect(chapterLengthReviewEvidenceErrors(fixed,input.items)).toEqual([]);expect(()=>validateChapterLengthReview(fixed,input.items)).not.toThrow();
 expect(c.realLLM.generate).toHaveBeenCalledOnce();
 expect(()=>materializeChapterLengthEvidenceCorrection({checks:[row]},errors,{checks:[{id:'I1',addedAnchorId:'I1:previous:p1',sourceAnchorId:'I1:text:p1'}]},input.items)).toThrow('来源不符');
 c.realLLM.generate.mockResolvedValue({content:JSON.stringify({checks:[{...row,addedAnchorId:'I1:text:p1',sourceAnchorId:'I2:previous:p1'}]})});await expect(c.completeLengthReviewEvidence({checks:[row]},input,{})).rejects.toThrow('越界');
});

it('uses whole JSON syntax recovery then all expansion checks without inventing a verdict',async()=>{
 const c=Object.create(ChainController.prototype) as any,body='她收好手机。\n\n餐出来了。',input=chapterLengthReviewInput(body,{insertions:[{before:'餐出来了。',text:'她看了一眼取餐号，继续等着。'}]});
 const row={id:'I1',status:'supported',addedEvidence:input.items[0].text,sourceEvidence:input.items[0].previous,reason:'在等餐时查看号码，没有重复已完成的行动。'};
 c.realLLM={generate:vi.fn()};const raw=JSON.stringify({checks:[row]}).replace('}]}','}}]}');
 const fixed=await c.completeLengthReviewEvidence(raw,input,{});expect(fixed.checks).toEqual([row]);expect(c.realLLM.generate).not.toHaveBeenCalled();expect(()=>validateChapterLengthReview(fixed,input.items)).not.toThrow();
 c.realLLM.generate.mockResolvedValue({content:JSON.stringify({checks:[{...row,sourceEvidence:'并非原文中的句子'}]})});
 await expect(c.completeLengthReviewEvidence('not a review object',input,{})).rejects.toThrow('仍未完成');expect(c.realLLM.generate).toHaveBeenCalledOnce();
});

it('materializes an explicit completion ID at either supported location and keeps the real replay finding',()=>{
 const body='她推开门，走了进去。\n\n她放下包。',input=chapterLengthReviewInput(body,{insertions:[{before:'她放下包。',text:'她又推开那扇门走了进去。'}]});
 const original={checks:[{id:'I1',status:'conflict',reason:'同一扇门已经推开，新增又把进入动作重新执行。',addedEvidence:input.items[0].text,sourceEvidence:input.items[0].previous}]};
 const errors=chapterLengthReviewEvidenceErrors(original,input.items),proof={kind:'action_replay',sourcePhase:'completed',addedPhase:'reexecute',sourceState:'已进门',addedState:'再次进同一门',completionEvidence:'previous',incompatibility:'没有退出或重新关门，进门动作无理由再次执行'};
 const row={id:'I1',status:'conflict',reason:original.checks[0].reason,addedAnchorId:'I1:text:p1',sourceAnchorId:'I1:previous:p1',completionAnchorId:'I1:previous:p1',conflictProof:proof};
 const fixed=mergeChapterLengthEvidenceCorrection(original,errors,materializeChapterLengthEvidenceCorrection(original,errors,{checks:[row]},input.items));
 expect(chapterLengthReviewEvidenceErrors(fixed,input.items)).toEqual([]);expect(()=>validateChapterLengthReview(fixed,input.items)).toThrow('扩写衔接未通过');
 expect(()=>materializeChapterLengthEvidenceCorrection(original,errors,{checks:[{...row,conflictProof:{...proof,completionAnchorId:'I1:text:p1'}}]},input.items)).toThrow('互斥');
});

it('requires a simultaneous or impossible-transition basis before treating changing states as a conflict',()=>{
 const body='她收起手机，跨上车出发。\n\n她到了前面的路口。',input=chapterLengthReviewInput(body,{insertions:[{before:'她到了前面的路口。',text:'她在红灯前刹停了车。'}]});
 const row={id:'I1',status:'conflict',addedEvidence:input.items[0].text,sourceEvidence:input.items[0].previous,reason:'出发后却又刹停，所以认为状态互斥。',conflictProof:{kind:'state_conflict',sourcePhase:'completed',addedPhase:'static',sourceState:'已出发',addedState:'又刹停',incompatibility:'出发和刹停两种状态不同，所以声称矛盾。'}};
 expect(chapterLengthConflictProofErrors({checks:[row]},input.items)[0].reason).toContain('正常先后变化');
 expect(chapterLengthReviewInput(body,{insertions:[{before:'她到了前面的路口。',text:'她在红灯前刹停了车。'}]}).prompt).toContain('不要求');
});

it('bounds all twelve reviews while preserving global neighboring insertions and IDs',async()=>{
 const body=Array.from({length:13},(_,i)=>'原稿段落'+i+'。').join('\n\n');
 const proposal={insertions:chapterLengthInsertionAnchors(body).slice(0,12).map((a,i)=>({anchorId:a.id,text:'新增选择'+i+'。'}))};
 const input=chapterLengthReviewInput(body,proposal),batches=chapterLengthReviewBatches(input);
 expect(batches.map(b=>b.items.length)).toEqual([4,4,4]);expect(batches.flatMap(b=>b.items)).toEqual(input.items);
 expect(batches[1].items[0].candidatePrevious).toContain('新增选择3。');
 const c=Object.create(ChainController.prototype) as any;
 c.realLLM={generate:vi.fn(async(r:any)=>({content:JSON.stringify({checks:JSON.parse(r.prompt.slice(r.prompt.indexOf('\n')+1)).map((item:any)=>({id:item.id,status:'supported',addedEvidence:item.text,sourceEvidence:item.following,reason:'新增选择正常衔接'}))})}))};
 const result=await c.reviewChapterLengthBatches(input,{projectId:'p'},'body_length_review');
 expect(c.realLLM.generate).toHaveBeenCalledTimes(3);expect(result.checks.map((r:any)=>r.id)).toEqual(input.items.map(i=>i.id));
 c.realLLM.generate.mockImplementationOnce(async()=>{throw Error('输出截断');});
 await expect(c.reviewChapterLengthBatches(input,{},'body_length_recheck')).rejects.toThrow('输出截断');
 expect(c.realLLM.generate).toHaveBeenCalledTimes(4);
});
it('rejects missing and foreign batch rows before they can be merged',async()=>{
 const input=chapterLengthReviewInput('原稿第一段。\n\n原稿第二段。',{insertions:[{before:'原稿第二段。',text:'新增选择。'}]});
 const c=Object.create(ChainController.prototype) as any;c.realLLM={generate:vi.fn(async()=>({content:'{"checks":[]}'}))};
 await expect(c.reviewChapterLengthBatches(input,{},'body_length_review')).rejects.toThrow('覆盖全部');
 c.realLLM.generate.mockResolvedValue({content:JSON.stringify({checks:[{id:'I9',status:'supported',addedEvidence:'新增选择。',sourceEvidence:'原稿第二段。',reason:'正常'}]})});
 await expect(c.reviewChapterLengthBatches(input,{},'body_length_review')).rejects.toThrow('重复或无效');
});

it('includes the required state conflict fields in every review schema example',()=>{
 const content='她收好资料。\n\n她刚要取外套。';
 const proposal={insertions:[{anchorId:chapterLengthInsertionAnchors(content)[1].id,text:'她已经下楼。'}]};
 const batch=chapterLengthReviewBatches(chapterLengthReviewInput(content,proposal))[0];
 expect(batch.prompt).toContain('"stateRelation":');
 expect(batch.prompt).toContain('"transitionBasis":');
 expect(batch.prompt).toContain('不得凭空补出正文未写的折返');
});
