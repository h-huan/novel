import { describe, expect, it } from 'vitest';
import { styleFingerprint } from './style-fingerprint';

describe('styleFingerprint v3', () => {
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
    expect(result.version).toBe(3);
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

  it('does not flag an ordinary mostly-narration chapter when only two functions exist', () => {
    const steady = '他沿着走廊往前走，脚步声在空屋里一下一下地响着。';
    const content = [`甲说：“你先别出声，听见走廊那头有人过来没有。”`, ...Array.from({ length: 10 }, () => steady)].join('\n\n');
    const result = styleFingerprint({ projectId: 'p', runId: 'r', content,
      characterNames: ['甲'], previousChapters: [] });
    expect(result.issues.some(issue => issue.ruleId === 'ai_trace.paragraph_function_homology_risk')).toBe(false);
  });

  it('still flags a long uninterrupted run of the same paragraph function', () => {
    const steady = '他沿着走廊往前走，脚步声在空屋里一下一下地响着。';
    const content = [`甲说：“你先别出声，听见走廊那头有人过来没有。”`, '他忽然停下脚步，手按在门框上，没有再说一句话。',
      ...Array.from({ length: 8 }, () => steady)].join('\n\n');
    const result = styleFingerprint({ projectId: 'p', runId: 'r', content,
      characterNames: ['甲'], previousChapters: [] });
    expect(result.issues.some(issue => issue.ruleId === 'ai_trace.paragraph_function_homology_risk')).toBe(true);
  });

  it('flags particle overuse, fragmented sentence/paragraph rhythm, and dialogue echo as advisories', () => {
    const withParticles = '她把钥匙放进了抽屉，又把本子合上了。';
    const particleText = Array.from({ length: 60 }, () => withParticles).join('\n\n');
    const particleResult = styleFingerprint({ projectId: 'p', runId: 'r', content: particleText,
      characterNames: [], previousChapters: [] });
    expect(particleResult.issues.some(issue => issue.ruleId === 'ai_trace.particle_overuse')).toBe(true);

    const fragmented = [
      ...Array.from({ length: 20 }, () => '她走了。'),
      ...Array.from({ length: 40 }, () => '她沿着走廊往前走，脚步声在空屋里一下一下地响着。'),
    ].join('\n\n');
    const fragmentedResult = styleFingerprint({ projectId: 'p', runId: 'r', content: fragmented,
      characterNames: [], previousChapters: [] });
    expect(fragmentedResult.issues.some(issue => issue.ruleId === 'ai_trace.short_sentence_ratio')).toBe(true);

    const singleSentence = [
      ...Array.from({ length: 30 }, (_, index) => `她走到第${index + 1}个门口停了一下。`),
      ...Array.from({ length: 20 }, () => '她沿着走廊往前走，脚步声在空屋里一下一下地响着，灯在头顶轻轻晃。'),
    ].join('\n\n');
    const singleResult = styleFingerprint({ projectId: 'p', runId: 'r', content: singleSentence,
      characterNames: [], previousChapters: [] });
    expect(singleResult.issues.some(issue => issue.ruleId === 'ai_trace.one_sentence_paragraph_ratio')).toBe(true);

    const echo = '“师傅今晚不在。”\n\n“师傅今晚不在？”我问。';
    const echoResult = styleFingerprint({ projectId: 'p', runId: 'r', content: echo,
      characterNames: [], previousChapters: [] });
    expect(echoResult.issues.some(issue => issue.ruleId === 'ai_trace.dialogue_echo')).toBe(true);

    const leEnd = Array.from({ length: 150 }, () => '她把门关上了。').join('\n\n');
    const leResult = styleFingerprint({ projectId: 'p', runId: 'r', content: leEnd,
      characterNames: [], previousChapters: [] });
    expect(leResult.issues.some(issue => issue.ruleId === 'ai_trace.le_sentence_end_overuse')).toBe(true);

    const contrast = '不是风，是脚步。不是冷，是怕。不是意外，是人为。她没抬头，也没出声。他不问，也不走。她不哭，也不笑。';
    const contrastResult = styleFingerprint({ projectId: 'p', runId: 'r', content: contrast,
      characterNames: [], previousChapters: [] });
    expect(contrastResult.issues.some(issue => issue.ruleId === 'ai_trace.parallel_contrast')).toBe(true);
  });

  it.each([
    ['ai_trace.zhe_density', '她站着看着手里的东西。'.repeat(120)],
    ['ai_trace.ba_density', '她把门关上了。'.repeat(150)],
    ['ai_trace.soft_adverb_density', '她慢慢往前走，轻轻看了一眼。'.repeat(80)],
    ['ai_trace.glance_repetition', Array.from({ length: 4 }, () => '他看了我一眼。').join('\n\n')],
    ['ai_trace.no_verb_start', Array.from({ length: 4 }, () => '我没说话。').join('\n\n')],
    ['ai_trace.speech_tag_repetition', '他说：“走。”'.repeat(150)],
    ['ai_trace.time_scaffold_density', '过了一会儿，他走了。'.repeat(120)],
    ['ai_trace.simile_density', '声音像风。'.repeat(220)],
    ['ai_trace.one_one_parallel', '一页一页地翻。'.repeat(12)],
    ['ai_trace.cliche_emotion', '他心里一沉。他心里一沉。'],
  ])('flags %s as an advisory prose-rhythm risk', (ruleId, content) => {
    const result = styleFingerprint({ projectId: 'p', runId: 'r', content,
      characterNames: [], previousChapters: [] });
    expect(result.issues.some(issue => issue.ruleId === ruleId)).toBe(true);
  });
});
