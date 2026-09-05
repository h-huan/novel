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
      const p = service.create({ title: '验收', platformStyle: 'fanqie', settings: { storyTone: ['热血'], writingStyle: ['白描'] } });
      const updated = service.update(p.id, { targetPlatform: 'zhihu', settings: { storyTone: ['克制'] } });
      const row = db.prepare('SELECT * FROM projects WHERE id=?').get(p.id);
      expect(row.target_platform).toBe('zhihu');
      expect(row.platform_style).toBe('zhihu');
      expect(updated.creativeConstitution.revision).toBe(2);
      const context = new StateItemService(database).buildWritingStateContext(p.id);
      expect(context.projectCard.targetPlatform).toBe('zhihu');
      expect(context.projectCard.storyTone).toEqual(['克制']);
      expect(context.projectCard.creativeConstitution).toEqual(service.findOne(p.id).creativeConstitution);
      expect(() => service.update(p.id, { platformStyle: 'fanqie', targetPlatform: 'zhihu' })).toThrow();
      expect(service.findOne(p.id).creativeConstitution).toEqual(updated.creativeConstitution);
    } finally { db.close(); }
  });
});
