/**
 * 001_initial - 初始迁移：创建所有核心表
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`

    -- ═══════════════════════════════════════════
    -- 项目表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'long_novel',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idea',
      target_words INTEGER NOT NULL DEFAULT 0,
      current_words INTEGER NOT NULL DEFAULT 0,
      platform_style TEXT DEFAULT 'fantasy',
      description TEXT,
      writing_style TEXT,           -- JSON: WritingStyleConfig
      settings TEXT NOT NULL,       -- JSON: ProjectSettings
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- ═══════════════════════════════════════════
    -- 世界观设定表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS world_settings (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      era TEXT,
      era_period TEXT,              -- JSON: {start, end}
      geography TEXT DEFAULT '[]',  -- JSON: GeographySetting[]
      factions TEXT DEFAULT '[]',   -- JSON: FactionSetting[]
      power_system TEXT DEFAULT '[]', -- JSON: PowerSystem[]
      economy TEXT DEFAULT '{}',    -- JSON: EconomySetting
      society TEXT DEFAULT '{}',    -- JSON: SocietySetting
      constraints TEXT DEFAULT '[]', -- JSON: Constraint[]
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_world_project ON world_settings(project_id);

    -- ═══════════════════════════════════════════
    -- 角色表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      aliases TEXT,                 -- JSON: string[]
      age INTEGER,
      gender TEXT,
      identity TEXT,
      appearance TEXT,
      background TEXT,
      personality TEXT,             -- JSON: PersonalityVector
      abilities TEXT DEFAULT '{}',  -- JSON: Record<string, number>
      relationships TEXT DEFAULT '[]', -- JSON: Relationship[]
      arc TEXT DEFAULT '[]',        -- JSON: CharacterArc[]
      dialogue_style TEXT,
      dialogue_patterns TEXT,       -- JSON: string[]
      is_pov_character INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_char_project ON characters(project_id);
    CREATE INDEX IF NOT EXISTS idx_char_name ON characters(name);
    CREATE INDEX IF NOT EXISTS idx_char_pov ON characters(is_pov_character);

    -- ═══════════════════════════════════════════
    -- 24维角色状态快照表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS character_states (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      chapter_id TEXT,
      timestamp TEXT NOT NULL,
      snapshot_order INTEGER NOT NULL,
      states_json TEXT NOT NULL,     -- JSON: CharacterStatus
      changed_dimensions TEXT,       -- JSON: string[]
      previous_snapshot_id TEXT,
      change_summary TEXT,
      confidence REAL DEFAULT 1.0,
      needs_review INTEGER DEFAULT 0,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_by TEXT DEFAULT 'system',
      created_at TEXT NOT NULL,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (previous_snapshot_id) REFERENCES character_states(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cs_char ON character_states(character_id, snapshot_order);
    CREATE INDEX IF NOT EXISTS idx_cs_project ON character_states(project_id);
    CREATE INDEX IF NOT EXISTS idx_cs_review ON character_states(needs_review);

    -- ═══════════════════════════════════════════
    -- 大纲节点表 (树形结构，使用 parent_id)
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS outlines (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'chapter',
      parent_id TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      chapter_function TEXT DEFAULT 'breathing',
      goal_arc TEXT DEFAULT 'crisis_resolve',
      target_words INTEGER NOT NULL DEFAULT 3000,
      actual_words INTEGER DEFAULT 0,
      foreshadowing_ids TEXT DEFAULT '[]', -- JSON
      plot_points TEXT DEFAULT '[]',       -- JSON: PlotPoint[]
      status TEXT NOT NULL DEFAULT 'planned',
      character_ids TEXT DEFAULT '[]',     -- JSON: string[]
      scenes TEXT,                         -- JSON: ScenePlan[]
      volumes TEXT,                        -- JSON: VolumePlan[]
      book_skeleton TEXT,                  -- JSON: BookSkeleton
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES outlines(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_out_project ON outlines(project_id);
    CREATE INDEX IF NOT EXISTS idx_out_parent ON outlines(parent_id);
    CREATE INDEX IF NOT EXISTS idx_out_order ON outlines("order");
    CREATE INDEX IF NOT EXISTS idx_out_status ON outlines(status);

    -- ═══════════════════════════════════════════
    -- 正文章节表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      outline_id TEXT,
      volume_index INTEGER NOT NULL DEFAULT 1,
      chapter_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      tianlong_8steps TEXT,                -- JSON: TianLong8Steps
      model_config TEXT,                   -- JSON: ModelConfig
      hook_type TEXT,
      transition_mode TEXT,
      transition_context TEXT,             -- JSON: TransitionContext
      authors_notes TEXT,                  -- JSON: AuthorsNote[]
      quality_score TEXT,                  -- JSON: ChapterQualityScore
      checksum TEXT,
      file_path TEXT,                      -- 文件系统路径
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      locked_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (outline_id) REFERENCES outlines(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ch_project ON chapters(project_id);
    CREATE INDEX IF NOT EXISTS idx_ch_volume ON chapters(project_id, volume_index, chapter_index);
    CREATE INDEX IF NOT EXISTS idx_ch_status ON chapters(status);

    -- ═══════════════════════════════════════════
    -- 伏笔表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS foreshadowings (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'buried',
      type TEXT NOT NULL DEFAULT 'hint',
      importance INTEGER NOT NULL DEFAULT 2,
      buried_at TEXT,
      buried_chapter_index INTEGER NOT NULL,
      planned_recovery_at TEXT,
      planned_recovery_chapter_index INTEGER,
      actual_recovery_at TEXT,
      actual_recovery_chapter_index INTEGER,
      recovery_trigger TEXT,              -- JSON: RecoveryTrigger
      recovery_method TEXT,
      impact INTEGER,
      related_character_ids TEXT DEFAULT '[]', -- JSON: string[]
      related_reversal_ids TEXT,          -- JSON: string[]
      overdue_threshold INTEGER DEFAULT 5,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_fs_project ON foreshadowings(project_id);
    CREATE INDEX IF NOT EXISTS idx_fs_status ON foreshadowings(status);
    CREATE INDEX IF NOT EXISTS idx_fs_chapter ON foreshadowings(buried_chapter_index);

    -- ═══════════════════════════════════════════
    -- 模型配置表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS model_configs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'writer',
      context_window INTEGER DEFAULT 128000,
      max_output_tokens INTEGER DEFAULT 8192,
      supports_streaming INTEGER DEFAULT 1,
      cost_level TEXT DEFAULT 'medium',
      temperature REAL DEFAULT 0.7,
      top_p REAL DEFAULT 0.9,
      max_tokens INTEGER DEFAULT 8192,
      estimated_cost REAL DEFAULT 0,
      actual_cost REAL DEFAULT 0,
      api_key_id TEXT,
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      key_encrypted TEXT NOT NULL,
      label TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      rate_limit TEXT,                  -- JSON: {requestsPerMinute, tokensPerMinute}
      daily_budget REAL,
      daily_usage REAL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- ═══════════════════════════════════════════
    -- 提示词模板表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'system',
      template TEXT NOT NULL,
      variables TEXT DEFAULT '[]',       -- JSON: string[]
      description TEXT,
      version INTEGER DEFAULT 1,
      is_builtin INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- ═══════════════════════════════════════════
    -- 提示词链定义表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS prompt_chain_definitions (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      nodes TEXT NOT NULL,               -- JSON: chain node[]
      edges TEXT NOT NULL,               -- JSON: edge connections
      version INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- ═══════════════════════════════════════════
    -- 链执行日志表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS chain_execution_logs (
      id TEXT PRIMARY KEY,
      chain_id TEXT NOT NULL,
      chapter_id TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      input_snapshot TEXT,               -- JSON
      output_snapshot TEXT,              -- JSON
      node_results TEXT DEFAULT '[]',    -- JSON
      total_tokens INTEGER DEFAULT 0,
      total_cost REAL DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      error TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    -- ═══════════════════════════════════════════
    -- 版本历史表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS version_history (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot TEXT NOT NULL,            -- JSON: 完整数据快照
      checksum TEXT,
      change_summary TEXT,
      created_by TEXT DEFAULT 'system',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_vh_entity ON version_history(entity_type, entity_id, version);

    -- ═══════════════════════════════════════════
    -- 冲突检测日志表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS conflict_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT,
      type TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 3,
      description TEXT NOT NULL,
      source_entity_type TEXT,
      source_entity_id TEXT,
      conflict_entity_type TEXT,
      conflict_entity_id TEXT,
      resolution TEXT,
      resolution_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cl_project ON conflict_logs(project_id);

    -- ═══════════════════════════════════════════
    -- 导入导出日志表
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS import_export_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      direction TEXT NOT NULL DEFAULT 'import',
      entity_type TEXT NOT NULL,
      entity_count INTEGER DEFAULT 0,
      file_path TEXT,
      file_size INTEGER,
      format TEXT DEFAULT 'json',
      status TEXT NOT NULL DEFAULT 'in_progress',
      errors TEXT,                       -- JSON: string[]
      started_at TEXT NOT NULL,
      completed_at TEXT,
      created_by TEXT DEFAULT 'system'
    );

    -- ═══════════════════════════════════════════
    -- 数据目录初始化
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS data_directory (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      parent_id TEXT,
      type TEXT NOT NULL DEFAULT 'directory',
      metadata TEXT,                     -- JSON
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

  `);

  console.log('[Migration 001] Created all core tables.');
}

export function down(db: DatabaseSync): void {
  const tables = [
    'data_directory',
    'import_export_logs',
    'conflict_logs',
    'version_history',
    'chain_execution_logs',
    'prompt_chain_definitions',
    'prompt_templates',
    'api_keys',
    'model_configs',
    'foreshadowings',
    'chapters',
    'outlines',
    'character_states',
    'characters',
    'world_settings',
    'projects',
  ];

  for (const table of tables) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }

  console.log('[Migration 001] Dropped all core tables.');
}
