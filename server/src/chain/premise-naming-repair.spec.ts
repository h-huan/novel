import { describe, it, expect } from 'vitest';
import { premiseNamingRepairPlan, applyPremiseNamingRepair } from './premise-naming-repair';
import { normalizePremiseSelectionPayload, PremiseNamingError, SELECTED_PREMISE_FIELDS } from './idea-discovery-contract';
import { applyFictionNamingReplacements } from '../../shared/src/fiction-naming';

const fixture = () => ({ pool: [
  { premiseId: 'P1', workingTitle: '修手机的那个人', storyCore: '他教老人用微信，交出手机里已有的通话证据，承担铺面损失。' },
  { premiseId: 'P2', workingTitle: '夜里的修补店', storyCore: '她拒绝错误的委托，承担失去客户的代价。' },
], selectedPremises: ['P1', 'P2'].map(premiseId => ({ premiseId,
  ...Object.fromEntries(SELECTED_PREMISE_FIELDS.map(key => [key, premiseId === 'P1' ? '他教老人用微信并承担既有行动的后果' : '她拒绝错误委托并承担既定行动的后果'])),
})) });

describe('unlocked premise name-only repair', () => {
  it('uses one exact map for source and expansion, retaining IDs, ordering and every other word', () => {
    const original = fixture();
    expect(() => normalizePremiseSelectionPayload(original, 2, 2)).toThrow(PremiseNamingError);
    expect(premiseNamingRepairPlan(original).names).toEqual(['微信']);
    const actual = applyPremiseNamingRepair(original, { namingReplacements: { 微信: '邻聊' } }, 2, 2);
    const expected = normalizePremiseSelectionPayload(JSON.parse(JSON.stringify(original).replaceAll('微信', '邻聊')), 2, 2);
    expect(actual).toEqual(expected);
    expect(original.pool[0].storyCore).toContain('微信');
    expect(actual.selected[1]).toEqual(normalizePremiseSelectionPayload({pool:[original.pool[1]],selectedPremises:[original.selectedPremises[1]]},1,1).selected[0]);
  });
  it('rejects missing names, new prohibited names, unknown mappings and story rewrites', () => {
    for (const value of [{ namingReplacements: {} }, { namingReplacements: { 微信: '抖音' } },
      { namingReplacements: { 微信: '邻聊', 陌生词: '新名字' } },
      { namingReplacements: { 微信: '邻聊' }, selectedPremises: [] }]) {
      expect(() => applyPremiseNamingRepair(fixture(), value, 2, 2)).toThrow();
    }
  });
  it('aggregates all affected selected names and still rejects unrelated structural defects', () => {
    const input = fixture();input.selectedPremises[1].activeChoice = '他打开抖音并作出已有选择';
    expect(premiseNamingRepairPlan(input).names).toEqual(['微信', '抖音']);
    expect(() => applyPremiseNamingRepair(input, { namingReplacements: { 微信: '邻聊' } }, 2, 2)).toThrow();
    input.selectedPremises[1].payoff = '';
    expect(() => applyPremiseNamingRepair(input, { namingReplacements: { 微信: '邻聊', 抖音: '短影' } }, 2, 2)).toThrow('缺少');
  });
  it('never rewrites business metadata, field keys or the source object', () => {
    const original = { title: '微信那条消息', characters: [{ name: '微信', action: '打开微信' }], targetPlatform: '微信', model: 'DeepSeek', settings: { name: '微信' } };
    const actual = applyFictionNamingReplacements(original, { 微信: '邻聊' });
    expect(actual.title).toBe('邻聊那条消息');expect(actual.characters[0]).toEqual({ name: '邻聊', action: '打开邻聊' });
    expect(actual.targetPlatform).toBe('微信');expect(actual.model).toBe('DeepSeek');expect(actual.settings).toBe(original.settings);
    expect(original.characters[0].name).toBe('微信');
  });
});
