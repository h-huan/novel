import { describe, expect, it } from 'vitest';
import { IdeaAppealGateService } from './idea-appeal-gate.service';

const gate = new IdeaAppealGateService();

const strongShort = {
  title: '欠条每天多一人',
  hook: '父亲葬礼后，我发现家里欠条每天都会多出一个活人的名字；每到午夜我必须找到新增债主，否则第二天母亲名下就会多出同样的债。',
  description: '我先去找第一名债主，却发现他从没借过钱；随后欠条写上了失踪姐姐的名字，我只能调查父亲留下的旧账本。没想到每还清一笔债，就会暴露一段被家人共同隐瞒的往事，直到最后一张欠条写上我自己，我必须在真相和母亲之间做选择。',
  uniquePoint: '开篇第一章就让“欠条每天多一人”发生，并迫使主角当晚找到第一个新增债主。',
  coreConflict: '主角必须不断追查新增债主并还清不存在的债，同时家人拼命阻止她翻出父亲旧账。',
  mainReversal: '最终发现欠条记录的不是金钱债，而是父亲替全家隐瞒的人情与罪责，主角的目标从还债变成决定谁承担真相的代价。',
};

describe('IdeaAppealGateService', () => {
  it('accepts a short premise with concrete pressure, immediate hook, escalation and payoff', () => {
    const result = gate.assess(strongShort, 'short_story', 'fanqie');
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.signals.hookSignalGroups).toBeGreaterThanOrEqual(3);
    expect(result.signals.progressionSignals).toBeGreaterThanOrEqual(2);
  });

  it('rejects a complete-looking but low-tension premise instead of treating field length as quality', () => {
    const result = gate.assess({
      title: '旧城来信',
      hook: '一个年轻人回到旧城整理祖屋，在抽屉里看到几封过去留下的信件，于是想知道这些信是谁写的。',
      description: '他阅读信件，走访街坊，回忆童年，也逐渐了解家人的往事。故事围绕旧城、亲情和个人成长展开，人物在回忆中获得新的理解。',
      uniquePoint: '通过旧信串联几代人的生活。',
      coreConflict: '主角想理解家族过去，而家人不愿意谈起往事。',
      mainReversal: '后来他知道写信的人另有其人。',
    }, 'short_story', 'fanqie');
    expect(result.passed).toBe(false);
    expect(result.issues.join('|')).toMatch(/代价|升级|反转|首屏冲突/);
  });

  it('rejects generic titles and titles detached from the actual story', () => {
    const generic = gate.assess({ ...strongShort, title: '命运之门' }, 'short_story', 'fanqie');
    expect(generic.passed).toBe(false);
    expect(generic.issues).toContain('标题属于可套用到任意故事的空泛模板');

    const detached = gate.assess({ ...strongShort, title: '月光落在旧窗台' }, 'short_story', 'fanqie');
    expect(detached.passed).toBe(false);
    expect(detached.issues).toContain('标题与故事核心没有可识别的具体关联，第一眼信息利用率不足');
  });

  it('does not invent click-rate percentages; it returns only explainable gate signals', () => {
    const selected = gate.select([strongShort], 1, 'short_story', 'fanqie');
    expect(selected.accepted).toHaveLength(1);
    expect(JSON.stringify(selected)).not.toMatch(/clickRate|completionRate|\d+%/);
  });
});
