import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { readConstitution } from '../project/creative-constitution';
import { WritingQualityService } from './writing-quality.service';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

// 质检侧平台标准断点：deterministicPlatformReview 原先只在生成侧 Gate 使用，质检从不产出
// platform.* 问题，作者看到「生成时说平台不合格、质检里却一条平台问题都没有」。
// 这里锁定质检侧必须与生成侧同口径；无法执行平台评审时必须显式未评估。
describe('WritingQualityService.buildPlatformReview（质检侧平台标准）', () => {
  const db = new DatabaseSync(':memory:');
  const service: any = new WritingQualityService({ getDb: () => db } as any);
  // 弱钩子 + 低对话 + 长段落的番茄长篇反面样本（与生成侧 Gate 用的是同一份内容形态）
  const weakContent = `第1章 作者栏写着我的名字\n清晨，他慢慢收拾行李。${'平静的景色铺展开来。'.repeat(90)}\n事情结束了。`;

  it('项目未配置创作宪法时阻断本次质检，不能以空问题集合冒充平台通过', () => {
    expect(() => service.buildPlatformReview('p1', weakContent, { project: {} }, 'run-1'))
      .toThrow(/项目执行标准不可用/);
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

  it('平台评审内部异常原样暴露，不静默降级为空问题集合', () => {
    const throwing = new Proxy({}, { get() { throw new Error('constitution boom'); } });
    expect(() => service.buildPlatformReview('p1', weakContent, { project: { creativeConstitution: throwing } }, 'run-1'))
      .toThrow('constitution boom');
  });

  it('blocking 问题计入高危，章节不能因综合分高而显示合格', () => {
    const counts = service.calcIssueCounts([{ status: 'open', severity: 'blocking' }]);
    expect(counts).toMatchObject({ total: 1, open: 1, high: 1 });
  });

  it('生成 Gate 的硬红线进入质检时仍是阻断问题，证据必须来自正文', () => {
    const content = '他停在门边。\n她问：“你还记得吗？”';
    const issues = service.buildHardlineIssues(content, [{
      ruleId: '35', message: '标点单一', position: '第 1 段',
      snippet: '这是不在正文里的计数摘要', paragraphs: ['他停在门边。'],
    }]);
    expect(issues).toMatchObject([{ issueType: 'ai_pattern_risk', severity: 'blocking', evidence: '他停在门边。' }]);
    expect(service.calcIssueCounts(issues.map((issue: any) => ({ ...issue, status: 'open' }))).high).toBe(1);
  });

  it('复检空输出或伪布尔值不能通过', async () => {
    const issue = { title: '硬红线', issue_type: 'ai_pattern_risk' };
    service.realLLM = { generate: async () => ({ content: '' }) };
    await expect(service.callRecheckLLM(issue, '修订后的原文', '修订后的原文'))
      .rejects.toThrow(/复检未评估/);
    service.realLLM = { generate: async () => ({
      content: '{"pass":"false","level":"pass","remainingIssues":0,"newIssues":0,"summary":"已修复"}',
    }) };
    await expect(service.callRecheckLLM(issue, '修订后的原文', '修订后的原文'))
      .rejects.toThrow(/复检未评估/);
  });

  it('应用局部精修只标待复检，不能提前关闭原问题', () => {
    db.exec('CREATE TABLE IF NOT EXISTS chapters (id TEXT PRIMARY KEY, content TEXT, word_count INTEGER, status TEXT, auto_quality_status TEXT, auto_quality_message TEXT, auto_quality_at TEXT, updated_at TEXT)');
    db.exec('CREATE TABLE IF NOT EXISTS writing_revision_records (id TEXT PRIMARY KEY, project_id TEXT, chapter_id TEXT, issue_id TEXT, before_text TEXT, after_text TEXT, applied INTEGER, applied_at TEXT, updated_at TEXT)');
    db.exec('CREATE TABLE IF NOT EXISTS writing_quality_issues (id TEXT PRIMARY KEY, status TEXT, status_history_json TEXT, latest_revision_id TEXT, resolved_at TEXT, resolved_by TEXT, updated_at TEXT)');
    db.prepare('INSERT INTO chapters (id, content, word_count, status, auto_quality_status) VALUES (?, ?, ?, ?, ?)')
      .run('chapter-recheck', '旧句。', 3, 'draft', 'ok');
    db.prepare('INSERT INTO writing_revision_records (id, project_id, chapter_id, issue_id, before_text, after_text, applied) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('revision-recheck', 'project-recheck', 'chapter-recheck', 'issue-recheck', '旧句。', '新句。', 0);
    db.prepare('INSERT INTO writing_quality_issues (id, status, status_history_json) VALUES (?, ?, ?)')
      .run('issue-recheck', 'open', '[]');
    service.applyRevision('project-recheck', 'revision-recheck');
    expect(db.prepare('SELECT content, auto_quality_status FROM chapters WHERE id = ?').get('chapter-recheck'))
      .toMatchObject({ content: '新句。', auto_quality_status: 'needs_rewrite' });
    expect(db.prepare('SELECT status, resolved_at FROM writing_quality_issues WHERE id = ?').get('issue-recheck'))
      .toMatchObject({ status: 'refined', resolved_at: null });
  });

  it('首行章节标题不再被误报为「段落句末缺标点」', () => {
    expect(service.detectPunctuation('第1章 作者栏写着我的名字')).toEqual([]);
    const withBody = service.detectPunctuation('第1章 作者栏写着我的名字\n他走进房间');
    expect(withBody.some((issue: any) => String(issue.summary).includes('缺标点'))).toBe(true);
  });
});
