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

function confirmedStoryExpression(prefix: 'NEW' | 'OLD' = 'NEW'): string {
  return `json(CASE
    WHEN json_valid(${prefix}.confirmed_idea) THEN ${prefix}.confirmed_idea
    ELSE json_object('summary', ${prefix}.confirmed_idea)
  END)`;
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

    // confirmed_idea / idea_seed 继续作为兼容与审计快照存在，但运行时故事权威必须只有一份：
    // settings.creativeConstitution。把已确认题材嵌入创作宪法后，RealLLM 的统一宪法注入、
    // 世界观/大纲/正文/精修读取到的是同一个故事事实源，不再需要两套事实对象互相对齐。
    // 新项目通过触发器在 INSERT 时立即合并；confirmed_idea 若被明确更新，也同步到同一位置。
    // 这里不新增 story_contract 表，也不新增编号 migration。
    if (hasTable(db, 'projects')
      && hasColumn(db, 'projects', 'confirmed_idea')
      && hasColumn(db, 'projects', 'settings')) {
      const projects = db.prepare(`SELECT id,confirmed_idea,settings FROM projects
        WHERE LENGTH(TRIM(COALESCE(confirmed_idea,'')))>0`).all() as Array<{
          id: string; confirmed_idea: string; settings: string;
        }>;
      const updateSettings = db.prepare('UPDATE projects SET settings=? WHERE id=?');
      let storyBackfill = 0;
      for (const project of projects) {
        let settings: Record<string, any>;
        try {
          settings = JSON.parse(project.settings || '{}');
        } catch {
          continue;
        }
        const constitution = settings.creativeConstitution;
        if (!constitution || typeof constitution !== 'object' || Array.isArray(constitution)) continue;
        let confirmedStory: unknown;
        try { confirmedStory = JSON.parse(project.confirmed_idea); }
        catch { confirmedStory = { summary: project.confirmed_idea }; }
        if (JSON.stringify((constitution as any).confirmedStory) === JSON.stringify(confirmedStory)) continue;
        settings.creativeConstitution = { ...constitution, confirmedStory };
        updateSettings.run(JSON.stringify(settings), project.id);
        storyBackfill += 1;
      }
      if (storyBackfill > 0) actions.push(`projects.confirmed_story_backfill.${storyBackfill}`);

      db.exec(`
        DROP TRIGGER IF EXISTS trg_projects_confirmed_story_insert;
        CREATE TRIGGER trg_projects_confirmed_story_insert
        AFTER INSERT ON projects
        WHEN LENGTH(TRIM(COALESCE(NEW.confirmed_idea,'')))>0
          AND json_valid(COALESCE(NEW.settings,'{}'))
          AND json_type(NEW.settings,'$.creativeConstitution')='object'
        BEGIN
          UPDATE projects
          SET settings=json_set(
            NEW.settings,
            '$.creativeConstitution.confirmedStory',
            ${confirmedStoryExpression('NEW')}
          )
          WHERE id=NEW.id;
        END;

        DROP TRIGGER IF EXISTS trg_projects_confirmed_story_update;
        CREATE TRIGGER trg_projects_confirmed_story_update
        AFTER UPDATE OF confirmed_idea ON projects
        WHEN LENGTH(TRIM(COALESCE(NEW.confirmed_idea,'')))>0
          AND json_valid(COALESCE(NEW.settings,'{}'))
          AND json_type(NEW.settings,'$.creativeConstitution')='object'
        BEGIN
          UPDATE projects
          SET settings=json_set(
            NEW.settings,
            '$.creativeConstitution.confirmedStory',
            ${confirmedStoryExpression('NEW')}
          )
          WHERE id=NEW.id;
        END;
      `);
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
