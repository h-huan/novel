import { it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { Migrator } from '../database/migrator';
import { ProjectService } from '../modules/project/project.service';
import { ProjectRepository } from '../database/repositories/project.repository';
import { GenerationMetricsService } from '../modules/generation-metrics/generation-metrics.service';
import { RealLLMService } from '../chain/real-llm.service';
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
        ['platform','tone','style','genre','pov','context','logic','completeness','prose'].map(k => [k, { score: 90, reason: '满足已确认约束', evidence: ['角色'] }])) }) : '角色', model: 'fixture', latency: 1 };
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

it('inherits the constitution and stores evidence-based scores through five writing stages', async()=>{
 const db=new DatabaseSync(':memory:');
 try {
  await new Migrator(db).runMigrations();
  const database={getDb:()=>db} as any;
  const project=new ProjectService(new ProjectRepository(database)).create({title:'全流程验收',targetPlatform:'fanqie'});
  const metrics=new GenerationMetricsService(database);
  const service=new RealLLMService({} as any,metrics);
  (service as any).generateInternal=vi.fn(async(r:any)=>{
   if(r.scenario==='review') return {content:JSON.stringify({dimensions:Object.fromEntries(['platform','category','tone','style','genre','pov','context','logic','completeness','prose'].map(k=>[k,{score:90,reason:'验收固定证据',evidence:['钟楼']}]))})};
   expect(r.systemPrompt).toContain('fanqie');
   return {content:'钟楼',model:'fixture'};
  });
  for(const scenario of ['world_building','character_design','outline','writing','refinement']) await service.generate({prompt:'钟楼',scenario,metrics:{projectId:project.id}});
  const reports=metrics.queryContentReports({projectId:project.id});
  expect(reports.items.map(r=>r.stage).sort()).toEqual(['chapter','character','outline','refinement','world']);
  expect(reports.items.every(r=>r.score && r.current)).toBe(true);
  expect((metrics.getRuns(project.id) as any[]).every(r=>r.gate_status==='passed')).toBe(true);
 } finally {db.close()}
});
