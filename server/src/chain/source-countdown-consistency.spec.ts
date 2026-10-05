import { describe, expect, it } from 'vitest';
import { detectSourceCountdownRisk } from './source-countdown-consistency';

describe('generic countdown/deadline advisory', () => {
  it('surfaces arithmetic risk without story nouns when the raw text appears inconsistent', () => {
    expect(detectSourceCountdownRisk('', '现在上午十点，三天后上午十点截止，剩余七十二小时。')).toBeNull();
    expect(detectSourceCountdownRisk('', '现在晚上八点，三天后上午十点截止，剩余七十二小时。')).toContain('风险');
  });

  it('does not guess when identity/arithmetic anchors are incomplete', () => {
    expect(detectSourceCountdownRisk('', '三天后上午十点截止；另一个流程每次延后一小时。')).toBeNull();
    expect(detectSourceCountdownRisk('三年前发生过事故。', '三天后截止。')).toBeNull();
  });

  it('is explicitly advisory because raw text has no stable fact identity', () => {
    const source = detectSourceCountdownRisk.toString();
    expect(source).not.toMatch(/爆破|起爆|进门|回拨|扣名/);
  });
});
