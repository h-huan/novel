import { it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { Migrator } from '../database/migrator';
import { ProjectService } from '../modules/project/project.service';
import { ProjectRepository } from '../database/repositories/project.repository';
import { GenerationMetricsService } from '../modules/generation-metrics/generation-metrics.service';
import { RealLLMService } from '../chain/real-llm.service';
import { SCORE_DIMENSIONS } from '../modules/writing-quality/stage-score';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
it('records success, provider failure, stream cancellation and constitution snapshots', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await new Migrator(db).runMigrations();
    const database = { getDb: () => db } as any;
    const project = new ProjectService(new ProjectRepository(database)).create({ title: 'run', targetPlatform: 'fanqie' });
    const metrics = new GenerationMetricsService(database);
    const service = new RealLLMService({} as any, metrics);
    const request = { prompt: '写角色', scenario: 'character_design', metrics: { projectId: project.id, stepKey: 'custom_step' } };
    (service as any).generateInternal = vi.fn(async (r: any) => {
      if (r.scenario !== 'review') expect(r.systemPrompt).toContain('fanqie');
      return { content: r.scenario === 'review' ? JSON.stringify({ dimensions: Object.fromEntries(
        SCORE_DIMENSIONS.map(k => [k, { score: 90, reason: '满足已确认约束', evidence: ['角色'] }])) }) : '角色', model: 'fixture', latency: 1 };
    });
    await service.generate(request);
    (service as any).generateInternal = vi.fn(async () => { throw new Error('provider failed'); });
    await expect(service.generate(request)).rejects.toThrow('provider failed');
    (service as any).generateStreamInternal = async function* () { yield '一'; yield '二'; };
    const stream = service.generateStream({ ...request, scenario: 'idea_generate' });
    await stream.next(); await stream.return(undefined);
    const runs = metrics.getRuns(project.id) as any[];
    expect(runs.map(r => r.status).sort()).toEqual(['cancelled', 'failed', 'success']);
    expect(runs.every(r => r.constitution_revision === 1 && r.finished_at && r.context_version.length === 64)).toBe(true);
    expect(runs.find(r => r.status === 'success').gate_status).toBe('passed');
  } finally { db.close(); }
});

it('closes persisted running rows when a restarted service boots', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await new Migrator(db).runMigrations();
    const database = { getDb: () => db } as any;
    const metrics = new GenerationMetricsService(database);
    const interrupted = metrics.beginRun(undefined, 'daily', 'unfinished internal task');

    const restarted = new GenerationMetricsService(database);
    restarted.onModuleInit();

    const row = db.prepare('SELECT status,finished_at,error FROM generation_runs WHERE id=?')
      .get(interrupted.id) as any;
    expect(row.status).toBe('cancelled');
    expect(row.finished_at).toBeTruthy();
    expect(row.error).toContain('服务重启前生成未正常结束');
    expect(restarted.recoverInterruptedRuns()).toBe(0);
  } finally { db.close(); }
});

it('inherits the constitution and stores evidence-based scores through five writing stages', async()=>{
 const db=new DatabaseSync(':memory:');
 try {
  await new Migrator(db).runMigrations();
  const database={getDb:()=>db} as any;
  const project=new ProjectService(new ProjectRepository(database)).create({title:'全流程验收',targetPlatform:'fanqie'});
  const metrics=new GenerationMetricsService(database);
  const service=new RealLLMService({} as any,metrics);
  const chapterContent = Array.from({ length: 70 }, (_, index) => index % 2
    ? `“钟楼突然响了！我们必须立刻穿过广场找到钥匙，否则城门关闭后所有人都会被困在这里！”`
    : `钟楼突然响了！林岚冲过广场，推开挡路的木箱，拿到钥匙后继续奔向正在关闭的城门。`).join('\n') + '\n门后站着的人究竟是谁？';
  (service as any).generateInternal=vi.fn(async(r:any)=>{
   if(r.scenario==='review') return {content:JSON.stringify({dimensions:Object.fromEntries(SCORE_DIMENSIONS.map(k=>[k,{score:90,reason:'验收固定证据',evidence:['钟楼']}]))})};
   expect(r.systemPrompt).toContain('fanqie');
   return {content:['writing','refinement'].includes(r.scenario) ? chapterContent : '钟楼',model:'fixture'};
  });
  for(const scenario of ['world_building','character_design','outline','writing','refinement']) await service.generate({prompt:'钟楼',scenario,metrics:{projectId:project.id}});
  const reports=metrics.queryContentReports({projectId:project.id});
  expect(reports.items.map(r=>r.stage).sort()).toEqual(['chapter','character','outline','refinement','world']);
  expect(reports.items.every(r=>r.score && r.current)).toBe(true);
  expect((metrics.getRuns(project.id) as any[]).every(r=>r.gate_status==='passed')).toBe(true);
 } finally {db.close()}
});
