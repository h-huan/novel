import { describe, expect, it } from 'vitest';
import { CHAPTER_WORD_RANGE } from '../../shared/src';
import { chapterDetailStructureIssues, chapterDetailJsonExample, unwrapSingleChapterEnvelope, unwrapExpectedChapterEnvelope } from './chapter-detail-contract';

const context = { allowedMin: CHAPTER_WORD_RANGE.min, allowedMax: CHAPTER_WORD_RANGE.max, chapterNumber: 1, totalChapters: 5 };
const chapter = () => ({
  title: '盘下食堂', targetWords: CHAPTER_WORD_RANGE.min, wordCountReason: '依照本章场景与剩余篇幅规划',
  content: '主角被裁员后确认赔偿到账，查看旧食堂租约，核算经营成本，完成盘铺交接并安排首日营业。'.repeat(15),
  scenes: [{ location: '旧食堂', goal: '确认能否盘铺', conflict: '租期与成本尚未明确', outcome: '查清租约并签订交接清单' }],
  characterActions: [{ character: '主角', action: '核对清单后接收钥匙', result: '取得食堂经营权' }],
  conflicts: [], highlights: [], foreshadowing: [], foreshadowingRecover: [], characterStates: [], hook: '次日开始营业', emotionalTone: '谨慎期待',
});

describe('chapter payload object envelopes never weaken GEN-005',()=>{
 it('accepts only a chapter-like single nested object, not arbitrary metadata',()=>{
  const inner=chapter();
  for(const key of ['data','result','outline']){
   expect(unwrapSingleChapterEnvelope({[key]:inner})).toEqual(inner);
  }
  const outer={...inner,data:{title:'unrelated nested record'}};
  expect(unwrapSingleChapterEnvelope(outer)).toEqual(outer);
  expect(unwrapSingleChapterEnvelope({data:{message:'error'}})).toEqual({data:{message:'error'}});
 });
 it('still rejects an incomplete nested chapter after unpacking',()=>{
  const nested=unwrapSingleChapterEnvelope({data:{title:'节选',targetWords:3500}});
  expect(chapterDetailStructureIssues(nested as Record<string,any>,{
    allowedMin:4400,allowedMax:5000,chapterNumber:3,totalChapters:4,
  })).toContain('scenes必须是非空数组');
 });
});

describe('chapter example follows actual dynamic word limits',()=>{
 it('never shows the model a disallowed static 3500-word example for a 4400-5000 chapter',()=>{
  const text=chapterDetailJsonExample(4400,5000,false,'第三章：旧销归谁');
  const example=JSON.parse(text.slice(text.indexOf('{')));
  expect(example.targetWords).toBe(4700);
  expect(example.title).toBe('第三章：旧销归谁');
  expect(chapterDetailStructureIssues(example,{allowedMin:4400,allowedMax:5000,chapterNumber:3,totalChapters:4})).toEqual([]);
  expect(example.characterActions).toHaveLength(1);
 });
 it('covers another legal range and the final-chapter boundary',()=>{
  const text=chapterDetailJsonExample(2000,4000,true);
  const example=JSON.parse(text.slice(text.indexOf('{')));
  expect(example.targetWords).toBe(3000);
  expect(chapterDetailStructureIssues(example,{allowedMin:2000,allowedMax:4000,chapterNumber:4,totalChapters:4})).toEqual([]);
  expect(()=>chapterDetailJsonExample(5000,4400,false)).toThrow();
 });
});

describe('chapter detail schema under GEN-005', () => {
  it('accepts a detailed event chain over the retired 280-character cap', () => {
    const value = chapter();
    expect(value.content.length).toBeGreaterThan(280);
    expect(chapterDetailStructureIssues(value, context)).toEqual([]);
  });
  it('does not force padding on a concise event chain with complete scenes and actions', () => {
    expect(chapterDetailStructureIssues({ ...chapter(), content: '查清租约后完成食堂交接。' }, context)).toEqual([]);
  });
  it('rejects expanded multi-scene dialogue prose before spending the expensive action audit', () => {
    const dialogue=Array.from({length:24},(_,index)=>[
      '主角进入店里，先核对上一章尚未兑现的协议，留出实际选择与对手阻力。',
      '“第'+index+'次我已经核对过了”，主角说。主管回她：“那你拿什么证明？”',
      '她从抽屉里拿出记录，逐一解释前因和后果，随后又与主管争论了一整段。',
    ].join('')).join('\n');
    expect(dialogue.length).toBeGreaterThan(2200);
    expect(chapterDetailStructureIssues({...chapter(),content:dialogue},context).some(
      issue=>issue.includes('已展开成章节对白正文'))).toBe(true);
    const synopsis='先核对协议与主管的异议，再联系客户确认可执行条件，最后由有权人决定是否签署。';
    expect(chapterDetailStructureIssues({...chapter(),content:synopsis},context)).toEqual([]);
  });
  it('still rejects missing events, scene outcomes and action results', () => {
    const value = { ...chapter(), content: '', scenes: [{ location: '食堂', goal: '盘铺', conflict: '成本未知' }], characterActions: [{ character: '主角', action: '接收钥匙' }] };
    expect(chapterDetailStructureIssues(value, context)).toEqual([
      '缺少content事件链', 'scenes[0]缺少outcome', 'characterActions[0]缺少result',
    ]);
  });
  it('preserves dynamic body-length and non-final ending requirements', () => {
    const issues = chapterDetailStructureIssues({ ...chapter(), targetWords: context.allowedMax + 1, hook: '' }, context);
    expect(issues).toContain(`targetWords必须是${context.allowedMin}-${context.allowedMax}之间的整数`);
    expect(issues).toContain('非终章缺少hook');
  });
});


describe('frozen chapter identity wins over provider envelope order',()=>{
 it('selects the uniquely identified target even when another chapter appears first',()=>{
  const preceding={...chapter(),title:'前一章',chapterNumber:2,content:'前章旧事件'};
  const expected={...chapter(),title:'盘下食堂',chapterNumber:3};
  expect(unwrapExpectedChapterEnvelope({chapters:[preceding,expected]},3,'盘下食堂')).toEqual(expected);
  expect(unwrapExpectedChapterEnvelope([preceding,expected],3,'盘下食堂')).toEqual(expected);
 });
 it('rejects ambiguous alternatives or the wrong chapter without silently taking index zero',()=>{
  const first={...chapter(),title:'同一个标题',content:'路线一'};
  const other={...chapter(),title:'同一个标题',content:'冲突路线二'};
  expect(unwrapExpectedChapterEnvelope({chapters:[first,other]},2,'同一个标题')).toBeNull();
  expect(unwrapExpectedChapterEnvelope({...chapter(),chapterNumber:2},3,'盘下食堂')).toBeNull();
  expect(unwrapExpectedChapterEnvelope({chapter:[{...chapter(),chapterNumber:2}]},3,'盘下食堂')).toBeNull();
 });
 it('rejects the wrong frozen chapter title even without an explicit number',()=>{
  const wrong={...chapter(),title:'前一章',content:'前一章事件'};
  expect(unwrapExpectedChapterEnvelope(wrong,3,'盘下食堂')).toBeNull();
  expect(unwrapExpectedChapterEnvelope({chapters:[wrong]},3,'盘下食堂')).toBeNull();
  expect(unwrapExpectedChapterEnvelope({...wrong,chapterNumber:3},3,'盘下食堂')).toBeNull();
  expect(unwrapExpectedChapterEnvelope({chapters:[wrong,chapter()]},3,'盘下食堂')).toEqual(chapter());
 });
 it('does not pay for another generated chapter when repeated envelopes contain identical data',()=>{
  const item={...chapter(),chapterNumber:3};
  expect(unwrapExpectedChapterEnvelope({chapter:[item,structuredClone(item)]},3,item.title)).toEqual(item);
  expect(unwrapExpectedChapterEnvelope({result:item},3,item.title)).toEqual(item);
 });
});
