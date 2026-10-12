import { describe, expect, it, vi } from 'vitest';
import { RealLLMService } from './real-llm.service';
import { SCORE_DIMENSIONS } from '../modules/writing-quality/stage-score';

function fixture(candidate: string) {
  const service = Object.create(RealLLMService.prototype) as any;
  service.metrics = { beginRun: vi.fn(() => ({ id: 'run' })), finishRun: vi.fn(), blockRunValidation: vi.fn() };
  service.evaluateGeneratedRun = vi.fn(async () => candidate);
  return service;
}

describe('final quality patch chapter contract', () => {
  it('checks the exact patched body before marking the run successful', async () => {
    const s = fixture('改稿');
    const validator = vi.fn(async (body: string) => {
      expect(body).toBe('改稿');
      expect(s.metrics.finishRun).not.toHaveBeenCalled();
    });
    expect(await s.validateGeneratedContent('p',1,'原稿','合同',validator)).toBe('改稿');
    expect(s.metrics.finishRun.mock.calls[0][1]).toBe('success');
  });
  it('invalidates PASS and stores rejected candidate when the patch violates the chapter', async () => {
    const s = fixture('错误改稿');
    await expect(s.validateGeneratedContent('p',1,'原稿','合同',async () => { throw Error('改稿破坏必需事件'); })).rejects.toThrow('必需事件');
    expect(s.metrics.blockRunValidation).toHaveBeenCalledWith('run','改稿破坏必需事件');
    expect(s.metrics.finishRun.mock.calls[0][1]).toBe('failed');
    expect(s.metrics.finishRun.mock.calls[0][3]).toBe('错误改稿');
  });
  it('does not duplicate alignment review if quality evaluation did not edit the body', async () => {
    const s = fixture('原稿'), validator = vi.fn();
    await s.validateGeneratedContent('p',1,'原稿','合同',validator);
    expect(validator).not.toHaveBeenCalled();
  });
  it('rolls back a rejected final patch before recording it as accepted or learning from it', async () => {
    const s=Object.create(RealLLMService.prototype) as any;
    const body='甲文稿保留明确的行动和原有故事顺序。';
    const before={status:'evaluated',overallScore:80,dimensions:Object.fromEntries(SCORE_DIMENSIONS.map(k=>[k,{score:80}])),issues:[{ruleId:'language.test',severity:'high',evaluation:'evidenced',status:'open',evidence:{verified:true,quote:'甲'}}]};
    s.metrics={saveRunScore:vi.fn(()=>({passed:true})),runIsCurrent:vi.fn(()=>true),selectRepairStrategy:vi.fn(()=>'unique_local_replacement'),recordRepair:vi.fn(()=>'repair'),learnAcceptedRepair:vi.fn()};
    s.logger={warn:vi.fn()};
    s.assessGeneratedRun=vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce({...before,issues:[]});
    s.generateInternal=vi.fn().mockResolvedValue({content:JSON.stringify({patches:[{original:'甲',replacement:'乙'}]})});
    const validate=vi.fn(async()=>{throw Error('补丁改变作者要求');});
    expect(await s.evaluateGeneratedRun({id:'r',projectId:'p',context:'{}',constitution:{}},{scenario:'writing'},body,validate)).toBe(body);
    expect(validate).toHaveBeenCalledWith(body.replace('甲','乙'));
    expect(s.metrics.recordRepair.mock.calls[0][6]).toBe(false);
    expect(s.metrics.learnAcceptedRepair).not.toHaveBeenCalled();
    expect(s.metrics.saveRunScore).toHaveBeenCalledTimes(1);
  });
});
