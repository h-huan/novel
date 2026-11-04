import {ChainController} from './chain.controller';
import {afterEach,expect,it,vi} from 'vitest';
import {bindModelRequestClock,remainingModelRequestTime,ModelRequestExpiredError} from './model-request-clock';
import {RealLLMService} from './real-llm.service';
import {IdempotentRealLLMService} from './idempotent-real-llm.service';
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('inherits the original deadline on re-entry and rejects expired work before dispatch',()=>{
 vi.useFakeTimers();const first=bindModelRequestClock({prompt:'same',timeout:100});vi.setSystemTime(Date.now()+90);
 const next=bindModelRequestClock(first);expect(next.deadlineAt).toBe(first.deadlineAt);expect(remainingModelRequestTime(next)).toBe(10);
 vi.setSystemTime(Date.now()+11);expect(()=>bindModelRequestClock(next)).toThrow(ModelRequestExpiredError);
});
it('rejects a late provider success when the event loop resumes before its timeout callback',async()=>{
 vi.useFakeTimers();const service=new RealLLMService({getConfig:()=>({defaults:{maxTokens:4096}}),getModelForScenario:()=>({modelName:'fixture',modelVersion:'fixture',temperature:0})} as any);
 const physical=vi.fn(async()=>{vi.setSystemTime(Date.now()+21);return {content:'{}',finishReason:'stop'};});(service as any).callModel=physical;
 await expect(service.generate({prompt:'same',timeout:20,responseFormat:'json_object'})).rejects.toBeInstanceOf(ModelRequestExpiredError);
 expect(physical).toHaveBeenCalledTimes(1);
});
it('does not re-enter the provider after an exhausted outer network recovery allowance',async()=>{
 vi.useFakeTimers();const base=vi.spyOn(RealLLMService.prototype,'generate').mockImplementation(async()=>{vi.setSystemTime(Date.now()+21);throw Error('ECONNRESET');});
 const service=new IdempotentRealLLMService({} as any,{} as any,{} as any);
 await expect(service.generate({prompt:'same',timeout:20})).rejects.toBeInstanceOf(ModelRequestExpiredError);
 expect(base).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});

it.each(['shared_deadline','late_success','expired_before_retry'])('keeps structured correction in its original logical clock: %s',async mode=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(1000);
 const c=Object.create(ChainController.prototype) as any;
 const calls:any[]=[];c.logger={warn:vi.fn(),error:vi.fn()};
 c.realLLM={generate:vi.fn(async(request:any)=>{calls.push(request);
  if(calls.length===1){vi.setSystemTime(mode==='expired_before_retry'?2101:1600);return {content:'{"ok":false}'};}
  expect(request.deadlineAt).toBe(2000);vi.setSystemTime(mode==='late_success'?2101:1800);return {content:'{"ok":true}'};
 })};
 const task=c.llmCallWithRetry('结构纠错','原始条件',{timeout:1000,validate:(value:any)=>value.ok===true,describeValidation:()=>['实际字段缺失']});
 if(mode==='shared_deadline'){expect((await task).data).toEqual({ok:true});expect(calls.map(row=>row.deadlineAt)).toEqual([2000,2000]);}
 else {await expect(task).rejects.toBeInstanceOf(ModelRequestExpiredError);expect(calls).toHaveLength(mode==='expired_before_retry'?1:2);}
});

it('inherits the parent deadline in actual stage judging and stops expired evidence completion',async()=>{
 vi.useFakeTimers();vi.setSystemTime(1000);const service:any=Object.create(RealLLMService.prototype);service.logger={warn:vi.fn(),error:vi.fn()};
 const calls:any[]=[];service.generateInternal=vi.fn(async(request:any)=>{calls.push(request);vi.setSystemTime(1060);return {content:'not json'};});
 const constitution={schemaVersion:1,revision:1,projectType:'short_story',targetPlatform:'fanqie',targetWords:20000,category:'现实生活',pov:'第一人称',storyTone:['现实'],writingStyle:['克制'],webNovelGenre:['现实题材'],submissionTags:[],plotTags:[],platformRules:{},chapterWordRange:{min:1000,max:3000},confirmedStory:{storyCore:'我推开木箱进入库房取工具。'}};
 await expect(service.assessGeneratedRun({id:'run',projectId:'p',stage:'outline',constitution,context:'{}',previousChapters:[]},{prompt:'生成章纲',timeout:50,deadlineAt:1050},'已有章节事件')).rejects.toBeInstanceOf(ModelRequestExpiredError);
 expect(calls).toHaveLength(1);expect(calls[0].deadlineAt).toBe(1050);expect(calls[0].timeout).toBe(50);
});
