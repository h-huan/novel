import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { compileContext } from '../modules/generation-metrics/context-compiler';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterService, PROFILE_FIELDS } from '../modules/character/character.service';
import { CharacterRepository } from '../database/repositories/character.repository';

describe('character revisions persist all semantic fields', () => {
  let db: DatabaseSync;
  let service: CharacterService;
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    const columns = ['id','project_id','name','aliases','age','gender','identity','appearance','background',
      'personality','abilities','relationships','arc','dialogue_style','dialogue_patterns','is_pov_character',
      'role','faction','goals','weaknesses','wound','keywords','notes','growth_stages_json','core_conflict_role',
      'profile_json','created_at','updated_at'];
    db.exec(`CREATE TABLE characters (${columns.map(name => `"${name}" TEXT`).join(',')})`);
    const database = { getDb: () => db } as any;
    service = new CharacterService(new CharacterRepository(database), {} as any, database);
    db.exec(`CREATE TABLE character_extended_profiles (id TEXT, project_id TEXT, character_id TEXT UNIQUE, ${PROFILE_FIELDS.map(name => `"${name}" TEXT`).join(',')}, reader_empathy_point TEXT, created_at TEXT, updated_at TEXT)`);
    vi.spyOn(service, 'getLatestState').mockReturnValue(null);
  });

  it('generated card persists one profile consumed by both storage and context', () => {
    const source=readFileSync(new URL('../chain/chain.controller.ts',import.meta.url),'utf8');
    const start=source.indexOf('                const generatedProfile = {');
    const end=source.indexOf('                charCount++;',start);
    expect(start).toBeGreaterThan(0);expect(end).toBeGreaterThan(start);
    // Run the production persistence block against actual SQLite, not a mocked repository.
    const block=source.slice(start,end).replace(/catch \(e: any\)/g,'catch (e)');
    runInNewContext(block,{db,cid:'generated',projectId:'p',ch:{name:'甲',speechStyle:'先问来意，再说自己看见的事',catchphrase:'',personality:'谨慎',abilities:'维修',fears:'失去工作'},identity:'维修工',appearance:'戴眼镜',backstory:'曾因误报受罚',goalMotivation:'查明原因',growthArc:'敢于承担',genderVal:null,ageMatch:null,isPov:1,allKeywords:[],roleVal:'protagonist',charAbilities:'{}',now:()=>new Date().toISOString(),serializeGeneratedSqlText:(v:any)=>v==null?'':String(v),require:()=>({randomUUID:()=> 'extended'}),logger:{warn:(m)=>{throw new Error(m);}}});
    const row=db.prepare('SELECT * FROM characters WHERE id=?').get('generated') as any;
    const legacy=db.prepare('SELECT * FROM character_extended_profiles WHERE character_id=?').get('generated') as any;
    expect(JSON.parse(row.profile_json).catchphrase_speech_style).toBe('先问来意，再说自己看见的事');
    expect(legacy.catchphrase_speech_style).toBe(JSON.parse(row.profile_json).catchphrase_speech_style);
    for(const stage of ['character'] as const){
      const data=JSON.parse(compileContext(db,{projectId:'p',stage,maxChars:12000}).snapshot);
      expect(data.characterContracts[0].speechRegister).toBe('先问来意，再说自己看见的事');
      expect(data.characterContracts[0].catchphrases).toEqual([]);
    }
  });

  it('reading a legacy profile cannot overwrite current canonical constraints', () => {
    const c = service.create('p', { name: '林秋', profile: { writingRules: { stageKnowledge: '第三章才揭示' }, abilitiesDetail: { limit: '不能决定司法处理' } } });
    db.prepare('INSERT INTO character_extended_profiles (id,project_id,character_id,abilities_skills) VALUES (?,?,?,?)').run('old','p',c.id,'改字直接救人');
    const before = service.findOne(c.id).profile;
    expect(service.getProfile('p', c.id).character.profile).toEqual(before);
    expect(service.findOne(c.id).profile).toEqual(before);
    vi.spyOn(service, 'recordAutoProfileChanges' as any).mockImplementation(() => {});
    vi.spyOn(service, 'analyzeStateImpact' as any).mockImplementation(() => {});
    service.updateProfile('p', c.id, { abilities_skills: '争取复核，结果由处理方决定' });
    expect(service.findOne(c.id).profile).toMatchObject({ abilities_skills: '争取复核，结果由处理方决定', writingRules: { stageKnowledge: '第三章才揭示' } });
    expect(service.getWritingSummary('p', c.id).summary).not.toContain('改字直接救人');
  });
  it('falls back from the old empty projection without reviving explicitly cleared fields', () => {
    const c = service.create('p', { name: '旧角色', profile: { motivation: {}, writingRules: {} } });
    db.prepare('INSERT INTO character_extended_profiles (id,project_id,character_id,backstory) VALUES (?,?,?,?)').run('legacy','p',c.id,'尚存的旧背景');
    expect(service.getProfile('p',c.id).character.profile.backstory).toBe('尚存的旧背景');
    expect(service.findOne(c.id).profile).toEqual({ motivation: {}, writingRules: {} });
    service.update(c.id,{ profile: { backstory: '' } });
    expect(service.getProfile('p',c.id).character.profile.backstory).toBe('');
  });
  afterEach(() => db.close());

  it('replaces old ability and relationship claims without losing unrelated identity fields', () => {
    const old = service.create('p', { name: '林秋', identity: '排字工', background: '旧背景',
      personality: { summary: '旧性格' } as any, abilities: { description: '改字即改命' },
      relationships: [{ targetCharacterId: 'student', targetName: '学生', type: 'other', description: '改字后获释' }],
    });
    service.update(old.id, { background: '新背景', personality: { summary: '敢追问也怕担责' } as any,
      abilities: { description: '改排消息，不能决定案件结果' }, arc: '争取复核，继续查证',
      relationships: [{ targetCharacterId: 'student', targetName: '学生', type: 'other', description: '暂缓执行但仍在押' }],
    });
    const reread = service.findOne(old.id);
    expect(reread.identity).toBe('排字工');
    expect(reread.personality).toMatchObject({ summary: '敢追问也怕担责' });
    expect(reread.abilities).toMatchObject({ description: '改排消息，不能决定案件结果' });
    expect(reread.relationships).toHaveLength(1);
    expect(reread.relationships[0].description).toBe('暂缓执行但仍在押');
    expect(JSON.stringify(db.prepare('SELECT * FROM characters WHERE id=?').get(old.id))).not.toContain('改字即改命');
  });
});

describe('saved card voice reaches the contract', () => {
  it('persists editor changes in canonical JSON and reports dialogue impact', () => {
    const db=new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE characters(id TEXT,name TEXT,project_id TEXT,profile_json TEXT,personality TEXT,abilities TEXT,relationships TEXT,arc TEXT,updated_at TEXT);');
      db.exec(`CREATE TABLE character_extended_profiles(id TEXT,project_id TEXT,character_id TEXT UNIQUE,${PROFILE_FIELDS.map(f=>f+' TEXT').join(',')},created_at TEXT,updated_at TEXT)`);
      db.prepare('INSERT INTO characters VALUES (?,?,?,?,?,?,?,?,?)').run('c','甲','p',JSON.stringify({catchphrase_speech_style:'旧风格',writingRules:{limit:'不能替别人作决定'}}),'{}','{}','[]','[]','');
      const database={getDb:()=>db} as any;
      const svc=new CharacterService(new CharacterRepository(database),{} as any,database);
      vi.spyOn(svc,'getLatestState').mockReturnValue(null);
      vi.spyOn(svc,'recordAutoProfileChanges' as any).mockImplementation(()=>{});
      const impact=vi.spyOn(svc,'analyzeStateImpact' as any).mockImplementation(()=>{});
      svc.updateProfile('p','c',{catchphrase_speech_style:'回答具体，受到逼问会反问'});
      expect(svc.findOne('c').profile).toMatchObject({catchphrase_speech_style:'回答具体，受到逼问会反问',writingRules:{limit:'不能替别人作决定'}});
      expect(impact.mock.calls[0][3]).toMatchObject({changedGroups:['dialogue'],affectedModules:['chapter','dialogue_quality']});
      svc.updateProfile('p','c',{catchphrase_speech_style:''});
      expect(svc.getProfile('p','c').profile.catchphrase_speech_style).toBe('');
    } finally {db.close();}
  });
});
