import { describe, expect, it } from 'vitest';
import { readerGoalReviewIssues, readerGoalGateIssues, invalidReaderGoalQuotes, applyReaderGoalQuoteRepairs, type ReaderGoalReview } from './reader-goal-review';
import { presentationReviewIssues } from './idea-presentation-review';
import { activeSystemWorkflowRules, READER_ENGAGEMENT_POLICY } from '../../shared/src/system-workflow-rules.registry';
const text = '她退回赔款，带着邻居亲自去找停工的原因。';
const goals = (): ReaderGoalReview => Object.fromEntries(['click','completion','sharing','immersion'].map(key => [key,
  {status:'supported',quote:text,reason:'明确行动改变人物利益，并产生读者可理解的追问'}])) as ReaderGoalReview;
describe('evidenced reader goals', () => {
  it('requires all four goals and binds each quote to actual narrative', () => {
    expect(readerGoalReviewIssues(goals(), text)).toEqual([]);
    expect(readerGoalReviewIssues(undefined, text)).toHaveLength(4);
    const wrong=goals(); wrong.sharing.quote='执行标准要求高传播，不是故事原文';
    expect(readerGoalReviewIssues(wrong,text)).toHaveLength(1);
  });
  it('keeps an evidenced weakness separate from protocol failure and prevents qualification', () => {
    const weak=goals(); weak.completion.status='weak';
    expect(readerGoalReviewIssues(weak,text)).toEqual([]);
    expect(readerGoalGateIssues(weak)).toHaveLength(1);
    expect(readerGoalGateIssues(weak)[0]).toContain('完整阅读倾向');
  });
  it('allows honest missing evidence without calling it high potential', () => {
    const unknown=goals(); unknown.immersion={status:'unknown',quote:'',reason:'没有足够的人物当前处境与关系互动证据'};
    expect(readerGoalReviewIssues(unknown,text)).toEqual([]);
    expect(readerGoalGateIssues(unknown)[0]).toContain('证据不足');
    unknown.immersion.quote='编造的小说正文';
    expect(readerGoalReviewIssues(unknown,text)).toHaveLength(1);
  });
  it('requires reader goals in the live contract even if legacy records omit them', () => {
    expect(presentationReviewIssues({reviews:[]},[],true)).toEqual([]);
    const missing = presentationReviewIssues({reviews:[{position:1,title:'题材'}]},[{title:'题材',hook:text}],true);
    expect(missing.filter(issue=>issue.includes('须有supported'))).toHaveLength(4);
  });
  it('injects the same long and short story reader policy in generation and review scenes', () => {
    for(const scenario of ['idea_generate','outline','writing','review','polish']) {
      expect(activeSystemWorkflowRules().filter(rule=>rule.scenarios.includes(scenario)).flatMap(rule=>rule.details||[])).toContain(READER_ENGAGEMENT_POLICY);
    }
    expect(READER_ENGAGEMENT_POLICY).toContain('不要求每章解决全书冲突');
    expect(READER_ENGAGEMENT_POLICY).toContain('不强制金句');
    expect(READER_ENGAGEMENT_POLICY).toContain('不强制贫穷');
  });
});

describe('bounded reader goal citation correction', () => {
  it('repairs the actual paraphrased quote through a body ID while keeping judgments immutable', () => {
    const body='陆沉把截图发进去，只问一句：谁见过这种。';
    const original=goals(); original.sharing={status:'weak',quote:'他把截图发进骑手群，只问一句：谁见过这种。',reason:'原文可讨论的差异仍不充分，不能自动判高传播'};
    for (const key of ['click','completion','immersion'] as const) original[key].quote=body;
    const snapshot=JSON.stringify(original);
    expect(invalidReaderGoalQuotes(original,body)).toEqual(['sharing']);
    const result=applyReaderGoalQuoteRepairs(original,['sharing'],{repairs:[{key:'sharing',anchorId:'body:p1',status:'supported',reason:'忽略原缺陷'}]},body);
    expect(readerGoalReviewIssues(result,body)).toEqual([]);
    expect(result.sharing).toEqual({...original.sharing,quote:body});
    expect(JSON.stringify(original)).toBe(snapshot);
  });
  it('rejects absent, duplicate, unrelated or non-body IDs without silently passing', () => {
    const original=goals();original.sharing.quote='编造引用';
    for (const repairs of [[],[{key:'sharing',anchorId:'context:p1'}],[{key:'click',anchorId:'body:p1'}],[{key:'sharing',anchorId:'body:p1'},{key:'sharing',anchorId:'body:p1'}],[{key:'sharing',anchorId:''}]]) {
      expect(applyReaderGoalQuoteRepairs(original,['sharing'],{repairs},text)).toBe(original);
      expect(readerGoalReviewIssues(original,text)).toHaveLength(1);
    }
    const unknown=goals();unknown.sharing={status:'unknown',quote:'',reason:'缺少足够传播证据，不应尝试自动补成高传播'};
    expect(invalidReaderGoalQuotes(unknown,text)).toEqual([]);
  });
});
