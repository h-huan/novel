import { describe, it, expect } from 'vitest';
import {
  getPlatform, targetForLength, measureAgainstTarget, benchmarkRefineIssues,
  buildBenchmarkDirective, buildBenchmarkRefinePrompt, refineKeepsStory,
} from './platform-benchmarks';

describe('platform-benchmarks 平台画像', () => {
  it('每个平台都有完整画像字段（无 undefined 占位）', () => {
    for (const id of ['fanqie', 'qimao', 'qidian', 'zhihu', 'jinjiang', 'douyin', 'xiaohongshu', 'rules_horror']) {
      const p = getPlatform(id);
      expect(p.id).toBe(id);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.guide.length).toBeGreaterThan(0);
      expect(p.audience.core.length).toBeGreaterThan(0);
      expect(p.audience.age.length).toBeGreaterThan(0);
      expect(p.audience.gender.length).toBeGreaterThan(0);
      expect(p.audience.scene.length).toBeGreaterThan(0);
      expect(p.audience.patience.length).toBeGreaterThan(0);
      expect(p.distribution.note.length).toBeGreaterThan(0);
      expect(p.original.length).toBeGreaterThan(0);
      for (const t of [p.short, p.long]) {
        expect(t.dialogueRatio[0]).toBeGreaterThanOrEqual(0);
        expect(t.dialogueRatio[1]).toBeGreaterThan(t.dialogueRatio[0]);
        expect(t.avgParaCharsMax).toBeGreaterThan(0);
        expect(t.chapterWords[1]).toBeGreaterThan(t.chapterWords[0]);
      }
    }
  });

  it('番茄短篇目标：高对话、段落短', () => {
    const t = targetForLength(getPlatform('fanqie'), 'short_story');
    expect(t.dialogueRatio[0]).toBeGreaterThanOrEqual(0.3);
    expect(t.avgParaCharsMax).toBeLessThanOrEqual(60);
    expect(t.chapterWords[0]).toBeGreaterThanOrEqual(1500);
  });

  it('知乎盐选比番茄允许更低对话、更厚段落（平台分化，不能一刀切）', () => {
    const zhihu = targetForLength(getPlatform('zhihu'), 'short_story');
    const fanqie = targetForLength(getPlatform('fanqie'), 'short_story');
    expect(zhihu.dialogueRatio[0]).toBeLessThan(fanqie.dialogueRatio[0]);
    expect(zhihu.avgParaCharsMax).toBeGreaterThan(fanqie.avgParaCharsMax);
  });

  it('measureAgainstTarget 能算出对话占比等指标', () => {
    const t = targetForLength(getPlatform('fanqie'), 'short_story');
    const text = '他说：“你好。”她回答：“好什么好。”'.repeat(20) + '叙述部分。'.repeat(40);
    const m = measureAgainstTarget(text, t);
    expect(m.metrics.dialogueRatio).toBeGreaterThan(0);
    expect(Array.isArray(m.rows)).toBe(true);
    expect(m.rows.some(r => r.key === 'dialogueRatio')).toBe(true);
  });

  it('benchmarkRefineIssues 在对话不足时给出对话短板', () => {
    const t = targetForLength(getPlatform('fanqie'), 'short_story');
    // 几乎无对话、单段很厚的叙述
    const prose = '他沿着街道慢慢往前走观察着周围的店铺和行人心裏盘算着接下来要做的每一件事情不敢有丝毫松懈'.repeat(12);
    const { metrics, rows } = measureAgainstTarget(prose, t);
    const issues = benchmarkRefineIssues(t, metrics, rows);
    expect(issues.some(i => /对话/.test(i.label))).toBe(true);
  });

  it('buildBenchmarkDirective 返回含平台名与行文底线的指令字符串', () => {
    const fanqie = getPlatform('fanqie');
    const directive = buildBenchmarkDirective('fanqie', 'short_story');
    expect(typeof directive).toBe('string');
    expect(directive).toContain(fanqie.label);
    expect(directive).toContain('残句链');
  });

  it('精修 prompt 必须携带上一版原文、本章契约与人物白名单（历史事故：真空精修把都市文覆盖成另一部小说）', () => {
    const fanqie = getPlatform('fanqie');
    const issues = [{
      key: 'dialogueRatio', label: '对话占比', value: '8%', target: '35%–65%',
      status: 'bad' as const, advice: '对话偏少',
    }];
    const prompt = buildBenchmarkRefinePrompt({
      platformLabel: fanqie.label,
      storyType: 'short_story',
      issues,
      round: 1,
      maxRound: 2,
      previousContent: '林薇攥着离婚协议走进辰风科技，陆沉抬眼看她。陈峰在电话那头冷笑。',
      outlineContract: '本章：林薇到民政局离婚，随后入职辰风科技与陆沉重逢',
      storyAnchors: {
        bookTitle: '离婚后她闪婚了顶头上司',
        chapterTitle: '第一章 离婚当天',
        person: '第三人称',
        characterNames: ['林薇', '陆沉', '陈峰'],
        tagText: '番茄小说；爽文、女强',
      },
      lessons: '1) 避免连续三排比',
    });
    expect(prompt).toContain('唯一底本');
    expect(prompt).toContain('林薇攥着离婚协议');
    expect(prompt).toContain('民政局');
    expect(prompt).toContain('林薇');
    expect(prompt).toContain('陆沉');
    expect(prompt).toContain('番茄小说；爽文、女强');
    expect(prompt).toContain('避免连续三排比');
  });

  it('精修缺少上一版原文时直接抛错，禁止在真空中重写正文', () => {
    expect(() => buildBenchmarkRefinePrompt({
      platformLabel: '番茄小说', storyType: 'short_story', issues: [], round: 1, maxRound: 2,
      previousContent: '',
    } as any)).toThrow(/原文/);
  });

  it('refineKeepsStory：新稿丢失全部本书人物时判定换故事并拦截', () => {
    const prev = '林薇走进辰风科技，陆沉正在开会，陈峰打来电话。林薇没有接。'.repeat(3);
    const next = '林青禾推开米铺的木门，老常蹲在门槛上抽旱烟，梁丰年背着药篓从后山下来。'.repeat(4);
    const r = refineKeepsStory(prev, next, ['林薇', '陆沉', '陈峰']);
    expect(r.ok).toBe(false);
    expect(r.reason || '').toContain('人物');
  });

  it('refineKeepsStory：篇幅异常缩水拦截，同篇幅正常改写放行', () => {
    const names = ['林薇', '陆沉'];
    const prev = '林薇看着陆沉，陆沉也看着林薇，两个人都没有先开口。'.repeat(10);
    const shrunk = '林薇看着陆沉。';
    expect(refineKeepsStory(prev, shrunk, names).ok).toBe(false);
    const kept = '林薇看着陆沉，陆沉也看着林薇，两个人都没有先开口，办公室里静得能听见呼吸。'.repeat(10);
    expect(refineKeepsStory(prev, kept, names).ok).toBe(true);
  });
});
