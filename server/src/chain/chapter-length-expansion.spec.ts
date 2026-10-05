import { describe, expect, it, vi } from 'vitest';
import { applyChapterLengthInsertions } from './chapter-length-expansion';
import { ChainController } from './chain.controller';

describe('chapter length preserves the story exit',()=>{
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
  const result=await controller.generateBodyWithLengthGuard({basePrompt:'本章结束在门口',targetWords:40,scenario:'writing',wordRange:{min:30,max:100}});
  expect(result.startsWith('她推开门。')).toBe(true);expect(result.endsWith('门外有人等着？')).toBe(true);
  expect(controller.realLLM.generate).toHaveBeenCalledTimes(2);
 });
 it('does not silently cut the exit to satisfy an upper bound',async()=>{
  const controller=Object.create(ChainController.prototype) as any;
  controller.resolveHardlineProfile=vi.fn(()=>undefined);
  controller.realLLM={generate:vi.fn().mockResolvedValue({content:'这是一个已经发生的完整事件。'.repeat(15)+'最后的钩子必须保留。'})};
  await expect(controller.generateBodyWithLengthGuard({basePrompt:'本章出口锁定',targetWords:40,scenario:'writing',wordRange:{min:30,max:100}})).rejects.toThrow('禁止截掉收尾');
 });
});
