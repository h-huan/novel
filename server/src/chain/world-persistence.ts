import type { DatabaseSync } from 'node:sqlite';

/**
 * The canonical world and its writing-facing profile form one logical record.
 * SAVEPOINT also works if the creation caller is already in a transaction.
 * This is persistence-only: it does not run another world generation or Gate.
 */
export function withAtomicWorldProfile<T>(db: Pick<DatabaseSync, 'exec'>, persist: () => T): T {
  db.exec('SAVEPOINT world_profile_commit');
  try {
    const result = persist();
    db.exec('RELEASE SAVEPOINT world_profile_commit');
    return result;
  } catch (error) {
    db.exec('ROLLBACK TO SAVEPOINT world_profile_commit');
    db.exec('RELEASE SAVEPOINT world_profile_commit');
    throw error;
  }
}

/** Read-back preflight shared by initial creation and resumed projects. */
export function assertWorldProfileAvailable(db: Pick<DatabaseSync, 'prepare'>, projectId: string, worldSettingId: string): void {
  if (!db.prepare('SELECT 1 FROM world_system_profiles WHERE project_id=? AND world_setting_id=?').get(projectId, worldSettingId)) {
    throw new Error('世界观关联档案缺失：主记录与写作约束不完整，停止下游生成，不能把世界观步骤标记成功');
  }
}
