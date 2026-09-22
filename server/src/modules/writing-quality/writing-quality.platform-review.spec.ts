import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { readConstitution } from '../project/creative-constitution';
import { WritingQualityService } from './writing-quality.service';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

// 质检侧平台标准断点：deterministicPlatformReview 原先只在生成侧 Gate 使用，质检从不产出
// platform.* 问题，作者看到「生成时说平台不合格、质检里却一条平台问题都没有」。
// 这里锁定质检侧必须与生成侧同口径，且任何内部失败都不得阻断质检主流程。
describe('WritingQualityService.buildPlatformReview（质检侧平台标准）', () => {
  const db = new DatabaseSync(':memory:');
  const service: any = new WritingQualityService({ getDb: () => db } as any);
  // 弱钩子 + 低对话 + 长段落的番茄长篇反面样本（与生成侧 Gate 用的是同一份内容形态）
  const weakContent = `第1章 作者栏写着我的名字\n清晨，他慢慢收拾行李。${'平静的景色铺展开来。'.repeat(90)}\n事情结束了。`;

  it('项目未配置创作宪法时返回空，绝不凭空报平台问题', () => {
    expect(service.buildPlatformReview('p1', weakContent, { project: {} }, 'run-1'))
      .toEqual({ rows: [], measurements: null });
  });

  it('番茄长篇：篇幅/对话占比/开篇钩子等短板会被质检侧判为 platform_* 问题', () => {
    const context = {
      project: { creativeConstitution: readConstitution({ type: 'long_novel', target_platform: 'fanqie' }) },
    };
    const { rows, measurements } = service.buildPlatformReview('p1', weakContent, context, 'run-1');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row: any) => row.issueType.startsWith('platform_'))).toBe(true);
    expect(rows.map((row: any) => row.issueType)).toContain('platform_dialogue_ratio');
    expect(rows.map((row: any) => row.issueType)).toContain('platform_chapter_length');
    // 度量与问题必须来自同一份 measureAgainstTarget 结果，而不是「有结论没有数字」
    expect(measurements?.metrics.dialogueRatio).toBeLessThan(0.35);
  });

  it('平台评审内部异常只降级为「本次没有平台问题」，不抛出、不阻断质检主流程', () => {
    const throwing = new Proxy({}, { get() { throw new Error('constitution boom'); } });
    const warn = vi.spyOn(service.logger, 'warn').mockImplementation(() => undefined);
    expect(service.buildPlatformReview('p1', weakContent, { project: { creativeConstitution: throwing } }, 'run-1'))
      .toEqual({ rows: [], measurements: null });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('首行章节标题不再被误报为「段落句末缺标点」', () => {
    expect(service.detectPunctuation('第1章 作者栏写着我的名字')).toEqual([]);
    const withBody = service.detectPunctuation('第1章 作者栏写着我的名字\n他走进房间');
    expect(withBody.some((issue: any) => String(issue.summary).includes('缺标点'))).toBe(true);
  });
});
