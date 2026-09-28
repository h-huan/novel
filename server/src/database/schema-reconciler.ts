import type { DatabaseSync } from 'node:sqlite';

export const CURRENT_SCHEMA_VERSION = 5;

const SCHEMA_DESCRIPTION =
  'Single execution standard, versioned creative authority, bounded dependency context and terminal generation invariants';

type ColumnRow = { name: string };

function hasTable(db: DatabaseSync, name: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name),
  );
}

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  if (!hasTable(db, table)) return false;
  return (db.prepare(`PRAGMA table_info(${table})`).all() as ColumnRow[]).some(
    (item) => item.name === column,
  );
}


/**
 * Keeps an existing database aligned with the current complete 001 schema.
 * This is deliberately one stable, idempotent reconciler instead of an
 * ever-growing sequence of numbered migration files.
 */
export function reconcileSchema(db: DatabaseSync): { version: number; actions: string[] } {
  const actions: string[] = [];
  db.exec('BEGIN');
  try {
    // 旧 IdeaLab 与“运行时自归纳硬标准”已退出产品主链。它们的数据库结构也必须清理，
    // 否则存量数据库仍会保留第二套流程/标准状态，后续代码容易误接回旧事实源。
    for (const table of [
      'standard_summarization_runs',
      'module_standard_versions',
      'module_standards',
      'idea_drafts',
    ]) {
      if (hasTable(db, table)) {
        db.exec(`DROP TABLE ${table}`);
        actions.push(`drop_legacy_table.${table}`);
      }
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS quality_benchmark_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        status TEXT NOT NULL,
        repair_requested INTEGER NOT NULL DEFAULT 0,
        sample_count INTEGER NOT NULL DEFAULT 0,
        completed_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        results_json TEXT NOT NULL DEFAULT '[]',
        started_at TEXT NOT NULL,
        finished_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_benchmark_runs_project
        ON quality_benchmark_runs(project_id,started_at);
    `);

    if (!hasColumn(db, 'quality_benchmark_samples', 'chapter_index')) {
      db.exec('ALTER TABLE quality_benchmark_samples ADD COLUMN chapter_index INTEGER');
      actions.push('quality_benchmark_samples.chapter_index');
    }

    // generation_runs 的终态必须与 gate_status 一致。过去 finishRun 只写 status，
    // 生成在进入质量评估前失败时会永久留下 failed + not_evaluated，界面和恢复逻辑
    // 无法分辨“没评审”与“已经失败”。把这个约束下沉到数据库边界，避免每个调用点
    // 各补一次状态修正；同时回填历史脏数据。无需新增编号 migration。
    if (hasTable(db, 'generation_runs') && hasColumn(db, 'generation_runs', 'gate_status')) {
      const repaired = db.prepare(`UPDATE generation_runs SET gate_status='blocked'
        WHERE status IN ('failed','cancelled') AND COALESCE(gate_status,'not_evaluated')='not_evaluated'`).run();
      if (Number(repaired.changes || 0) > 0) actions.push(`generation_runs.terminal_gate_backfill.${repaired.changes}`);
      db.exec(`
        DROP TRIGGER IF EXISTS trg_generation_runs_terminal_gate;
        CREATE TRIGGER trg_generation_runs_terminal_gate
        AFTER UPDATE OF status ON generation_runs
        WHEN NEW.status IN ('failed','cancelled')
          AND COALESCE(NEW.gate_status,'not_evaluated')='not_evaluated'
        BEGIN
          UPDATE generation_runs SET gate_status='blocked' WHERE id=NEW.id;
        END;
      `);
    }

    // 存量库一次性搬迁旧 IdeaLab 快照后物理删列；运行时代码不再读取这些列。
    if (hasTable(db, 'projects')) {
      const hasConfirmed = hasColumn(db, 'projects', 'confirmed_idea');
      const hasSeed = hasColumn(db, 'projects', 'idea_seed');
      if ((hasConfirmed || hasSeed) && hasColumn(db, 'projects', 'settings')) {
        const c = hasConfirmed ? 'confirmed_idea' : 'NULL AS confirmed_idea';
        const s = hasSeed ? 'idea_seed' : 'NULL AS idea_seed';
        const projects = db.prepare(`SELECT id,settings,${c},${s} FROM projects`).all() as any[];
        const update = db.prepare('UPDATE projects SET settings=? WHERE id=?');
        for (const project of projects) {
          const raw = String(project.confirmed_idea || project.idea_seed || '').trim();
          if (!raw) continue;
          let settings: any; try { settings = JSON.parse(project.settings || '{}'); } catch { continue; }
          const cc = settings.creativeConstitution; if (!cc || typeof cc !== 'object' || cc.confirmedStory !== undefined) continue;
          let confirmedStory: any; try { confirmedStory = JSON.parse(raw); } catch { confirmedStory = { summary: raw }; }
          settings.creativeConstitution = { ...cc, confirmedStory }; update.run(JSON.stringify(settings), project.id);
        }
      }
      db.exec('DROP TRIGGER IF EXISTS trg_projects_confirmed_story_insert; DROP TRIGGER IF EXISTS trg_projects_confirmed_story_update;');
      for (const column of ['confirmed_idea','idea_seed','idea_status','creation_source']) {
        if (hasColumn(db, 'projects', column)) { db.exec(`ALTER TABLE projects DROP COLUMN ${column}`); actions.push(`drop_legacy_column.projects.${column}`); }
      }
    }

    const schemaTableIsCurrent =
      hasColumn(db, 'quality_execution_schema', 'id') &&
      hasColumn(db, 'quality_execution_schema', 'version') &&
      hasColumn(db, 'quality_execution_schema', 'description') &&
      hasColumn(db, 'quality_execution_schema', 'reconciled_at');
    if (!schemaTableIsCurrent && hasTable(db, 'quality_execution_schema')) {
      db.exec('DROP TABLE quality_execution_schema');
      actions.push('quality_execution_schema.metadata_shape');
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS quality_execution_schema (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL,
        description TEXT NOT NULL,
        reconciled_at TEXT NOT NULL
      );
    `);

    const current = db
      .prepare('SELECT version, description FROM quality_execution_schema WHERE id=1')
      .get() as { version: number; description: string } | undefined;
    if (current?.version !== CURRENT_SCHEMA_VERSION || current.description !== SCHEMA_DESCRIPTION) {
      db.prepare(`INSERT INTO quality_execution_schema(id,version,description,reconciled_at)
        VALUES(1,?,?,datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          version=excluded.version,
          description=excluded.description,
          reconciled_at=excluded.reconciled_at`).run(CURRENT_SCHEMA_VERSION, SCHEMA_DESCRIPTION);
      actions.push(`schema.version.${CURRENT_SCHEMA_VERSION}`);
    }

    db.exec('COMMIT');
    return { version: CURRENT_SCHEMA_VERSION, actions };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
