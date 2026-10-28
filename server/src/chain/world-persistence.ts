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
