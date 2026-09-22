import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WritingQualityService, QUALITY_RUN_LEASE_MS } from './writing-quality.service';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

// 用户点名的「上面显示自动质检在跑、下面的还能点提交质检」：同一章任一质检在跑时，
// 第二条质检必须在服务端就被拒绝，而不是只靠前端按钮的临时状态。
// 规则作用于所有小说、所有章节、所有入口（AI 生成后的自动质检 / 提交质检 / 重新质检）。
describe('WritingQualityService 并发质检闸门', () => {
  let db: InstanceType<typeof DatabaseSync>;
  let service: any;
  const CHAPTER = 'ch-1';

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE chapters (
        id TEXT PRIMARY KEY,
        auto_quality_status TEXT,
        auto_quality_message TEXT,
        auto_quality_at TEXT,
        updated_at TEXT
      );
    `);
    db.prepare('INSERT INTO chapters (id) VALUES (?)').run(CHAPTER);
    service = new WritingQualityService({ getDb: () => db } as any);
  });

  const readRow = () => db.prepare(
    'SELECT auto_quality_status, auto_quality_message, auto_quality_at FROM chapters WHERE id = ?',
  ).get(CHAPTER) as any;
  const markRunning = (message: string, at: string) => db.prepare(
    'UPDATE chapters SET auto_quality_status = ?, auto_quality_message = ?, auto_quality_at = ? WHERE id = ?',
  ).run('running', message, at, CHAPTER);

  it('无质检在跑时放行，并把章节标记为 running（前端顶栏与按钮据此统一禁用）', () => {
    service.claimQualityRun(CHAPTER);
    expect(readRow().auto_quality_status).toBe('running');
    expect(readRow().auto_quality_message).toBe('正在质检…');
  });

  it('同一章已有质检在跑时拒绝第二次，且不覆盖进行中的状态', () => {
    markRunning('正在自动质检…', new Date().toISOString());
    expect(() => service.claimQualityRun(CHAPTER)).toThrowError(/正在质检中/);
    expect(readRow().auto_quality_message).toBe('正在自动质检…');
  });

  it('running 超过租约上限视为陈旧，允许重新发起（进程被杀不会永久锁死章节）', () => {
    const stale = new Date(Date.now() - QUALITY_RUN_LEASE_MS - 60_000).toISOString();
    markRunning('正在自动质检…', stale);
    expect(() => service.claimQualityRun(CHAPTER)).not.toThrow();
    expect(readRow().auto_quality_status).toBe('running');
  });

  it('质检失败释放租约：running 落到 failed 并带上原因，按钮才能重新可点', () => {
    service.claimQualityRun(CHAPTER);
    service.releaseQualityRun(CHAPTER, new Error('模型返回空内容'));
    const row = readRow();
    expect(row.auto_quality_status).toBe('failed');
    expect(row.auto_quality_message).toContain('模型返回空内容');
    expect(row.auto_quality_message).toContain('重新质检');
  });

  it('analyzeChapterQuality 默认抢占租约：本章在跑时直接抛错，且不启动第二条分析', async () => {
    markRunning('正在自动质检…', new Date().toISOString());
    const run = vi.fn();
    service.runChapterQualityAnalysis = run;
    await expect(service.analyzeChapterQuality('p1', { chapterId: CHAPTER })).rejects.toThrowError(/正在质检中/);
    expect(run).not.toHaveBeenCalled();
  });

  it('AI 生成后自动质检（生成侧已标记 running）用 leaseAlreadyHeld 跳过重复抢占', async () => {
    markRunning('正在自动质检…', new Date().toISOString());
    const claim = vi.spyOn(service, 'claimQualityRun');
    service.runChapterQualityAnalysis = vi.fn(async () => ({ ok: true }));
    await expect(service.analyzeChapterQuality('p1', { chapterId: CHAPTER }, { leaseAlreadyHeld: true }))
      .resolves.toEqual({ ok: true });
    expect(claim).not.toHaveBeenCalled();
  });

  it('分析抛错时释放租约，不把章节永久留在 running', async () => {
    service.runChapterQualityAnalysis = vi.fn(async () => { throw new Error('LLM 超时'); });
    await expect(service.analyzeChapterQuality('p1', { chapterId: CHAPTER })).rejects.toThrowError('LLM 超时');
    expect(readRow().auto_quality_status).toBe('failed');
  });

  // 进程被杀（而不是抛错）时没有任何代码回写终态，启动清理是唯一救回路径，
  // 否则顶栏会永久显示「正在质检」、提交质检按钮永久点不了。
  it('启动清理：上一进程残留的 running 重置为 failed，已结束的章节不被动', () => {
    db.prepare('INSERT INTO chapters (id, auto_quality_status, auto_quality_message, auto_quality_at) VALUES (?,?,?,?)')
      .run('ch-done', 'ok', '质检完成', new Date().toISOString());
    markRunning('正在自动质检…', new Date().toISOString());
    const warn = vi.spyOn(service.logger, 'warn').mockImplementation(() => undefined);
    service.onModuleInit();
    const interrupted = readRow();
    expect(interrupted.auto_quality_status).toBe('failed');
    expect(interrupted.auto_quality_message).toContain('重启中断');
    const done = db.prepare('SELECT auto_quality_status, auto_quality_message FROM chapters WHERE id=?')
      .get('ch-done') as any;
    expect(done).toEqual({ auto_quality_status: 'ok', auto_quality_message: '质检完成' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('启动清理'));
    warn.mockRestore();
  });
});
