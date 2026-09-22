import { it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { Migrator } from '../database/migrator';
import baseline from '../database/migrations/001_initial';
import { CURRENT_SCHEMA_VERSION, reconcileSchema } from '../database/schema-reconciler';
import { ProjectService } from '../modules/project/project.service';
import { ProjectRepository } from '../database/repositories/project.repository';
import {
  CHAPTER_RESPONSIBILITY_REPAIR_STRATEGIES,
  GenerationMetricsService,
  chapterResponsibilityIssueSignature,
} from '../modules/generation-metrics/generation-metrics.service';
import { RealLLMService } from '../chain/real-llm.service';
import { BenchmarkController } from '../chain/benchmark.controller';
import { SCORE_DIMENSIONS } from '../modules/writing-quality/stage-score';
import { qualityIssue } from '../modules/writing-quality/quality-issue';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

function schemaShape(db: any) {
  return db.prepare("SELECT type,name,tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name")
    .all().map((object: any) => {
      const quoted = `"${object.name.replaceAll('"', '""')}"`;
      return {
        ...object,
        columns: object.type === 'table' ? db.prepare(`PRAGMA table_info(${quoted})`).all() : [],
        foreignKeys: object.type === 'table' ? db.prepare(`PRAGMA foreign_key_list(${quoted})`).all() : [],
        indexColumns: object.type === 'index' ? db.prepare(`PRAGMA index_info(${quoted})`).all() : [],
      };
    });
}

it('fresh and baseline/legacy upgrades have schema parity and preserve business data', async () => {
  const fresh=new DatabaseSync(':memory:'); const existing=new DatabaseSync(':memory:'); const legacy=new DatabaseSync(':memory:');
  try {
    await new Migrator(fresh).runMigrations();
    for (const db of [existing,legacy]) {
      baseline.up(db);
      db.exec(`
        DROP INDEX IF EXISTS idx_benchmark_runs_project;
        DROP TABLE IF EXISTS quality_benchmark_runs;
        DROP TABLE IF EXISTS quality_execution_schema;
        ALTER TABLE quality_benchmark_samples DROP COLUMN chapter_index;
      `);
      db.exec("CREATE TABLE _migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,executed_at TEXT NOT NULL DEFAULT(datetime('now'))); INSERT INTO _migrations(id,name) VALUES(1,'initial');");
      new ProjectService(new ProjectRepository({getDb:()=>db} as any)).create({title:'不可丢失的小说'});
      db.prepare(`INSERT INTO quality_benchmark_samples
        (id,project_id,story_type,platform,content,source_ref,annotation_status,human_labels_json,created_at,updated_at)
        VALUES('kept-sample',NULL,'long_novel','fanqie','保留正文','real-source','labeled','["kept"]','now','now')`).run();
    }
    legacy.exec(`
      CREATE TABLE quality_benchmark_runs (
        id TEXT PRIMARY KEY, project_id TEXT, status TEXT NOT NULL,
        repair_requested INTEGER NOT NULL DEFAULT 0, sample_count INTEGER NOT NULL DEFAULT 0,
        completed_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0,
        results_json TEXT NOT NULL DEFAULT '[]', started_at TEXT NOT NULL, finished_at TEXT
      );
      INSERT INTO quality_benchmark_runs(id,status,started_at) VALUES('kept-run','completed','now');
      CREATE TABLE quality_execution_schema(version INTEGER PRIMARY KEY, description TEXT NOT NULL);
      INSERT INTO quality_execution_schema VALUES(2,'old numbered migration');
      INSERT INTO _migrations(id,name) VALUES(2,'quality_execution');
    `);
    for(const db of [existing,legacy]) {
      await new Migrator(db).runMigrations(); await new Migrator(db).runMigrations();
      expect(db.prepare('SELECT title FROM projects').get().title).toBe('不可丢失的小说');
      expect(db.prepare("SELECT content FROM quality_benchmark_samples WHERE id='kept-sample'").get().content).toBe('保留正文');
      expect(db.prepare("SELECT COUNT(*) count FROM quality_benchmark_runs WHERE id='kept-run'").get().count).toBe(db === legacy ? 1 : 0);
      expect(db.prepare('SELECT id,name FROM _migrations ORDER BY id').all()).toEqual([{id:1,name:'initial'}]);
      expect(db.prepare('SELECT version FROM quality_execution_schema WHERE id=1').get().version).toBe(CURRENT_SCHEMA_VERSION);
      expect(reconcileSchema(db).actions).toEqual([]);
      expect(schemaShape(db)).toEqual(schemaShape(fresh));
    }
  } finally { fresh.close();existing.close();legacy.close(); }
});

it('conditions strategy history on all six axes and falls back with insufficient samples', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    await new Migrator(db).runMigrations(); const database={getDb:()=>db} as any;
    const p=new ProjectService(new ProjectRepository(database)).create({title:'策略验收',targetPlatform:'fanqie'});
    const metrics=new GenerationMetricsService(database); const run=metrics.beginRun(p.id,'writing','x');
    db.prepare("UPDATE generation_runs SET model='test-model' WHERE id=?").run(run.id);
    const issue=qualityIssue({projectId:p.id,runId:run.id,stage:'chapter',ruleId:'platform.dialogue_ratio',severity:'high',message:'测试',quote:'原文',content:'原文',source:'test'});
    const blockingLogic=qualityIssue({projectId:p.id,runId:run.id,stage:'outline',ruleId:'constitution.logic',severity:'blocking',message:'人物失去防备',quote:'原文',content:'原文',source:'test'});
    const relatedStructure=qualityIssue({projectId:p.id,runId:run.id,stage:'outline',ruleId:'structure.scene_event_mismatch',severity:'medium',message:'事件缺少场景',quote:'原文',content:'原文',source:'test'});
    expect(metrics.selectRepairStrategy(p.id,[blockingLogic,relatedStructure],run.id)).toBe('scene_structure_patch');
    const row=db.prepare('SELECT prompt_version FROM generation_runs WHERE id=?').get(run.id);
    const insert=db.prepare(`INSERT INTO repair_strategy_stats(id,rule_id,platform,genre,story_type,model,prompt_version,strategy_id,attempts,accepted,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'test')`);
    insert.run('other',issue.ruleId,'qidian','generic','long_novel','test-model',row.prompt_version,'unique_local_replacement',100,100);
    expect(metrics.selectRepairStrategy(p.id,[issue],run.id)).toBe('platform_metric_patch');
    insert.run('same',issue.ruleId,'fanqie','generic','long_novel','test-model',row.prompt_version,'unique_local_replacement',4,4);
    expect(metrics.selectRepairStrategy(p.id,[issue],run.id)).toBe('platform_metric_patch');
    db.exec("UPDATE repair_strategy_stats SET attempts=5,accepted=5 WHERE id='same'");
    expect(metrics.selectRepairStrategy(p.id,[issue],run.id)).toBe('unique_local_replacement');
    for(const field of ['genre','story_type','model','prompt_version']) {
      const original=db.prepare(`SELECT ${field} value FROM repair_strategy_stats WHERE id='same'`).get().value;
      db.prepare(`UPDATE repair_strategy_stats SET ${field}='different' WHERE id='same'`).run();
      expect(metrics.selectRepairStrategy(p.id,[issue],run.id)).toBe('platform_metric_patch');
      db.prepare(`UPDATE repair_strategy_stats SET ${field}=? WHERE id='same'`).run(original);
    }
  } finally { db.close(); }
});

it('promotes the strategy that previously resolved the same chapter-responsibility conflict', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    await new Migrator(db).runMigrations(); const database={getDb:()=>db} as any;
    const projects=new ProjectService(new ProjectRepository(database));
    const first=projects.create({title:'第一次修复',type:'short_story',targetPlatform:'fanqie'});
    const metrics=new GenerationMetricsService(database);
    const issues=[
      '第三日尚未超过三日，触发条件提前',
      '师兄未吃下锅气菜，前提未满足',
      '九人份中没有明确师兄名额，人数分配不清',
    ];
      expect(chapterResponsibilityIssueSignature(issues)).toBe(
        'chapter_responsibility.allocation+missing_prerequisite+trigger_timing',
      );
      expect(chapterResponsibilityIssueSignature([
        '亲属关系证明和失踪登记不等同法定继承权，权限移交缺少生效文书',
        '强哥突然倒向主角并提供关键材料，缺少转变触发与动机',
        '三年前远程授权为何此刻自动响应，缺少持续机制',
      ])).toBe(
        'chapter_responsibility.authority_procedure+authorization_timing+motivation_transition',
      );
    expect(metrics.selectChapterResponsibilityRepairStrategies(first.id,issues)).toEqual(
      [...CHAPTER_RESPONSIBILITY_REPAIR_STRATEGIES],
    );
    metrics.recordChapterResponsibilityRepairAttempt(first.id,issues,'constraint_matrix',false);
    metrics.recordChapterResponsibilityRepairAttempt(first.id,issues,'dependency_cascade',false);
    metrics.recordChapterResponsibilityRepairAttempt(first.id,issues,'full_replan',true);

    const second=projects.create({title:'第二次修复',type:'short_story',targetPlatform:'fanqie'});
    expect(metrics.selectChapterResponsibilityRepairStrategies(second.id,issues)[0]).toBe('full_replan');
  } finally { db.close(); }
});

it('runner calls the production pipeline, isolates labels, and keeps empty state honest (test fixture only)', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    await new Migrator(db).runMigrations(); const database={getDb:()=>db} as any;
    const metrics=new GenerationMetricsService(database); const llm=new RealLLMService({} as any,metrics);
    const controller=new BenchmarkController(database,metrics,llm);
    expect((await controller.run({})).status).toBe('waiting_for_real_samples');
    const p=new ProjectService(new ProjectRepository(database)).create({title:'隔离测试样本',type:'long_novel',targetPlatform:'fanqie',chapterWordRange:{min:3000,max:5000}});
    const content='林岚推开铁门，冷风吹过衣领。她决定在天黑前离开，门外却传来脚步声。';
    const sample=metrics.addBenchmarkSample({projectId:p.id,storyType:'long_novel',platform:'fanqie',content,sourceRef:'test-fixture:isolated-in-memory-only'});
    metrics.annotateBenchmarkSample(sample.id,['human_secret_label']);
    const spy=vi.fn(async(r:any)=>{
      expect(r.prompt).not.toContain('human_secret_label');
      return {content:JSON.stringify({dimensions:Object.fromEntries(SCORE_DIMENSIONS.map(k=>[k,{score:90,reason:'测试评审',evidence:[content]}]))})};
    });
    (llm as any).generateInternal=spy;
    const result:any=await controller.run({projectId:p.id,sampleIds:[sample.id]});
    expect(result.status).toBe('completed');expect(spy).toHaveBeenCalled();expect(result.evaluations[0].falseNegatives).toBe(1);
    expect(db.prepare('SELECT COUNT(*) n FROM quality_benchmark_evaluations').get().n).toBe(1);
    expect(db.prepare('SELECT COUNT(*) n FROM writing_quality_reports').get().n).toBe(0);
    (llm as any).generateInternal=vi.fn(async(r:any)=>{
      if(r.scenario==='refinement') return {content:JSON.stringify({patches:[{original:'铁门',replacement:'木门'}]})};
      const current=r.prompt.split('当前生成结果：')[1];
      return {content:JSON.stringify({dimensions:Object.fromEntries(SCORE_DIMENSIONS.map(k=>[k,{score:k==='logic'&&!current.includes('木门')?40:90,reason:'按事实修正门材质',evidence:[current]}]))})};
    });
    const repaired:any=await controller.run({projectId:p.id,sampleIds:[sample.id],repair:true});
    expect(repaired.status).toBe('completed');
    expect(repaired.evaluations[0].repairAttempted).toBe(true);
    expect(repaired.evaluations[0].repairAccepted).toBe(true);
    expect(db.prepare('SELECT content FROM quality_benchmark_samples WHERE id=?').get(sample.id).content).toBe(content);
    expect(db.prepare('SELECT COUNT(*) n FROM generation_lessons').get().n).toBe(0);
  } finally { db.close(); }
});
