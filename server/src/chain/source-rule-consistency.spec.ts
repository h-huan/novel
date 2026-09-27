import { describe, expect, it } from 'vitest';
import { describeWorldSourceCandidate, detectSourceRuleConflicts } from './source-rule-consistency';

describe('source rule preflight', () => {
  it('rejects a world-shaped error object with empty core rules before saving', () => {
    expect(describeWorldSourceCandidate({ error: '林野的门后机制未经授权', rules: [] }, '林野'))
      .toContain('世界观rules必须包含2-3条非空因果规则');
  });

  it('accepts a substantive world candidate with the selected protagonist', () => {
    expect(describeWorldSourceCandidate({ era: '当代', storyPremise: '林野在拆迁旧楼找哥哥', atmosphere: '压抑',
      endingDirection: '兄弟线收束', rules: ['每进门一次现实回拨一小时', '每进门一次抹去一户'], locations: ['旧楼'] }, '林野')).toEqual([]);
  });
  it('blocks conflicting door cost trigger and time scope before prose', () => {
    const problems = detectSourceRuleConflicts({
      confirmedIdea: JSON.stringify({ hook: '每进一次现实倒退一小时，每进一次现实抹去一户人。' }),
      worldPremise: '每次进门使楼内时间回拨一小时；每进一次现实抹去一户记录。',
      worldRules: '林野每完整进出门一次，现实抹除对应一户。',
      worldProfileRules: '若林野推门，楼内时间回拨一小时；外界时钟不退。若完整进出门，名单扣名。',
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('扣名触发');
    expect(problems[1]).toContain('回拨作用范围');
  });

  it('accepts one consistent rule across source records', () => {
    expect(detectSourceRuleConflicts({
      confirmedIdea: JSON.stringify({ hook: '进门后仅楼内回拨一小时；完整进出门一次才抹去一户。' }),
      worldRules: '楼内时间回拨一小时，外界时钟不退。每完整进出门一次，现实抹除一户。',
      worldProfileRules: '进入铁门仅楼内时间回拨一小时，外界时钟不退；完整进出门才扣名。',
    })).toEqual([]);
  });

  it('does not invent constraints for unrelated mechanics', () => {
    expect(detectSourceRuleConflicts({ confirmedIdea: '一名医生在海岛医院追查失踪病人。', worldRules: '每次风暴之后，档案室才开放。' })).toEqual([]);
  });

  it('catches a lower chapter outline that changes the confirmed entry cost', () => {
    expect(detectSourceRuleConflicts({
      confirmedIdea: JSON.stringify({ description: '每进一次现实抹去一户人家的记录。' }),
      worldRules: '每次进门，名单少一户。',
      chapterOutlines: [{ chapterIndex: 1, text: '他每完整进出门一次，现实抹除一户的姓名。' }],
    })[0]).toContain('第1章章纲');
  });

  it('blocks the observed world rule that keeps reality still while the confirmed card rewinds reality', () => {
    const problems = detectSourceRuleConflicts({
      confirmedIdea: JSON.stringify({ hook: '每进一次现实倒退一小时，楼里多一个不想搬的人。' }),
      worldRules: JSON.stringify(['楼内时间比现实早一小时；现实时间不倒流，只有楼内景象停留在拆迁前。']),
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('回拨作用范围互斥');
  });
});
