import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {Migrator} from '../database/migrator';
import {seedAcceptanceProject} from '../acceptance/test-project-fixture';
import {ChainController} from './chain.controller';
let db:DatabaseSync,controller:any;
const input=()=>({projectId:'p',dto:{selectedIdea:{protagonist:'林青',storyCore:'林青使用维修记录核对承包商的账目。'}},constitution:{targetPlatform:'fanqie'},styleInstruction:'',isShort:true,canonicalCreativeBrief:JSON.stringify({confirmedStory:'林青使用维修记录核对承包商的账目。'}),world:{rules:['维修工可以查阅自己的维修记录']},emit:vi.fn()});
beforeEach(async()=>{db=new DatabaseSync(':memory:');await new Migrator(db).runMigrations();seedAcceptanceProject(db,{id:'p',type:'short_story'});controller=Object.create(ChainController.prototype);controller.db={getDb:()=>db};controller.logger={warn:vi.fn(),error:vi.fn()};controller.generatedCanonGuard={assertStructuredCanCommit:vi.fn()};controller.llmCallWithRetry=vi.fn();});
afterEach(()=>db.close());
describe('short character source before outline',()=>{
 it('persists the existing producer before any outline and preserves motive and ability for planning',async()=>{
  controller.llmCallWithRetry.mockResolvedValue({data:[{name:'林青',basicInfo:'供水维修工',abilities:'只能查阅自己负责的维修记录',goalMotivation:'核对实际维修费用',relationships:[],personality:'核对后才下结论'}],warnings:[],runId:'role-run'});
  await controller.prepareCreationCharacters(input());
  expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(1);const prompt=controller.llmCallWithRetry.mock.calls[0][1];expect(prompt).toContain('维修工可以查阅自己的维修记录');expect(prompt).not.toContain('chapterOrders');
  const row=db.prepare('SELECT name,identity,abilities,profile_json FROM characters WHERE project_id=?').get('p') as any;
  expect(row.name).toBe('林青');expect(row.identity).toBe('供水维修工');expect(JSON.parse(row.abilities).goalMotivation).toBe('核对实际维修费用');expect(JSON.parse(row.profile_json).abilities_skills).toContain('只能查阅');
  expect((db.prepare('SELECT COUNT(*) c FROM character_extended_profiles WHERE project_id=?').get('p') as any).c).toBe(1);
  expect((db.prepare('SELECT COUNT(*) c FROM outlines WHERE project_id=?').get('p') as any).c).toBe(0);
  expect(controller.generatedCanonGuard.assertStructuredCanCommit).toHaveBeenCalledWith(expect.objectContaining({runId:'role-run',expectedStages:['character']}));
 });
 it('binds named short POV to the confirmed story even when a supporting character arrives first',async()=>{
  controller.llmCallWithRetry.mockResolvedValue({data:[
    {name:'邵工',basicInfo:'证人',abilities:'只知道昨天的维修情况'},
    {name:'林青',basicInfo:'供水维修工',abilities:'有权查看本人维修记录'},
  ],warnings:[],runId:'ordered-role'});
  await controller.prepareCreationCharacters(input());
  const rows=db.prepare('SELECT name,is_pov_character,role FROM characters WHERE project_id=?').all('p') as any[];
  expect(rows.find(row=>row.name==='林青')).toMatchObject({is_pov_character:1,role:'protagonist'});
  expect(rows.find(row=>row.name==='邵工')?.is_pov_character).toBe(0);
  expect(controller.llmCallWithRetry).toHaveBeenCalledTimes(1);
 });
 it('rejects a character batch omitting the confirmed protagonist before writing any record',async()=>{
  controller.llmCallWithRetry.mockResolvedValue({data:[{name:'邵工',basicInfo:'证人'}],warnings:[],runId:'bad-role'});
  await expect(controller.prepareCreationCharacters(input())).rejects.toThrow('未形成唯一同名');
  expect((db.prepare('SELECT COUNT(*) c FROM characters WHERE project_id=?').get('p') as any).c).toBe(0);
  expect(controller.generatedCanonGuard.assertStructuredCanCommit).not.toHaveBeenCalled();
 });
 it('reuses saved characters without dispatching a second role generation',async()=>{const now=new Date().toISOString();db.prepare('INSERT INTO characters(id,project_id,name,identity,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('role','p','林青','维修工',now,now);await controller.prepareCreationCharacters(input());expect(controller.llmCallWithRetry).not.toHaveBeenCalled();expect((db.prepare('SELECT COUNT(*) c FROM characters WHERE project_id=?').get('p') as any).c).toBe(1);});
 it('stops before outlining when no character was generated or persisted',async()=>{controller.llmCallWithRetry.mockResolvedValue({data:[],warnings:[],runId:'empty'});await expect(controller.prepareCreationCharacters(input())).rejects.toThrow('未开始章纲');expect((db.prepare('SELECT COUNT(*) c FROM outlines WHERE project_id=?').get('p') as any).c).toBe(0);expect(controller.generatedCanonGuard.assertStructuredCanCommit).not.toHaveBeenCalled();});
});
