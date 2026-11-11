import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerationRecoveryService } from './generation-recovery.service';
import { VectorIndexService } from '../rag/vector-index.service';
import { generationTasks } from '../common/generation-cancellation';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

function projectSettings(type: 'long_novel' | 'short_story', targetWords: number) {
  return JSON.stringify({ creativeConstitution: {
    schemaVersion: 1, revision: 1, projectType: type, targetPlatform: 'fanqie', targetWords,
    platformRules: {}, category: '都市', storyTone: ['现实'], writingStyle: [], webNovelGenre: ['现实向'],
    submissionTags: [], plotTags: [], pov: 'third_person', targetAudience: null,
    chapterWordRange: { min: 1000, max: 6000 }, confirmedStory: { title: '已确认题材' },
  } });
}

describe('GenerationRecoveryService', () => {
  let db: InstanceType<typeof DatabaseSync>;
  let vectors: Record<string, Array<{ id: string; metadata: Record<string, unknown> }>>;
  let vectorIndex: any;
  let service: GenerationRecoveryService;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY,type TEXT,status TEXT,target_words INTEGER,settings TEXT,updated_at TEXT);
      CREATE TABLE outlines (id TEXT PRIMARY KEY,project_id TEXT,level TEXT,target_words INTEGER,status TEXT,"order" INTEGER);
      CREATE TABLE chapters (id TEXT PRIMARY KEY,project_id TEXT,outline_id TEXT,content TEXT,locked_at TEXT,status TEXT);
      CREATE TABLE characters (id TEXT PRIMARY KEY,project_id TEXT);
      CREATE TABLE world_settings (id TEXT PRIMARY KEY,project_id TEXT);
      CREATE TABLE world_system_profiles (id TEXT PRIMARY KEY,project_id TEXT,world_setting_id TEXT,rules TEXT);
      CREATE TABLE character_extended_profiles (id TEXT PRIMARY KEY,project_id TEXT,character_id TEXT,details TEXT);
      CREATE TABLE character_relationships (id TEXT PRIMARY KEY,project_id TEXT,source_character_id TEXT,target_character_id TEXT);
      CREATE TABLE organizations (id TEXT PRIMARY KEY,project_id TEXT);
      CREATE TABLE map_points (id TEXT PRIMARY KEY,project_id TEXT);
      CREATE TABLE foreshadowings (id TEXT PRIMARY KEY,project_id TEXT,buried_chapter_index INTEGER,planned_recovery_chapter_index INTEGER);
      CREATE TABLE timelines (id TEXT PRIMARY KEY,project_id TEXT);
      CREATE TABLE timeline_events (id TEXT PRIMARY KEY,timeline_id TEXT);
      CREATE TABLE version_history (id TEXT PRIMARY KEY,entity_id TEXT,created_by TEXT);
      CREATE TABLE generation_runs (id TEXT PRIMARY KEY,project_id TEXT,status TEXT);
    `);
    vectors = {
      [VectorIndexService.COLLECTIONS.CHARACTERS]: [],
      [VectorIndexService.COLLECTIONS.CHAPTERS_ROLLING]: [],
      [VectorIndexService.COLLECTIONS.FORESHADOWINGS]: [],
    };
    vectorIndex = {
      getChunksByMetadata: vi.fn(async (collection: string, filters: Record<string, unknown>) =>
        (vectors[collection] || []).filter(item => item.metadata.projectId === filters.projectId)),
      deleteChunksStrict: vi.fn(async (collection: string, ids: string[]) => {
        vectors[collection] = (vectors[collection] || []).filter(item => !ids.includes(item.id));
      }),
      upsertChunksStrict: vi.fn(async (collection: string, chunks: any[]) => {
        vectors[collection] = [
          ...(vectors[collection] || []).filter(item => !chunks.some(chunk => chunk.id === item.id)),
          ...chunks,
        ];
      }),
    };
    service = new GenerationRecoveryService({ getDb: () => db } as any, vectorIndex);
    db.prepare(`INSERT INTO projects VALUES (?,?,?,?,?,?)`).run(
      'p1', 'short_story', 'generation_failed', 3200, projectSettings('short_story', 3200), new Date().toISOString(),
    );
  });

  afterEach(() => db.close());

  it('diagnoses an empty failed project as resumable without pretending modules are complete', async () => {
    const audit = await service.audit('p1');
    expect(audit.canResume).toBe(true);
    expect(audit.missingModules).toEqual(expect.arrayContaining(['世界观', '人物', '章节大纲', '正文空壳', '时间线']));
    expect(audit.missingModules).not.toEqual(expect.arrayContaining(['组织', '地点', '伏笔']));
  });

  it('does not clear a failed-status project while its original creation task still runs', async () => {
    db.prepare("INSERT INTO characters VALUES ('generated-character','p1')").run();
    let finish!: () => void;
    const hold = new Promise<void>(resolve => { finish = resolve; });
    const task = generationTasks.run('creation', 'p1', '', async () => { await hold; });
    try {
      const audit = await service.audit('p1');
      expect(audit.running).toBe(true);
      expect(audit.canResume).toBe(false);
      await expect(service.clearFailedGeneratedAssets('p1')).rejects.toThrow('原项目生成调用仍在执行');
      expect((db.prepare('SELECT status FROM projects WHERE id=?').get('p1') as any).status).toBe('generation_failed');
      expect((db.prepare('SELECT COUNT(*) count FROM characters WHERE project_id=?').get('p1') as any).count).toBe(1);
    } finally { finish(); await task; }
    const after = await service.audit('p1');
    expect(after.running).toBe(false);
    expect(after.canResume).toBe(true);
  });

  it('retains a complete model-generated role batch and world during outline recovery', async () => {
    db.exec(`ALTER TABLE characters ADD COLUMN name TEXT DEFAULT '';
      ALTER TABLE characters ADD COLUMN identity TEXT DEFAULT '';
      ALTER TABLE characters ADD COLUMN is_pov_character INTEGER DEFAULT 0;`);
    db.prepare("INSERT INTO world_settings VALUES ('saved-world','p1')").run();
    db.prepare("INSERT INTO characters VALUES ('c1','p1','江芥','藏经阁杂役',1)").run();
    db.prepare("INSERT INTO character_extended_profiles VALUES ('cp1','p1','c1','{}')").run();
    db.prepare("INSERT INTO character_relationships VALUES ('rel1','p1','c1','c1')").run();
    db.prepare("INSERT INTO outlines VALUES ('temporary-outline','p1','chapter',3200,'planned',1)").run();

    await service.clearFailedGeneratedAssets('p1');
    expect((db.prepare("SELECT COUNT(*) AS n FROM world_settings WHERE project_id='p1'").get() as any).n).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM characters WHERE project_id='p1'").get() as any).n).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM character_extended_profiles WHERE project_id='p1'").get() as any).n).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM character_relationships WHERE project_id='p1'").get() as any).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM outlines WHERE project_id='p1'").get() as any).n).toBe(0);
    expect((db.prepare("SELECT status FROM projects WHERE id='p1'").get() as any).status).toBe('creating');
  });

  it('regenerates incomplete character sources instead of falsely preserving them', async () => {
    db.exec(`ALTER TABLE characters ADD COLUMN name TEXT DEFAULT '';
      ALTER TABLE characters ADD COLUMN identity TEXT DEFAULT '';
      ALTER TABLE characters ADD COLUMN is_pov_character INTEGER DEFAULT 0;`);
    db.prepare("INSERT INTO world_settings VALUES ('saved-world','p1')").run();
    db.prepare("INSERT INTO characters VALUES ('c1','p1','江芥','藏经阁杂役',1)").run();
    // Missing extended profile means this is not an accepted role batch.
    await service.clearFailedGeneratedAssets('p1');
    expect((db.prepare("SELECT COUNT(*) AS n FROM characters WHERE project_id='p1'").get() as any).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM world_settings WHERE project_id='p1'").get() as any).n).toBe(1);
  });

  it('does not reuse a role batch with the wrong confirmed protagonist even when rows are complete', async () => {
    db.exec(`ALTER TABLE characters ADD COLUMN name TEXT DEFAULT '';
      ALTER TABLE characters ADD COLUMN identity TEXT DEFAULT '';
      ALTER TABLE characters ADD COLUMN is_pov_character INTEGER DEFAULT 0;`);
    const settings = JSON.parse((db.prepare("SELECT settings FROM projects WHERE id='p1'").get() as any).settings);
    settings.creativeConstitution.confirmedStory = {protagonist:'姓名：苏青',characters:[]};
    db.prepare("UPDATE projects SET settings=? WHERE id='p1'").run(JSON.stringify(settings));
    db.prepare("INSERT INTO world_settings VALUES ('saved-world','p1')").run();
    db.prepare("INSERT INTO characters VALUES ('c1','p1','王明','藏经阁杂役',1)").run();
    db.prepare("INSERT INTO character_extended_profiles VALUES ('cp1','p1','c1','{}')").run();
    await service.clearFailedGeneratedAssets('p1');
    expect((db.prepare("SELECT COUNT(*) AS n FROM characters WHERE project_id='p1'").get() as any).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM world_settings WHERE project_id='p1'").get() as any).n).toBe(1);
  });

  it('rejects unsafe recovery while database model calls remain running after a task wrapper settles', async () => {
    db.prepare("INSERT INTO characters VALUES ('source-character','p1')").run();
    db.prepare("INSERT INTO generation_runs VALUES ('model-run','p1','running')").run();
    expect(generationTasks.isRunning('creation', 'p1')).toBe(false);
    const audit = await service.audit('p1');
    expect(audit.running).toBe(true);
    expect(audit.canResume).toBe(false);
    await expect(service.clearFailedGeneratedAssets('p1')).rejects.toThrow('原项目生成调用仍在执行');
    expect((db.prepare("SELECT COUNT(*) AS count FROM characters WHERE project_id='p1'").get() as any).count).toBe(1);
    db.prepare("UPDATE generation_runs SET status='cancelled' WHERE id='model-run'").run();
    expect((await service.audit('p1')).canResume).toBe(true);
  });

  it('blocks cleanup when a chapter contains body text without falsely classifying its author', async () => {
    db.prepare(`INSERT INTO outlines VALUES ('o1','p1','chapter',3200,'draft',1)`).run();
    db.prepare(`INSERT INTO chapters VALUES ('c1','p1','o1','人工修改正文',NULL,'draft')`).run();
    const audit = await service.audit('p1');
    expect(audit.protectedHumanWork).toBe(true);
    expect(audit.protectionReasons).toContain('已有正文、已提交或已锁定正文');
    expect(audit.canResume).toBe(false);
    await expect(service.clearFailedGeneratedAssets('p1')).rejects.toThrow('受保护');
    expect((db.prepare('SELECT COUNT(*) count FROM chapters').get() as any).count).toBe(1);
  });

  it('blocks cleanup when an author-edited canonical entity has version history', async () => {
    db.prepare(`INSERT INTO characters VALUES ('char1','p1')`).run();
    db.prepare(`INSERT INTO version_history VALUES ('v1','char1','author')`).run();
    const audit = await service.audit('p1');
    expect(audit.protectedHumanWork).toBe(true);
    expect(audit.protectionReasons).toContain('已有作者手动修改并留存版本的创作资料');
    await expect(service.clearFailedGeneratedAssets('p1')).rejects.toThrow('受保护资料');
  });

  it('never rebuilds a frozen world even when an explicit source rebuild has no saved body', async () => {
    db.prepare("UPDATE projects SET status='active' WHERE id='p1'").run();
    db.prepare(`INSERT INTO outlines VALUES ('o1','p1','chapter',3200,'draft',1)`).run();
    db.prepare(`INSERT INTO chapters VALUES ('c1','p1','o1','',NULL,'draft')`).run();
    db.prepare(`INSERT INTO version_history VALUES ('v1','o1','author')`).run();
    db.prepare(`INSERT INTO world_settings VALUES ('w1','p1')`).run();
    db.prepare(`INSERT INTO world_system_profiles VALUES ('wp1','p1','w1','旧规则')`).run();

    await expect(service.clearForExplicitSourceRebuild('p1')).rejects.toThrow('世界观已冻结');
    expect((db.prepare('SELECT COUNT(*) count FROM outlines').get() as any).count).toBe(1);
    expect((db.prepare('SELECT rules FROM world_system_profiles WHERE id=?').get('wp1') as any).rules).toBe('旧规则');
    expect((db.prepare('SELECT created_by FROM version_history WHERE id=?').get('v1') as any).created_by).toBe('author');
  });

  it('never rebuilds a project with saved body text through the explicit source route', async () => {
    db.prepare("UPDATE projects SET status='active' WHERE id='p1'").run();
    db.prepare(`INSERT INTO outlines VALUES ('o1','p1','chapter',3200,'draft',1)`).run();
    db.prepare(`INSERT INTO chapters VALUES ('c1','p1','o1','作者正文',NULL,'draft')`).run();
    await expect(service.clearForExplicitSourceRebuild('p1')).rejects.toThrow('已有正文');
  });

  it('clears untrusted generated assets and their RAG chunks in one recovery preparation', async () => {
    db.prepare(`INSERT INTO outlines VALUES ('o1','p1','chapter',3200,'draft',1)`).run();
    db.prepare(`INSERT INTO chapters VALUES ('c1','p1','o1','',NULL,'draft')`).run();
    db.prepare(`INSERT INTO characters VALUES ('char1','p1')`).run();
    vectors[VectorIndexService.COLLECTIONS.CHARACTERS].push({ id: 'char1', metadata: { projectId: 'p1' } });

    await service.clearFailedGeneratedAssets('p1');

    expect((db.prepare('SELECT COUNT(*) count FROM outlines').get() as any).count).toBe(0);
    expect((db.prepare('SELECT COUNT(*) count FROM chapters').get() as any).count).toBe(0);
    expect((db.prepare('SELECT status FROM projects WHERE id=?').get('p1') as any).status).toBe('creating');
    expect(vectorIndex.deleteChunksStrict).toHaveBeenCalled();
    expect(vectors[VectorIndexService.COLLECTIONS.CHARACTERS]).toHaveLength(0);
  });

  it('preserves frozen world while clearing only downstream generated assets for ordinary recovery', async () => {
    db.prepare(`INSERT INTO outlines VALUES ('o1','p1','chapter',3200,'draft',1)`).run();
    db.prepare(`INSERT INTO chapters VALUES ('c1','p1','o1','',NULL,'draft')`).run();
    db.prepare(`INSERT INTO characters VALUES ('char1','p1')`).run();
    db.prepare(`INSERT INTO character_extended_profiles VALUES ('cp1','p1','char1','旧人物档案')`).run();
    db.prepare(`INSERT INTO world_settings VALUES ('w1','p1')`).run();
    db.prepare(`INSERT INTO world_system_profiles VALUES ('wp1','p1','w1','旧世界规则')`).run();

    const audit = await service.audit('p1');
    expect(audit.canResume).toBe(true);
    await service.clearFailedGeneratedAssets('p1');

    expect((db.prepare('SELECT id FROM world_settings WHERE project_id=?').get('p1') as any).id).toBe('w1');
    expect((db.prepare('SELECT rules FROM world_system_profiles WHERE project_id=?').get('p1') as any).rules).toBe('旧世界规则');
    expect((db.prepare('SELECT COUNT(*) count FROM outlines WHERE project_id=?').get('p1') as any).count).toBe(0);
    expect((db.prepare('SELECT COUNT(*) count FROM chapters WHERE project_id=?').get('p1') as any).count).toBe(0);
    expect((db.prepare('SELECT COUNT(*) count FROM characters WHERE project_id=?').get('p1') as any).count).toBe(0);
    expect((db.prepare('SELECT COUNT(*) count FROM character_extended_profiles WHERE project_id=?').get('p1') as any).count).toBe(0);
    expect((db.prepare('SELECT status FROM projects WHERE id=?').get('p1') as any).status).toBe('creating');
  });

  it('restores non-world generated assets and vectors when a pre-world recovery attempt fails', async () => {
    db.prepare(`INSERT INTO outlines VALUES ('o1','p1','chapter',3200,'draft',1)`).run();
    db.prepare(`INSERT INTO chapters VALUES ('c1','p1','o1','',NULL,'draft')`).run();
    db.prepare(`INSERT INTO characters VALUES ('char1','p1')`).run();
    db.prepare(`INSERT INTO character_extended_profiles VALUES ('cp1','p1','char1','旧人物档案')`).run();
    db.prepare(`INSERT INTO character_relationships VALUES ('cr1','p1','char1','char1')`).run();
    vectors[VectorIndexService.COLLECTIONS.CHARACTERS].push({
      id: 'char1', metadata: { projectId: 'p1', text: 'original character' }, vector: [0.1, 0.2],
    } as any);

    const snapshot = await service.captureSnapshot('p1');
    await service.clearFailedGeneratedAssets('p1');
    expect((db.prepare('SELECT COUNT(*) count FROM character_extended_profiles').get() as any).count).toBe(0);
    expect((db.prepare('SELECT COUNT(*) count FROM character_relationships').get() as any).count).toBe(0);
    db.prepare(`INSERT INTO characters VALUES ('bad-char','p1')`).run();
    await service.restoreSnapshot(snapshot);

    expect((db.prepare('SELECT id FROM characters WHERE project_id=?').all('p1') as any[]).map(row => row.id)).toEqual(['char1']);
    expect((db.prepare('SELECT id FROM outlines WHERE project_id=?').all('p1') as any[]).map(row => row.id)).toEqual(['o1']);
    expect((db.prepare('SELECT id FROM chapters WHERE project_id=?').all('p1') as any[]).map(row => row.id)).toEqual(['c1']);
    expect((db.prepare('SELECT details FROM character_extended_profiles WHERE project_id=?').get('p1') as any).details).toBe('旧人物档案');
    expect((db.prepare('SELECT COUNT(*) count FROM character_relationships WHERE project_id=?').get('p1') as any).count).toBe(1);
    expect((db.prepare('SELECT status FROM projects WHERE id=?').get('p1') as any).status).toBe('generation_failed');
    expect(vectors[VectorIndexService.COLLECTIONS.CHARACTERS]).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'char1', vector: [0.1, 0.2] }),
    ]));
  });

  it('rejects invalid short-story target totals during recovery audit', async () => {
    db.prepare(`INSERT INTO world_settings VALUES ('w1','p1')`).run();
    db.prepare(`INSERT INTO characters VALUES ('char1','p1')`).run();
    db.prepare(`INSERT INTO timelines VALUES ('t1','p1')`).run();
    db.prepare(`INSERT INTO timeline_events VALUES ('te1','t1')`).run();
    db.prepare(`INSERT INTO outlines VALUES ('o1','p1','chapter',3000,'draft',1)`).run();
    db.prepare(`INSERT INTO chapters VALUES ('c1','p1','o1','',NULL,'draft')`).run();
    const audit = await service.audit('p1');
    expect(audit.consistencyIssues.join('；')).toContain('章节目标合计3000字，与项目目标3200字不一致');
  });

  it('accepts a valid long-novel progressive outline without requiring detailed chapters to sum to the full target', async () => {
    db.prepare(`INSERT INTO projects VALUES (?,?,?,?,?,?)`).run(
      'long1', 'long_novel', 'creating', 100000, projectSettings('long_novel', 100000), new Date().toISOString(),
    );
    db.prepare(`INSERT INTO world_settings VALUES ('lw1','long1')`).run();
    db.prepare(`INSERT INTO characters VALUES ('lc1','long1')`).run();
    db.prepare(`INSERT INTO timelines VALUES ('lt1','long1')`).run();
    db.prepare(`INSERT INTO timeline_events VALUES ('lte1','lt1')`).run();
    db.exec(`ALTER TABLE outlines ADD COLUMN volumes TEXT`);
    db.prepare(`INSERT INTO outlines (id,project_id,level,target_words,status,"order",volumes) VALUES ('lv1','long1','volume',NULL,'draft',1,'{"estimatedChapters":20}')`).run();
    for (let i = 1; i <= 5; i++) {
      db.prepare(`INSERT INTO outlines (id,project_id,level,target_words,status,"order",volumes) VALUES (?,?,?,?,?,?,NULL)`).run(
        `lo${i}`, 'long1', 'chapter', 5000, 'draft', i,
      );
      db.prepare(`INSERT INTO chapters VALUES (?,?,?,?,?,?)`).run(`lc${i}`, 'long1', `lo${i}`, '', null, 'draft');
    }
    const audit = await service.audit('long1');
    expect(audit.consistencyIssues).not.toContain(expect.stringContaining('章节目标合计'));
    expect(audit.missingModules).not.toContain('世界观');
    expect(audit.missingModules).not.toContain('人物');
    expect(audit.missingModules).not.toContain('时间线');
  });
});
