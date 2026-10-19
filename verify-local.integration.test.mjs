import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,copyFile,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=dirname(fileURLToPath(import.meta.url));
const versionSource=await readFile(join(root,'server/shared/src/执行标准.ts'),'utf8');
const versions=[...versionSource.matchAll(/export\s+const\s+SYSTEM_WORKFLOW_RULESET_VERSION\s*=\s*(\d+)\s*;/g)];
assert.equal(versions.length,1,'unique ruleset version');
const version=Number(versions[0][1]);

async function verify(status,{wrongSource=false,missingCockpit=false}={}){
 const temp=await mkdtemp(join(tmpdir(),'novel-verify-'));
 const missing=['outline_success_without_chapter_outline'];
 const routes={
  '/health':{ok:true},
  '/module-standards':Array.from({length:10},(_,i)=>({moduleKey:'module-'+i,version,seedBaselineVersion:version,source:wrongSource?'code_seed':'system_workflow_rule_registry'})),
  '/chain/idea-discovery-diagnostics/latest':{available:true,audit:{success:true}},
  '/projects/test-project':{id:'test-project',type:'short_story',title:'fixture',status,creativeConstitution:{confirmedStory:{title:'fixture'}}},
  '/projects/test-project/chapters':[],
  '/generation-metrics/runs?projectId=test-project&limit=200':[],
  '/generation-metrics/cockpit?projectId=test-project':missingCockpit?{error:'cockpit unavailable'}:{diagnostics:{
   creationStalled:false,persistenceMismatch:status==='generation_failed'?missing:[],
   pendingPersistenceMismatch:status==='creating'?missing:[],
   sample:{stepMetrics:1,generationRuns:1},effectiveFirstPassRate:1,
   persisted:{worldSettings:1,characters:status==='generation_failed'?0:2,chapterOutlines:status==='generation_failed'?0:4},
   slowestSteps:[],totalDurationMs:5000}},
  '/platform-analytics/overview?projectId=test-project&days=30':{},
  '/chain/generation-recovery/test-project':{missingModules:status==='generation_failed'?['人物','章节大纲']:[],consistencyIssues:[],outlineBodyMappingValid:true}
 };
 const server=createServer((req,res)=>{
  const route=String(req.url||'').replace(/^\/api\/v1/,'');
  res.setHeader('Content-Type','application/json');
  res.statusCode=req.method==='GET'&&Object.hasOwn(routes,route)?200:404;
  res.end(JSON.stringify(routes[route]??{error:'not allowed'}));
 });
 try {
  await mkdir(join(temp,'server/shared/src'),{recursive:true});
  await mkdir(join(temp,'server/src/modules/module-standards'),{recursive:true});
  for(const script of ['verify-local.mjs','verify-local-core.mjs','verify-local-guard.mjs'])
   await copyFile(join(root,script),join(temp,script));
  await writeFile(join(temp,'server/shared/src/执行标准.ts'),'export const SYSTEM_WORKFLOW_RULESET_VERSION = '+version+';\n');
  await writeFile(join(temp,'server/src/modules/module-standards/module-standards.seed.ts'),
   'export const SEED_BASELINE_VERSION = SYSTEM_WORKFLOW_RULESET_VERSION;\n');
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  const args=[join(temp,'verify-local.mjs'),'--project','test-project','--base','http://127.0.0.1:'+address.port+'/api/v1'];
  const exitCode=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,args,{cwd:temp,stdio:'ignore',env:{...process.env,DEEPSEEK_API_KEY:''}});
   child.once('error',reject);child.once('close',resolve);
  });
  const report=JSON.parse(await readFile(join(temp,'verification/latest.json'),'utf8'));
  const markdown=await readFile(join(temp,'verification/latest.md'),'utf8');
  return {exitCode,report,markdown};
 }finally{
  if(server.listening)await new Promise(resolve=>server.close(resolve));
  await rm(temp,{recursive:true,force:true});
 }
}

test('completed creation data can pass without a written first chapter',async()=>{
 const x=await verify('active');
 assert.equal(x.exitCode,0);assert.equal(x.report.verdict.status,'passed');
 assert.equal(x.report.options.requiresWrittenFirstChapter,false);
 assert.equal(x.report.runtime.standards.codeSeedVersion,version);
 assert.equal(x.report.runtime.standards.consistent,true);
 assert.ok(x.report.sourceFingerprints['server/shared/src/执行标准.ts']);
});
test('creating remains IN_PROGRESS and preserves pending persistence diagnostics',async()=>{
 const x=await verify('creating');
 assert.notEqual(x.exitCode,0);assert.equal(x.report.verdict.status,'in_progress');
 assert.match(x.markdown,/IN_PROGRESS · pending=outline_success_without_chapter_outline/u);
});
test('failed project cannot hide terminal lost chapter outlines',async()=>{
 const x=await verify('generation_failed');
 assert.notEqual(x.exitCode,0);assert.equal(x.report.verdict.status,'failed');
 assert.ok(x.report.verdict.runtimeProblems.includes('project_project_status_generation_failed'));
 assert.ok(x.report.verdict.runtimeProblems.includes('project_persistence_mismatch_outline_success_without_chapter_outline'));
 assert.match(x.markdown,/创建\/持久化诊断：FAIL/u);
});
test('incorrect source provenance must be reported as a drift',async()=>{
 const x=await verify('active',{wrongSource:true});
 assert.notEqual(x.exitCode,0);assert.ok(x.report.verdict.runtimeProblems.includes('execution_standard_drift'));
});
test('missing cockpit may not produce a completed PASS',async()=>{
 const x=await verify('active',{missingCockpit:true});
 assert.notEqual(x.exitCode,0);
 assert.ok(x.report.verdict.runtimeProblems.includes('project_creation_diagnostics_unavailable'));
});