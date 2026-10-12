import { describe, expect, it } from 'vitest';
import { CHAPTER_WORD_RANGE } from '../../shared/src';
import { chapterDetailStructureIssues } from './chapter-detail-contract';

const context = { allowedMin: CHAPTER_WORD_RANGE.min, allowedMax: CHAPTER_WORD_RANGE.max, chapterNumber: 1, totalChapters: 5 };
const chapter = () => ({
  title: '盘下食堂', targetWords: CHAPTER_WORD_RANGE.min, wordCountReason: '依照本章场景与剩余篇幅规划',
  content: '主角被裁员后确认赔偿到账，查看旧食堂租约，核算经营成本，完成盘铺交接并安排首日营业。'.repeat(15),
  scenes: [{ location: '旧食堂', goal: '确认能否盘铺', conflict: '租期与成本尚未明确', outcome: '查清租约并签订交接清单' }],
  characterActions: [{ character: '主角', action: '核对清单后接收钥匙', result: '取得食堂经营权' }],
  conflicts: [], highlights: [], foreshadowing: [], foreshadowingRecover: [], characterStates: [], hook: '次日开始营业', emotionalTone: '谨慎期待',
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
