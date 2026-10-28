import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { assertWorldProfileAvailable, withAtomicWorldProfile } from './world-persistence';

const database = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE world_settings (id TEXT PRIMARY KEY);
    CREATE TABLE world_system_profiles (project_id TEXT NOT NULL, world_setting_id TEXT PRIMARY KEY, synopsis TEXT NOT NULL);
  `);
  return db;
};

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
