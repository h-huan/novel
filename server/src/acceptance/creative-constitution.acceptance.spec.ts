import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { ProjectService } from '../modules/project/project.service';
import { ProjectRepository } from '../database/repositories/project.repository';
import { Migrator } from '../database/migrator';
import { StateItemService } from '../state/state-item.service';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

describe('constitution SQLite acceptance', () => {
  it('persists one authority, updates mirrors, and supplies writing context after reload', async () => {
    const db = new DatabaseSync(':memory:');
    try {
      await new Migrator(db).runMigrations();
      const database = { getDb: () => db } as any;
      const service = new ProjectService(new ProjectRepository(database));
      const p = service.create({ title: '验收', targetPlatform: 'fanqie', storyTone: ['热血'], writingStyle: ['白描'] });
      const updated = service.update(p.id, { targetPlatform: 'zhihu', storyTone: ['克制'] });
      const row = db.prepare('SELECT * FROM projects WHERE id=?').get(p.id);
      expect(row.target_platform).toBe('zhihu');
      expect(row.platform_style).toBe('zhihu');
      expect(updated.creativeConstitution.revision).toBe(2);
      expect(updated.creativeConstitution.chapterWordRange).toEqual({ min: 3000, max: 5000 });
      const context = new StateItemService(database).buildWritingStateContext(p.id);
      expect(context.projectCard.targetPlatform).toBe('zhihu');
      expect(context.projectCard.storyTone).toEqual(['克制']);
      expect(context.projectCard.creativeConstitution).toEqual(service.findOne(p.id).creativeConstitution);
      expect(() => service.update(p.id, { targetPlatform: 'fanqie', settings: { targetPlatform: 'zhihu' } })).toThrow();
      expect(service.findOne(p.id).creativeConstitution).toEqual(updated.creativeConstitution);
    } finally { db.close(); }
  });

  it('consolidates existing project aliases into the persisted constitution on startup', async () => {
    const db = new DatabaseSync(':memory:');
    try {
      await new Migrator(db).runMigrations();
      const database = { getDb: () => db } as any;
      const service = new ProjectService(new ProjectRepository(database));
      const project = service.create({ title: '存量项目', targetPlatform: 'generic' });
      db.prepare('UPDATE projects SET target_platform=?,platform_style=?,settings=? WHERE id=?').run(
        '', 'fanqie', JSON.stringify({ targetPlatform: 'zhihu', storyTone: ['克制'], style: ['白描'], operationalFlag: true }), project.id,
      );

      await new Migrator(db).runMigrations();
      const row = db.prepare('SELECT target_platform,platform_style,settings FROM projects WHERE id=?').get(project.id) as any;
      const settings = JSON.parse(row.settings);
      expect(row.target_platform).toBe('fanqie');
      expect(row.platform_style).toBe('fanqie');
      expect(settings.operationalFlag).toBe(true);
      expect(settings.targetPlatform).toBeUndefined();
      expect(settings.storyTone).toBeUndefined();
      expect(settings.style).toBeUndefined();
      expect(settings.creativeConstitution).toMatchObject({ targetPlatform: 'fanqie', storyTone: ['克制'], writingStyle: ['白描'] });
      expect(settings.creativeConstitution.chapterWordRange).toEqual({ min: 3000, max: 5000 });

      const normalized = row.settings;
      const revision = settings.creativeConstitution.revision;
      await new Migrator(db).runMigrations();
      const stable = db.prepare('SELECT settings FROM projects WHERE id=?').get(project.id) as any;
      expect(stable.settings).toBe(normalized);
      expect(JSON.parse(stable.settings).creativeConstitution.revision).toBe(revision);
    } finally { db.close(); }
  });
});
