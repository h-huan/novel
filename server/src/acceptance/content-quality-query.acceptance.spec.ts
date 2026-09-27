import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { Migrator } from '../database/migrator';
import { ProjectService } from '../modules/project/project.service';
import { ProjectRepository } from '../database/repositories/project.repository';
import { GenerationMetricsService } from '../modules/generation-metrics/generation-metrics.service';
import { STANDARD_PRECONDITIONS } from './test-standards';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
it('queries all content reports with pagination, combined filters and honest missing scores', async()=>{
 const db=new DatabaseSync(':memory:');
 try {
  await new Migrator(db).runMigrations();
  const database={getDb:()=>db} as any;
  const projects=new ProjectService(new ProjectRepository(database));
  const p=projects.create({...STANDARD_PRECONDITIONS,title:'钟楼作品'});
  const other=projects.create({...STANDARD_PRECONDITIONS,title:'其他作品'});
  const metrics=new GenerationMetricsService(database);
  for(let i=0;i<121;i++) db.prepare('INSERT INTO writing_quality_reports(id,project_id,title,created_at) VALUES(?,?,?,?)').run('r'+i,p.id,'报告'+i,'2026-09-06T04:00:00.000Z');
  db.prepare('INSERT INTO writing_quality_reports(id,project_id) VALUES(?,?)').run('other',other.id);
  db.prepare('INSERT INTO writing_quality_issues(id,report_id,project_id,issue_type,severity,title,summary,evidence) VALUES(?,?,?,?,?,?,?,?)').run('i','r0',p.id,'context','blocking','冲突','颜色冲突','红旗');
  expect(metrics.queryContentReports({projectId:p.id,history:'true',page:'13'})).toMatchObject({total:121,items:[expect.anything()]});
  expect(metrics.queryContentReports({projectId:p.id}).total).toBe(1);
  const result=metrics.queryContentReports({projectId:p.id,history:'true',stage:'chapter',q:'红旗',severity:'blocking',issueStatus:'open',from:'2026-09-06',to:'2026-09-06'});
  expect(result.total).toBe(1);
  expect(result.items[0]).toMatchObject({overallScore:null,score:null,issues:[{severity:'blocking'}]});
  expect(result.items[0]).not.toHaveProperty('model');
  expect(metrics.queryContentReports({projectId:other.id,q:'红旗'}).total).toBe(0);
  expect(()=>metrics.queryContentReports({from:'bad'})).toThrow();
 } finally {db.close()}
});
