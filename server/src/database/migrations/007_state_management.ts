/**
 * 007_state_management - 状态管理相关表
 *
 * 根据子衿的 RAG 状态管理规范创建：
 * 1. character_states - 人物状态快照（已存在，优化）
 * 2. foreshadowing_states - 伏笔状态追踪
 * 3. plot_progress - 情节进展追踪
 * 4. consistency_checks - 一致性检查结果
 * 5. field_locks - 字段级锁定
 * 6. state_versions - 状态版本历史
 */
import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  // ═══════════════════════════════════════════
  // 1. foreshadowing_states 表
  // ═══════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS foreshadowing_states (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      foreshadowing_id TEXT NOT NULL,
      
      -- 状态追踪
      status TEXT DEFAULT 'planted', -- planted/active/recovered/abandoned
      planted_chapter INTEGER,
      recovered_chapter INTEGER,
      recovery_method TEXT,
      
      -- 活跃度指标
      active_chapters INTEGER DEFAULT 0,
      tension_contribution INTEGER DEFAULT 0,
      
      -- 关联性
      related_characters TEXT DEFAULT '[]',
      related_chapters TEXT DEFAULT '[]',
      
      -- 提取元数据
      detected_automatically INTEGER DEFAULT 0,
      last_mentioned_chapter INTEGER,
      mention_count INTEGER DEFAULT 0,
      
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_fs_project ON foreshadowing_states(project_id);
    CREATE INDEX IF NOT EXISTS idx_fs_status ON foreshadowing_states(status);
  `);
  console.log('[Migration 007] Created foreshadowing_states table.');

  // ═══════════════════════════════════════════
  // 2. plot_progress 表
  // ═══════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS plot_progress (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      
      -- 当前冲突
      active_conflicts TEXT DEFAULT '[]',
      resolved_conflicts TEXT DEFAULT '[]',
      
      -- 解决进度
      main_goal_progress INTEGER DEFAULT 0,
      sub_goal_progress TEXT DEFAULT '{}',
      
      -- 情绪曲线
      emotional_beat TEXT DEFAULT 'calm',
      emotional_intensity INTEGER DEFAULT 5,
      
      -- 节奏评分
      pacing_score INTEGER DEFAULT 5,
      turning_points TEXT DEFAULT '[]',
      
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_pp_project ON plot_progress(project_id);
    CREATE INDEX IF NOT EXISTS idx_pp_chapter ON plot_progress(chapter_index);
  `);
  console.log('[Migration 007] Created plot_progress table.');

  // ═══════════════════════════════════════════
  // 3. consistency_checks 表
  // ═══════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS consistency_checks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      check_type TEXT NOT NULL, -- character/world_setting/timeline/plot_logic
      status TEXT DEFAULT 'pass', -- pass/warning/error
      message TEXT NOT NULL,
      severity TEXT DEFAULT 'low', -- low/medium/high
      detected_at TEXT DEFAULT (datetime('now')),
      chapter_index INTEGER,
      details TEXT NOT NULL, -- JSON string
      resolved INTEGER DEFAULT 0,
      resolved_by TEXT,
      resolved_at TEXT,
      
      created_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_cc_project ON consistency_checks(project_id);
    CREATE INDEX IF NOT EXISTS idx_cc_status ON consistency_checks(status);
    CREATE INDEX IF NOT EXISTS idx_cc_chapter ON consistency_checks(chapter_index);
  `);
  console.log('[Migration 007] Created consistency_checks table.');

  // ═══════════════════════════════════════════
  // 4. field_locks 表（字段级锁定）
  // ═══════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS field_locks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      state_type TEXT NOT NULL, -- character/foreshadowing/plot
      state_id TEXT NOT NULL,
      field_path TEXT NOT NULL, -- 如 "characters.张三.currentLocation"
      locked INTEGER DEFAULT 1,
      locked_at TEXT DEFAULT (datetime('now')),
      locked_by TEXT DEFAULT 'user', -- user/ai
      
      UNIQUE(state_type, state_id, field_path)
    );
    
    CREATE INDEX IF NOT EXISTS idx_fl_project ON field_locks(project_id);
    CREATE INDEX IF NOT EXISTS idx_fl_state ON field_locks(state_type, state_id);
  `);
  console.log('[Migration 007] Created field_locks table.');

  // ═══════════════════════════════════════════
  // 5. state_versions 表（版本历史）
  // ═══════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS state_versions (
      id TEXT PRIMARY KEY,
      state_type TEXT NOT NULL, -- character/foreshadowing/plot
      state_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      data TEXT NOT NULL, -- 完整状态快照 JSON
      source TEXT DEFAULT 'auto_extract', -- auto_extract/manual_edit/merge
      created_at TEXT DEFAULT (datetime('now')),
      created_by TEXT DEFAULT 'system',
      change_log TEXT,
      
      UNIQUE(state_type, state_id, version)
    );
    
    CREATE INDEX IF NOT EXISTS idx_sv_state ON state_versions(state_type, state_id);
    CREATE INDEX IF NOT EXISTS idx_sv_version ON state_versions(version);
  `);
  console.log('[Migration 007] Created state_versions table.');

  // ═══════════════════════════════════════════
  // 6. 优化现有 character_states 表
  // ═══════════════════════════════════════════
  
  // 添加 manually_modified 字段
  try {
    db.exec(`ALTER TABLE character_states ADD COLUMN manually_modified INTEGER DEFAULT 0`);
    console.log('[Migration 007] Added character_states.manually_modified.');
  } catch {
    console.log('[Migration 007] character_states.manually_modified already exists, skipped.');
  }
  
  // 添加 modified_fields 字段
  try {
    db.exec(`ALTER TABLE character_states ADD COLUMN modified_fields TEXT DEFAULT '[]'`);
    console.log('[Migration 007] Added character_states.modified_fields.');
  } catch {
    console.log('[Migration 007] character_states.modified_fields already exists, skipped.');
  }

  console.log('[Migration 007] State management tables created successfully.');
}

export function down(db: DatabaseSync): void {
  // 删除新创建的表
  db.exec(`
    DROP TABLE IF EXISTS state_versions;
    DROP TABLE IF EXISTS field_locks;
    DROP TABLE IF EXISTS consistency_checks;
    DROP TABLE IF EXISTS plot_progress;
    DROP TABLE IF EXISTS foreshadowing_states;
  `);
  
  console.log('[Migration 007] Dropped state management tables.');
}
