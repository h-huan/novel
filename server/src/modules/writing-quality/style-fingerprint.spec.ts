import { describe, expect, it } from 'vitest';
import { styleFingerprint } from './style-fingerprint';

describe('styleFingerprint v2', () => {
  it('uses literal evidence for cross-paragraph and cross-chapter patterns', () => {
    const repeated = '他推开生锈的铁门看见台阶尽头仍亮着一盏灯';
    const content = [
      `然而，${repeated}，屋里没有人回应。`,
      `然而，他沿着墙根往前走，鞋底碾碎了一片玻璃。`,
      `然而，他刚摸到门把手，楼上的脚步声忽然停了。`,
      '他没有抬头，只把钥匙攥进掌心，继续数着每一级台阶。',
    ].join('\n\n').repeat(3);
    const result = styleFingerprint({ projectId: 'p', runId: 'r', content, characterNames: [],
      previousChapters: [{ id: 'c0', content: `昨夜，${repeated}，随后钟声响了。另一处${repeated}` }] });
    expect(result.version).toBe(2);
    expect(result.issues.map(issue => issue.ruleId)).toContain('style.cross_paragraph_transition');
    expect(result.issues.every(issue => issue.evidence.verified)).toBe(true);
  });

  it('does not compare character voices without enough attributed dialogue', () => {
    const content = `甲说：“我们走吧。”\n乙说：“好。”\n${'走廊里只有雨水敲打窗台的声音。'.repeat(30)}`;
    const result = styleFingerprint({ projectId: 'p', runId: 'r', content,
      characterNames: ['甲', '乙'], previousChapters: [] });
    expect(result.coverage.attributedVoiceProfiles).toBe(0);
    expect(result.issues.some(issue => issue.ruleId === 'style.character_voice_profile')).toBe(false);
  });
});
