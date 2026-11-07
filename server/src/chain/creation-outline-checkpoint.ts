import { createHash } from 'node:crypto';
import { isGateRejection } from '../modules/writing-quality/gate-failure';

/** Creation fact reviews use outlineFactFailureKind, not a prose-Gate
 * marker. Only proven story conflicts invalidate previously vetted source
 * work; unavailable/incomplete reviewer output remains fail-closed but can
 * resume from the same accepted stages. */
export function hasProvenOutlineCheckpointConflict(error: unknown, repairWasRequired = false): boolean {
  if(repairWasRequired)return true;
  if(error && typeof error==='object'
    && (error as { outlineFactFailureKind?:unknown }).outlineFactFailureKind==='fact_conflict')return true;
  // A 503 Gate rejection means the independent reviewer is unavailable, not
  // that the saved draft has a proven conflict. Keep prior source-bound work
  // for the same strict re-review on resume; 422 retains the original
  // fail-closed invalidation for actual story/quality failures.
  return isGateRejection(error) && error.report.status === 422;
}

interface CheckpointDb {
  exec(sql: string): unknown;
  prepare(sql: string): { get(...args: any[]): any; run(...args: any[]): any };
}

/**
 * Temporary, source-bound creation work. A checkpoint never becomes canonical
 * outline content until all existing whole-book gates and the final transaction
 * succeed. Failed or incompatible work is ignored rather than silently accepted.
 */
export class CreationOutlineCheckpoint {
  constructor(private readonly db: CheckpointDb) {
    db.exec(`CREATE TABLE IF NOT EXISTS creation_outline_checkpoints (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      stage_key TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, stage_key)
    )`);
  }

  static fingerprint(input: unknown): string {
    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
  }

  load<T>(projectId: string, stageKey: string, sourceHash: string): T | null {
    const row = this.db.prepare(
      'SELECT source_hash,payload FROM creation_outline_checkpoints WHERE project_id=? AND stage_key=?',
    ).get(projectId, stageKey) as { source_hash?: string; payload?: string } | undefined;
    if (!row || row.source_hash !== sourceHash) return null;
    try {
      return JSON.parse(String(row.payload)) as T;
    } catch {
      return null;
    }
  }

  save(projectId: string, stageKey: string, sourceHash: string, payload: unknown): void {
    this.db.prepare(`INSERT INTO creation_outline_checkpoints
      (project_id,stage_key,source_hash,payload,updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(project_id,stage_key) DO UPDATE SET
      source_hash=excluded.source_hash,payload=excluded.payload,updated_at=excluded.updated_at`)
      .run(projectId, stageKey, sourceHash, JSON.stringify(payload), new Date().toISOString());
  }

  /** Remove a single no-longer-usable stage without losing earlier approved work. */
  discard(projectId: string, stageKey: string): void {
    this.db.prepare('DELETE FROM creation_outline_checkpoints WHERE project_id=? AND stage_key=?')
      .run(projectId, stageKey);
  }

  /** Aggregate repair changed already vetted chapter projections. Retain the
   * immutable approved responsibility plan, but never reuse stale chapter facts. */
  invalidateChapters(projectId: string): void {
    this.db.prepare(`DELETE FROM creation_outline_checkpoints
      WHERE project_id=? AND stage_key LIKE 'chapter_%' AND stage_key!='chapter_plan'`).run(projectId);
  }

  clear(projectId: string): void {
    this.db.prepare('DELETE FROM creation_outline_checkpoints WHERE project_id=?').run(projectId);
  }
}
