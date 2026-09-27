import { describe, expect, it } from 'vitest';
import { detectSourceCountdownConflict } from './source-countdown-consistency';

describe('source countdown preflight', () => {
  it('blocks a 72-hour countdown started two days ago against an explosion three days from now', () => {
    expect(detectSourceCountdownConflict(
      '④ 两天前——开发方下达定向爆破令，72小时倒计时启动。',
      '本章收尾：三天后上午十点起爆。',
    )).toContain('只剩 24 小时');
  });

  it('accepts equivalent remaining time and ignores unrelated history', () => {
    expect(detectSourceCountdownConflict('现在——定向爆破令下达，72小时倒计时启动。', '三天后起爆。')).toBeNull();
    expect(detectSourceCountdownConflict('三年前林川失踪。定向爆破在三天后。', '三天后起爆。')).toBeNull();
  });

  it('blocks an exact hour count beside a calendar deadline when the outline has no current time', () => {
    expect(detectSourceCountdownConflict('',
      '郑虎把起爆时间钉死在三天后上午十点。收工后的夜里再进门，倒计时被钉死成七十二小时。',
    )).toContain('未锚定');
  });

  it('checks an anchored calendar deadline and ignores the unrelated one-hour door rule', () => {
    expect(detectSourceCountdownConflict('', '现在上午十点，三天后上午十点起爆，剩余七十二小时。')).toBeNull();
    expect(detectSourceCountdownConflict('', '现在晚上八点，三天后上午十点起爆，剩余七十二小时。')).toContain('矛盾');
    expect(detectSourceCountdownConflict('', '三天后上午十点起爆；门内时间每次回拨一小时。')).toBeNull();
  });
});
