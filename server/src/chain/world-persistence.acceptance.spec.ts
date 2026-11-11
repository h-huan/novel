import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { assertWorldProfileAvailable, withAtomicWorldProfile } from './world-persistence';
import { up as initializeSchema } from '../database/migrations/001_initial';
import { reconcileSchema } from '../database/schema-reconciler';

const database = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE world_settings (id TEXT PRIMARY KEY);
    CREATE TABLE world_system_profiles (project_id TEXT NOT NULL, world_setting_id TEXT PRIMARY KEY, synopsis TEXT NOT NULL);
  `);
  return db;
};

describe('existing database world/profile creation compatibility', () => {
  it('restores missing creation columns without replacing historical rows and is idempotent', () => {
    const db = new DatabaseSync(':memory:');
    try {
      initializeSchema(db);
      db.prepare('INSERT INTO projects(id,title,type,status,settings,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
        .run('legacy-project','保留故事','short_story','generation_failed','{}','2026-01-01','2026-01-01');
      db.prepare('INSERT INTO world_settings(id,project_id,name,created_at,updated_at) VALUES (?,?,?,?,?)')
        .run('world-legacy','legacy-project','原有世界观','2026-01-01','2026-01-01');
      db.prepare('INSERT INTO world_system_profiles(id,project_id,world_setting_id,created_at,updated_at) VALUES (?,?,?,?,?)')
        .run('profile-legacy','legacy-project','world-legacy','2026-01-01','2026-01-01');
      db.exec('ALTER TABLE world_settings DROP COLUMN social_rules');
      db.exec('ALTER TABLE world_system_profiles DROP COLUMN synopsis');
      const first = reconcileSchema(db);
      expect(first.actions).toContain('creation_world_column.world_settings.social_rules');
      expect(first.actions).toContain('creation_world_column.world_system_profiles.synopsis');
      expect(db.prepare('SELECT name,social_rules FROM world_settings WHERE id=?').get('world-legacy'))
        .toMatchObject({name:'原有世界观',social_rules:''});
      expect(db.prepare('SELECT world_setting_id,synopsis FROM world_system_profiles WHERE id=?').get('profile-legacy'))
        .toMatchObject({world_setting_id:'world-legacy',synopsis:''});
      expect(reconcileSchema(db).actions.filter(action => action.startsWith('creation_world_column.'))).toEqual([]);
    } finally { db.close(); }
  });
});

describe('world and profile atomic persistence', () => {
  it('rolls back the canonical world when the required profile write fails', () => {
    const db = database();
    try {
      expect(() => withAtomicWorldProfile(db, () => {
        db.prepare('INSERT INTO world_settings (id) VALUES (?)').run('world-1');
        db.prepare('INSERT INTO world_system_profiles (project_id, world_setting_id, synopsis) VALUES (?, ?, ?)').run('project-1', 'world-1', null);
      })).toThrow();
      expect(db.prepare('SELECT COUNT(*) AS n FROM world_settings').get()).toMatchObject({ n: 0 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM world_system_profiles').get()).toMatchObject({ n: 0 });
    } finally { db.close(); }
  });

  it('rejects resuming an orphaned world before another model call', () => {
    const db = database();
    try {
      db.prepare('INSERT INTO world_settings (id) VALUES (?)').run('world-orphan');
      expect(() => assertWorldProfileAvailable(db, 'project-1', 'world-orphan')).toThrow('世界观关联档案缺失');
    } finally { db.close(); }
  });

  it('commits both records and supports a surrounding creation transaction', () => {
    const db = database();
    try {
      db.exec('BEGIN');
      withAtomicWorldProfile(db, () => {
        db.prepare('INSERT INTO world_settings (id) VALUES (?)').run('world-2');
        db.prepare('INSERT INTO world_system_profiles (project_id, world_setting_id, synopsis) VALUES (?, ?, ?)').run('project-1', 'world-2', 'confirmed');
      });
      assertWorldProfileAvailable(db, 'project-1', 'world-2');
      db.exec('COMMIT');
      expect(db.prepare('SELECT COUNT(*) AS n FROM world_settings').get()).toMatchObject({ n: 1 });
      expect(db.prepare('SELECT synopsis FROM world_system_profiles WHERE world_setting_id=?').get('world-2')).toMatchObject({ synopsis: 'confirmed' });
    } finally { db.close(); }
  });
});
