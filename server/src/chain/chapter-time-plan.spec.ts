import {ChainController} from './chain.controller';
import {describe,it,expect,vi} from 'vitest';
import {chapterTimePlanRequest,validateChapterTimePlan,chapterTimePlanDirective,chapterTimeDisplaysForEvidenceReview,unplannedChapterTimeDisplays} from './chapter-time-plan';
describe('generation time plan',()=>{
 it('does not turn approximate remaining time plus an unrelated numeric window into a precise baseline',()=>{
   const outline='倒计时还剩二十来小时，她核对配送记录。亮点：她倒推出24小时里的授权窗口。倒计时掉到十来个小时。';
   expect(chapterTimePlanRequest(outline,'最初期限24小时，上一章还剩二十来小时')).toBeNull();
   expect(()=>validateChapterTimePlan({timers:[{id:'期限',basisEvidence:'倒推出24小时里的授权窗口',initialSeconds:86400,steps:[{eventEvidence:'她核对配送记录',elapsedSeconds:0}]}]},outline)).toThrow('初值与章纲期限不符');
 });
 it('uses this chapter remaining value rather than a fixed 24-hour schema example',()=>{
   const request=chapterTimePlanRequest('倒计时还剩20小时。她离开。','原期限24小时');
   expect(request).toContain('"initialSeconds":72000');
   expect(request).not.toContain('"initialSeconds":86400');
   expect(validateChapterTimePlan({timers:[{id:'期限',basisEvidence:'倒计时还剩20小时',initialSeconds:72000,steps:[{eventEvidence:'她离开。',elapsedSeconds:3600}]}]},'倒计时还剩20小时。她离开。')[0].steps[0].display).toBe('19:00:00');
 });
 const outline='页面显示24小时倒计时。她离开站点。她返回楼下。';
 const plan=()=>({timers:[{id:'期限',basisEvidence:'24小时倒计时',initialSeconds:86400,steps:[{eventEvidence:'她离开站点。',elapsedSeconds:10},{eventEvidence:'她返回楼下。',elapsedSeconds:7210}]}]});
 it('computes two timer readings rather than accepting model-reported remaining values',()=>{const result=validateChapterTimePlan(plan(),outline);expect(result[0].steps.map(s=>s.display)).toEqual(['23:59:50','21:59:50']);expect(chapterTimePlanDirective(result)).toContain('不覆盖');});
 it('locates unplanned displays without declaring ordinary clocks defective',()=>{const result=validateChapterTimePlan(plan(),outline);expect(unplannedChapterTimeDisplays('24:00:00。23：59：50。23:59:49。21:59:50。',result)).toEqual(['23:59:49']);});
 it('only plans countdown chapters rather than ordinary references to time',()=>{expect(chapterTimePlanRequest('她等了十分钟。','')).toBeNull();expect(chapterTimePlanRequest('她继续追查倒计时。','')).toBeNull();expect(chapterTimePlanRequest('倒计时还剩大约两小时。','')).toBeNull();expect(chapterTimePlanRequest(outline,'已确认资料')).toContain('候选');});
 it.each(['initial','source','event','reverse','deadline','missing'])('rejects %s without inventing missing facts',kind=>{const data=plan();if(kind==='initial')data.timers[0].initialSeconds=90000;if(kind==='source')data.timers[0].basisEvidence='虚构期限';if(kind==='event')data.timers[0].steps[0].eventEvidence='新事件';if(kind==='reverse')data.timers[0].steps[1].elapsedSeconds=1;if(kind==='deadline')data.timers[0].steps[1].elapsedSeconds=90000;if(kind==='missing')data.timers=[];expect(()=>validateChapterTimePlan(data,outline)).toThrow();});
});

it('skips time consumption work for a compliant draft and preserves the exit on one correction',async()=>{
 const c=Object.create(ChainController.prototype) as any;const plan=validateChapterTimePlan({timers:[{id:'期限',basisEvidence:'24小时倒计时',initialSeconds:86400,steps:[{eventEvidence:'她离开。',elapsedSeconds:60}]}]},'24小时倒计时。她离开。');
 c.realLLM={generate:vi.fn().mockResolvedValue({content:'倒计时仍在走。\n\n她离开。'})};
 expect(await c.prepareChapterTimePlanDraft({content:'24:00:00。\n\n她离开。',plan,basePrompt:'依据'})).toContain('24:00:00');expect(c.realLLM.generate).not.toHaveBeenCalled();
 expect(await c.prepareChapterTimePlanDraft({content:'23:59:41。\n\n她离开。',plan,basePrompt:'依据'})).toContain('仍在走');expect(c.realLLM.generate).toHaveBeenCalledTimes(1);
 c.realLLM.generate.mockResolvedValue({content:'倒计时仍在走。\n\n她获救。'});await expect(c.prepareChapterTimePlanDraft({content:'23:59:41。\n\n她离开。',plan,basePrompt:'依据'})).rejects.toThrow('章末出口');
});

it('injects the computed candidate into generation and all review context through the production coordinator',async()=>{
 const controller=Object.create(ChainController.prototype) as any;
 const outline='页面显示24小时倒计时。她离开站点。';
 controller.assertProjectSourceCompleteness=vi.fn();controller.buildWorldWritingContext=vi.fn(()=> '已确认世界');controller.resolvePlatformStrategy=vi.fn(()=>({target:{}}));controller.getActiveLessons=vi.fn(()=> '');controller.buildEndingForeshadowGuard=vi.fn(()=> '');controller.assertGeneratedChapterIdentity=vi.fn();
 controller.realLLM={generate:vi.fn().mockResolvedValue({content:JSON.stringify({timers:[{id:'期限',basisEvidence:'24小时倒计时',initialSeconds:86400,steps:[{eventEvidence:'她离开站点。',elapsedSeconds:10}]}]})})};
 controller.persistAlignmentContradictions=vi.fn();controller.realLLM.validateGeneratedContent=vi.fn(async(_p:any,_i:any,body:string,context:string)=>{expect(context).toContain('23:59:50');return body;});
 controller.generationMetrics={attachTimePlanProvenance:vi.fn()};
 controller.generateBodyWithLengthGuard=vi.fn(async(input:any)=>{expect(input.basePrompt).toContain('23:59:50');input.onRetainedLengthFailure('retained-run','她离开站点。');return '她离开站点。';});
 controller.checkChapterAlignment=vi.fn(async(input:any)=>{const context=JSON.parse(input.storyContext);expect(context.timePlanDirective).toContain('【本次候选时间计划');expect(context.timePlanDirective).toContain('23:59:50');return {pass:true,missing:[],contradictions:[],advisories:[],sourceConflicts:[]};});
 await controller.generateBodyWithAlignmentGuard({projectId:'p',basePrompt:'按章纲生成',targetWords:100,scenario:'writing',chapterIndex:1,chapterTitle:'开篇',outlineContract:outline,storyContext:'上下文'.repeat(10000),wordRange:{min:90,max:110}});
 expect(controller.realLLM.generate).toHaveBeenCalledTimes(1);
 expect(controller.generationMetrics.attachTimePlanProvenance).toHaveBeenCalledWith('retained-run',expect.objectContaining({draftHash:expect.stringMatching(/^[a-f0-9]{64}$/),outlineHash:expect.stringMatching(/^[a-f0-9]{64}$/),timers:expect.any(Array)}));
 controller.realLLM.generate.mockClear();
 await controller.generateBodyWithAlignmentGuard({projectId:'p',basePrompt:'按章纲生成',targetWords:100,scenario:'writing',chapterIndex:1,chapterTitle:'开篇',outlineContract:outline,storyContext:'',wordRange:{min:90,max:110},initialContent:'她离开站点。',initialTimePlan:validateChapterTimePlan({timers:[{id:'期限',basisEvidence:'24小时倒计时',initialSeconds:86400,steps:[{eventEvidence:'她离开站点。',elapsedSeconds:10}]}]},outline)});
 expect(controller.realLLM.generate).not.toHaveBeenCalled();
 controller.realLLM.generate.mockResolvedValue({content:'{"timers":[]}'});controller.generateBodyWithLengthGuard.mockClear();
 await expect(controller.generateBodyWithAlignmentGuard({projectId:'p',basePrompt:'按章纲生成',targetWords:100,scenario:'writing',chapterIndex:1,chapterTitle:'开篇',outlineContract:outline,storyContext:'',wordRange:{min:90,max:110}})).rejects.toThrow('时间计划未完成');
 expect(controller.generateBodyWithLengthGuard).not.toHaveBeenCalled();
 // Approximate continuation still follows prose, source validation and full alignment gates.
 controller.realLLM.generate.mockClear();
 controller.generateBodyWithLengthGuard=vi.fn(async(input:any)=>{
   expect(input.basePrompt).not.toContain('【本次候选时间计划');
   expect(input.basePrompt).toContain('"preciseBaselineAvailable":false');
   return '倒计时还剩二十来小时。她查过记录，继续往前走。';
 });
 controller.realLLM.validateGeneratedContent=vi.fn(async(_p:any,_i:any,body:string)=>body);
 controller.checkChapterAlignment=vi.fn(async(input:any)=>{
   expect(input.storyContext).not.toContain('【本次候选时间计划');
   return {pass:true,missing:[],contradictions:[],advisories:[],sourceConflicts:[]};
 });
 await controller.generateBodyWithAlignmentGuard({projectId:'p',basePrompt:'按章纲生成',targetWords:100,scenario:'writing',chapterIndex:2,chapterTitle:'继续',outlineContract:'倒计时还剩二十来小时。她核对24小时里的记录。',storyContext:'上一章计时仍在继续',wordRange:{min:90,max:110}});
 expect(controller.realLLM.generate).not.toHaveBeenCalled();
 expect(controller.generateBodyWithLengthGuard).toHaveBeenCalledOnce();
 expect(controller.realLLM.validateGeneratedContent).toHaveBeenCalledOnce();
 expect(controller.checkChapterAlignment).toHaveBeenCalledOnce();
});

it('reviews planned later readings too, preserving initial baseline and valid independently grounded prose',async()=>{
 const plan=validateChapterTimePlan({timers:[{id:'期限',basisEvidence:'24小时倒计时',initialSeconds:86400,steps:[{eventEvidence:'她离开。',elapsedSeconds:9000}]}]},'24小时倒计时。她离开。');
 const source='24:00:00。\n\n她走出站点。21:30:00。\n\n她离开。';
 expect(unplannedChapterTimeDisplays(source,plan)).toEqual([]);expect(chapterTimeDisplaysForEvidenceReview(source,plan)).toEqual(['21:30:00']);
 const c=Object.create(ChainController.prototype) as any;c.realLLM={generate:vi.fn(async(r:any)=>{expect(r.prompt).toContain('计划内与计划外');expect(r.prompt).toContain('数字匹配计划');return {content:'24:00:00。\n\n她走出站点，倒计时还在减少。\n\n她离开。'};})};
 const fixed=await c.prepareChapterTimePlanDraft({content:source,plan,basePrompt:'确认资料'});expect(fixed).not.toContain('21:30:00');expect(fixed).toContain('24:00:00');expect(c.realLLM.generate).toHaveBeenCalledTimes(1);
 c.realLLM.generate.mockResolvedValue({content:source});expect(await c.prepareChapterTimePlanDraft({content:source,plan,basePrompt:'确认资料'})).toBe(source);
 expect(chapterTimeDisplaysForEvidenceReview('24:00:00，23:59:00，24:00:00',plan)).toContain('24:00:00');
});

it('does not turn a spoken duration range into an invented precise plan baseline',()=>{
 expect(chapterTimePlanRequest('倒计时还剩一两小时。','')).toBeNull();
 expect(()=>validateChapterTimePlan({timers:[{id:'期限',basisEvidence:'倒计时一两小时',initialSeconds:3600,steps:[{eventEvidence:'她离开。',elapsedSeconds:0}]}]},'倒计时一两小时。她离开。')).toThrow('初值与章纲期限不符');
 expect(chapterTimePlanRequest('倒计时还剩二十四小时。','')).not.toBeNull();
});
