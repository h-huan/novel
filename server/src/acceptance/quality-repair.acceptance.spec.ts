import { it, expect, vi } from 'vitest';
import { STANDARD_PRECONDITIONS } from './test-standards';
import { createRequire } from 'node:module';
import { Migrator } from '../database/migrator';
import { ProjectService } from '../modules/project/project.service';
import { ProjectRepository } from '../database/repositories/project.repository';
import { GenerationMetricsService } from '../modules/generation-metrics/generation-metrics.service';
import { RealLLMService } from '../chain/real-llm.service';
import { SCORE_DIMENSIONS } from '../modules/writing-quality/stage-score';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const original = '小镇中央的钟楼挂着红色旗帜。居民每天清晨开门，傍晚收摊。守夜人按照既定规矩检查城门，不得擅自离开岗位。';

for (const regression of [false, true]) it(`repairs, rechecks, compares and ${regression ? 'rolls back without learning' : 'accepts and learns only verified improvements'}`, async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await new Migrator(db).runMigrations();
    const database = { getDb: () => db } as any;
    const project = new ProjectService(new ProjectRepository(database)).create({ ...STANDARD_PRECONDITIONS, title: '验收' });
    const metrics = new GenerationMetricsService(database);
    const llm = new RealLLMService({} as any, metrics);
    (llm as any).generateInternal = vi.fn(async (r: any) => {
      if (r.scenario === 'refinement') return { content: JSON.stringify({ patches: [{ original: '红色', replacement: '蓝色' }] }) };
      if (r.scenario === 'review') {
        const current = r.prompt.split('当前生成结果：')[1];
        const fixed = current.includes('蓝色');
        return { content: JSON.stringify({ dimensions: Object.fromEntries(SCORE_DIMENSIONS.map(k => [k, {
          score: k === 'context' && !fixed ? 40 : k === 'logic' && fixed && regression ? 80 : 90,
          reason: fixed ? '与既定资料一致' : '旗帜颜色与既定资料冲突', evidence: [current],
        }])) }) };
      }
      return { content: original, model: 'fixture' };
    });
    const promise = llm.generate({ prompt: '世界观中的旗帜应为蓝色', scenario: 'world_building', metrics: { projectId: project.id } });
    if (regression) await expect(promise).rejects.toThrow('Gate');
    else expect((await promise).content).toContain('蓝色');
    const repair = db.prepare('SELECT * FROM generation_repairs').get();
    expect(repair.status).toBe(regression ? 'rolled_back' : 'accepted');
    expect(repair.before_text).toBe(original);
    const lessons = db.prepare("SELECT * FROM generation_lessons WHERE category='verified_quality_repair'").all();
    expect(lessons.length).toBe(regression ? 0 : 1);
    const strategy = db.prepare('SELECT * FROM repair_strategy_stats').get() as any;
    expect(strategy.attempts).toBe(1);
    expect(strategy.accepted).toBe(regression ? 0 : 1);
    expect(strategy.rollbacks).toBe(regression ? 1 : 0);
    const cockpit = metrics.getCockpit(project.id);
    expect(cockpit.repairs).toHaveLength(1);
    expect((metrics.getRuns(project.id)[0] as any).status).toBe(regression ? 'failed' : 'success');
    if (!regression) expect(metrics.beginRun(project.id, 'outline', '下阶段').lessons).toHaveLength(1);
  } finally { db.close(); }
});

it('blocks stale constitution output even when the evaluator gives high scores', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await new Migrator(db).runMigrations();
    const database = { getDb: () => db } as any;
    const projects = new ProjectService(new ProjectRepository(database));
    const project = projects.create({ ...STANDARD_PRECONDITIONS, title: 'stale' });
    const metrics = new GenerationMetricsService(database);
    const llm = new RealLLMService({} as any, metrics);
    (llm as any).generateInternal = vi.fn(async (r: any) => {
      if (r.scenario === 'review') return { content: JSON.stringify({ dimensions: Object.fromEntries(SCORE_DIMENSIONS.map(k => [k, { score: 99, reason: '满足', evidence: [original] }])) }) };
      projects.update(project.id, { targetPlatform: 'zhihu' });
      return { content: original };
    });
    await expect(llm.generate({ prompt: '世界', scenario: 'world_building', metrics: { projectId: project.id } })).rejects.toThrow('上下文');
    expect((metrics.getRuns(project.id)[0] as any).gate_status).toBe('blocked');
  } finally { db.close(); }
});

it('keeps physical generation runs but updates one artifact report across retries', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await new Migrator(db).runMigrations();
    const database = { getDb: () => db } as any;
    const project = new ProjectService(new ProjectRepository(database)).create({ ...STANDARD_PRECONDITIONS, title: '报告边界' });
    const metrics = new GenerationMetricsService(database);
    const dimensions = Object.fromEntries(SCORE_DIMENSIONS.map(key => [key, {
      score: ['category', 'tone', 'style', 'genre', 'pov', 'prose'].includes(key) ? null : 90,
      status: ['category', 'tone', 'style', 'genre', 'pov', 'prose'].includes(key) ? 'not_applicable' : 'evaluated',
      reason: '有当前证据', evidence: ['证据'],
    }])) as any;
    const score = { stage: 'world' as const, overallScore: 90, coverage: 1, dimensions, issues: [], status: 'evaluated' as const };
    for (const prompt of ['第一次', '第二次']) {
      const run = metrics.beginRun(project.id, 'world_building', prompt);
      metrics.saveRunScore(run.id, project.id, score);
      metrics.finishRun(run.id, 'success', Date.now(), '证据');
    }
    expect((db.prepare('SELECT COUNT(*) n FROM generation_runs').get() as any).n).toBe(2);
    expect((db.prepare("SELECT COUNT(*) n FROM writing_quality_reports WHERE source_type='artifact_quality'").get() as any).n).toBe(1);
  } finally { db.close(); }
});
