import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerationRecoveryService } from './generation-recovery.service';
import { VectorIndexService } from '../rag/vector-index.service';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

describe('GenerationRecoveryService', () => {
  let db: InstanceType<typeof DatabaseSync>;
  let vectors: Record<string, Array<{ id: string; metadata: Record<string, unknown> }>>;
  let vectorIndex: any;
  let service: GenerationRecoveryService;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY,type TEXT,status TEXT,target_words INTEGER,confirmed_idea TEXT,idea_seed TEXT,updated_at TEXT);
      CREATE TABLE outlines (id TEXT PRIMARY KEY,project_id TEXT,level TEXT,target_words INTEGER,status TEXT,"order" INTEGER);
      CREATE TABLE chapters (id TEXT PRIMARY KEY,project_id TEXT,outline_id TEXT,content TEXT,locked_at TEXT,status TEXT);
      CREATE TABLE characters (id TEXT PRIMARY KEY,project_id TEXT);
      CREATE TABLE world_settings (id TEXT PRIMARY KEY,project_id TEXT);
      CREATE TABLE organizations (id TEXT PRIMARY KEY,project_id TEXT);
      CREATE TABLE map_points (id TEXT PRIMARY KEY,project_id TEXT);
      CREATE TABLE foreshadowings (id TEXT PRIMARY KEY,project_id TEXT,buried_chapter_index INTEGER,planned_recovery_chapter_index INTEGER);
      CREATE TABLE timelines (id TEXT PRIMARY KEY,project_id TEXT);
      CREATE TABLE timeline_events (id TEXT PRIMARY KEY,timeline_id TEXT);
      CREATE TABLE version_history (id TEXT PRIMARY KEY,entity_id TEXT,created_by TEXT);
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
    db.prepare(`INSERT INTO projects VALUES (?,?,?,?,?,?,?)`).run(
      'p1', 'short_story', 'generation_failed', 3200, JSON.stringify({ title: 'idea' }), null, new Date().toISOString(),
    );
  });

  afterEach(() => db.close());

  it('diagnoses an empty failed project as resumable without pretending modules are complete', async () => {
    const audit = await service.audit('p1');
    expect(audit.canResume).toBe(true);
    expect(audit.missingModules).toEqual(expect.arrayContaining(['世界观', '人物', '章节大纲', '正文空壳', '时间线']));
    expect(audit.missingModules).not.toEqual(expect.arrayContaining(['组织', '地点', '伏笔']));
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

  it('restores the previous generated assets and vectors when a recovery attempt fails', async () => {
    db.prepare(`INSERT INTO outlines VALUES ('o1','p1','chapter',3200,'draft',1)`).run();
    db.prepare(`INSERT INTO chapters VALUES ('c1','p1','o1','',NULL,'draft')`).run();
    db.prepare(`INSERT INTO characters VALUES ('char1','p1')`).run();
    vectors[VectorIndexService.COLLECTIONS.CHARACTERS].push({
      id: 'char1', metadata: { projectId: 'p1', text: 'original character' }, vector: [0.1, 0.2],
    } as any);

    const snapshot = await service.captureSnapshot('p1');
    await service.clearFailedGeneratedAssets('p1');
    db.prepare(`INSERT INTO characters VALUES ('bad-char','p1')`).run();
    await service.restoreSnapshot(snapshot);

    expect((db.prepare('SELECT id FROM characters WHERE project_id=?').all('p1') as any[]).map(row => row.id)).toEqual(['char1']);
    expect((db.prepare('SELECT id FROM outlines WHERE project_id=?').all('p1') as any[]).map(row => row.id)).toEqual(['o1']);
    expect((db.prepare('SELECT id FROM chapters WHERE project_id=?').all('p1') as any[]).map(row => row.id)).toEqual(['c1']);
    expect((db.prepare('SELECT status FROM projects WHERE id=?').get('p1') as any).status).toBe('generation_failed');
    expect(vectors[VectorIndexService.COLLECTIONS.CHARACTERS]).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'char1', vector: [0.1, 0.2] }),
    ]));
  });

  it('rejects activation when cross-module or RAG consistency is incomplete', async () => {
    db.prepare(`INSERT INTO outlines VALUES ('o1','p1','chapter',3200,'draft',1)`).run();
    db.prepare(`INSERT INTO chapters VALUES ('c1','p1','o1','',NULL,'draft')`).run();
    await expect(service.assertActivationReady('p1')).rejects.toThrow('激活前完整性校验未通过');
  });

  it('prevents duplicate concurrent recovery for the same project', () => {
    service.acquire('p1');
    expect(() => service.acquire('p1')).toThrow('正在恢复生成');
    service.release('p1');
    expect(() => service.acquire('p1')).not.toThrow();
  });
});
