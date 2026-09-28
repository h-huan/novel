import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

/**
 * 当前唯一数据库基线。新库直接建立最终结构；已有本地库幂等补列，
 * 并在保留数据的前提下把旧冲突表迁入统一 QualityIssue 后删除。
 */
const SCHEMA_SQL = `
-- [table] aggregate_summary_states
CREATE TABLE IF NOT EXISTS aggregate_summary_states (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      volume_index INTEGER,
      stale INTEGER NOT NULL DEFAULT 1,
      stale_reason TEXT,
      source_chapter_id TEXT,
      source_chapter_checksum TEXT,
      stale_at TEXT,
      updated_at TEXT NOT NULL, scope_key TEXT, summary TEXT, source_fingerprint TEXT, source_count INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'ai', status TEXT NOT NULL DEFAULT 'stale', generated_at TEXT, last_error TEXT, diagnostics TEXT,
      UNIQUE(project_id, scope, volume_index)
    );

-- [table] canonical_entity_sync_states
CREATE TABLE IF NOT EXISTS canonical_entity_sync_states (
      project_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      index_status TEXT NOT NULL DEFAULT 'pending',
      needs_resync INTEGER NOT NULL DEFAULT 1,
      last_error TEXT,
      last_attempt_at TEXT,
      synced_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, entity_type, entity_id)
    );

-- [table] chapter_continuity_reviews
CREATE TABLE IF NOT EXISTS chapter_continuity_reviews (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      content_checksum TEXT NOT NULL,
      review_type TEXT NOT NULL,
      issue_type TEXT NOT NULL,
      target_id TEXT NOT NULL DEFAULT '',
      requirement TEXT,
      old_evidence TEXT,
      new_evidence TEXT,
      change_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      blocks_lock INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      state_item_id TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(chapter_id, content_checksum, review_type, issue_type, target_id)
    );

-- [table] chapter_derived_sync_states
CREATE TABLE IF NOT EXISTS chapter_derived_sync_states (
      chapter_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content_checksum TEXT NOT NULL,
      summary_sync_status TEXT NOT NULL DEFAULT 'pending',
      vector_sync_status TEXT NOT NULL DEFAULT 'pending',
      needs_resync INTEGER NOT NULL DEFAULT 1,
      last_error TEXT,
      last_attempt_at TEXT,
      updated_at TEXT NOT NULL
    , foreshadowing_sync_status TEXT NOT NULL DEFAULT 'pending', timeline_sync_status TEXT NOT NULL DEFAULT 'pending', outline_sync_status TEXT NOT NULL DEFAULT 'pending', needs_author_review INTEGER NOT NULL DEFAULT 0);

-- [table] chapter_summaries
CREATE TABLE IF NOT EXISTS chapter_summaries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL UNIQUE,
      content_checksum TEXT NOT NULL,
      summary TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'ai',
      status TEXT NOT NULL DEFAULT 'current',
      generated_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- [table] chapters
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

-- [table] character_evolution_events
CREATE TABLE IF NOT EXISTS character_evolution_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      character_id TEXT,
      character_name TEXT,
      source_state_item_id TEXT,
      source_chapter_id TEXT,
      chapter_index INTEGER,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      before_state TEXT DEFAULT '{}',
      after_state TEXT DEFAULT '{}',
      delta TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at TEXT,
      FOREIGN KEY (source_state_item_id) REFERENCES state_items(id) ON DELETE SET NULL
    );

-- [table] character_extended_profiles
CREATE TABLE IF NOT EXISTS character_extended_profiles (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      character_id TEXT NOT NULL UNIQUE,
      appearance_memory_points TEXT DEFAULT '', signature_item TEXT DEFAULT '', action_habits TEXT DEFAULT '', clothing_style TEXT DEFAULT '',
      short_term_goal TEXT DEFAULT '', long_term_goal TEXT DEFAULT '', core_desire TEXT DEFAULT '', core_fear TEXT DEFAULT '', current_problem TEXT DEFAULT '', failure_cost TEXT DEFAULT '',
      key_backstory TEXT DEFAULT '', trauma TEXT DEFAULT '', obsession TEXT DEFAULT '', hidden_identity TEXT DEFAULT '', secret TEXT DEFAULT '', main_truth_relation TEXT DEFAULT '',
      ability_source TEXT DEFAULT '', ability_level TEXT DEFAULT '', special_skills TEXT DEFAULT '', ability_limit TEXT DEFAULT '', ability_cost TEXT DEFAULT '', growth_route TEXT DEFAULT '', cannot_use_reason TEXT DEFAULT '',
      body_weakness TEXT DEFAULT '', personality_weakness TEXT DEFAULT '', emotion_weakness TEXT DEFAULT '', relationship_weakness TEXT DEFAULT '', moral_boundary TEXT DEFAULT '', exploitable_point TEXT DEFAULT '',
      surface_personality TEXT DEFAULT '', deep_personality TEXT DEFAULT '', contradiction_point TEXT DEFAULT '', value_system TEXT DEFAULT '',
      speech_style TEXT DEFAULT '', catchphrase TEXT DEFAULT '', common_words TEXT DEFAULT '', forbidden_words TEXT DEFAULT '', tone_to_different_people TEXT DEFAULT '', emotion_outburst_style TEXT DEFAULT '',
      danger_reaction TEXT DEFAULT '', temptation_reaction TEXT DEFAULT '', betrayal_reaction TEXT DEFAULT '', weak_person_reaction TEXT DEFAULT '', strong_person_reaction TEXT DEFAULT '', principle_break_condition TEXT DEFAULT '',
      plot_function TEXT DEFAULT '', conflict_function TEXT DEFAULT '', reversal_function TEXT DEFAULT '', foreshadowing_function TEXT DEFAULT '', reader_empathy_point TEXT DEFAULT '', reader_expectation TEXT DEFAULT '',
      initial_arc_state TEXT DEFAULT '', current_arc_state TEXT DEFAULT '', volume_arc TEXT DEFAULT '', midpoint_arc TEXT DEFAULT '', ending_arc TEXT DEFAULT '',
      must_obey_rules TEXT DEFAULT '', can_change_rules TEXT DEFAULT '', forbidden_writing TEXT DEFAULT '', easy_to_break_points TEXT DEFAULT '', current_chapter_usage TEXT DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    , alias_title TEXT DEFAULT '', identity_occupation TEXT DEFAULT '', faction_stance TEXT DEFAULT '', role_type TEXT DEFAULT '', appearance TEXT DEFAULT '', personality_traits TEXT DEFAULT '', abilities_skills TEXT DEFAULT '', backstory TEXT DEFAULT '', relationships TEXT DEFAULT '', catchphrase_speech_style TEXT DEFAULT '', goals_motivation TEXT DEFAULT '', weaknesses_fears TEXT DEFAULT '', supplementary TEXT DEFAULT '');

-- [table] character_profile_changes
CREATE TABLE IF NOT EXISTS character_profile_changes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    field_key TEXT NOT NULL,
    field_label TEXT NOT NULL DEFAULT '',
    before_value TEXT NOT NULL DEFAULT '',
    after_value TEXT NOT NULL DEFAULT '',
    chapter_index INTEGER,
    reason TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

-- [table] character_relationship_events
CREATE TABLE IF NOT EXISTS character_relationship_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      relationship_id TEXT NOT NULL,
      chapter_id TEXT,
      event_type TEXT NOT NULL DEFAULT 'other',
      summary TEXT,
      before_state_json TEXT DEFAULT '{}',
      after_state_json TEXT DEFAULT '{}',
      evidence TEXT,
      impact TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- [table] character_relationships
CREATE TABLE IF NOT EXISTS character_relationships (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_character_id TEXT NOT NULL,
      target_character_id TEXT NOT NULL,
      relation_type TEXT NOT NULL DEFAULT 'unknown',
      public_relation TEXT,
      hidden_relation TEXT,
      trust_score INTEGER DEFAULT 50,
      conflict_score INTEGER DEFAULT 0,
      emotional_tendency TEXT,
      interest_binding TEXT,
      first_chapter_id TEXT,
      latest_chapter_id TEXT,
      current_phase TEXT,
      reader_known_state TEXT NOT NULL DEFAULT 'unknown',
      source_known_state TEXT NOT NULL DEFAULT 'unknown',
      target_known_state TEXT NOT NULL DEFAULT 'unknown',
      change_summary TEXT,
      change_history_json TEXT DEFAULT '[]',
      related_foreshadowing_ids TEXT DEFAULT '[]',
      related_timeline_event_ids TEXT DEFAULT '[]',
      review_status TEXT NOT NULL DEFAULT 'pending',
      locked INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- [table] character_state_snapshots
CREATE TABLE IF NOT EXISTS character_state_snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      chapter_id TEXT,
      volume_index INTEGER,
      state_type TEXT NOT NULL,
      current_state TEXT,
      evidence TEXT,
      cause TEXT,
      action_impact TEXT,
      relation_impact TEXT,
      goal_impact TEXT,
      foreshadowing_impact TEXT,
      future_change TEXT,
      conflict_risk TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- [table] character_states
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
      created_at TEXT NOT NULL, manually_modified INTEGER DEFAULT 0, modified_fields TEXT DEFAULT '[]', updated_at TEXT,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (previous_snapshot_id) REFERENCES character_states(id) ON DELETE SET NULL
    );

-- [table] characters
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
      updated_at TEXT NOT NULL, role TEXT DEFAULT 'supporting', density_profile_json TEXT DEFAULT '{}', faction TEXT DEFAULT '', goals TEXT DEFAULT '', weaknesses TEXT DEFAULT '', wound TEXT DEFAULT '', keywords TEXT DEFAULT '', notes TEXT DEFAULT '', growth_stages_json TEXT DEFAULT '[]', core_conflict_role TEXT DEFAULT '', profile_json TEXT DEFAULT '{}',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

-- [table] dual_write_store
CREATE TABLE IF NOT EXISTS dual_write_store (
      id TEXT PRIMARY KEY,
      data_key TEXT NOT NULL,
      data_value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- [table] field_locks
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

-- [table] foreshadowing_chapter_tasks
CREATE TABLE IF NOT EXISTS foreshadowing_chapter_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      task_type TEXT NOT NULL DEFAULT 'check',
      priority TEXT NOT NULL DEFAULT 'medium',
      instruction TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      review_status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual',
      locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- [table] foreshadowing_lifecycle_events
CREATE TABLE IF NOT EXISTS foreshadowing_lifecycle_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      chapter_id TEXT,
      event_type TEXT NOT NULL DEFAULT 'other',
      summary TEXT,
      reader_effect TEXT,
      true_effect TEXT,
      evidence TEXT,
      impact TEXT,
      before_state_json TEXT DEFAULT '{}',
      after_state_json TEXT DEFAULT '{}',
      review_status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- [table] foreshadowing_states
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
    , needs_review INTEGER DEFAULT 0, reviewed_by TEXT, reviewed_at TEXT);

-- [table] foreshadowing_threads
CREATE TABLE IF NOT EXISTS foreshadowing_threads (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      legacy_foreshadowing_id TEXT,
      title TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'chapter',
      volume_index INTEGER,
      status TEXT NOT NULL DEFAULT 'planned',
      summary TEXT,
      reader_understanding TEXT,
      true_meaning TEXT,
      reveal_strategy TEXT,
      risk_level TEXT NOT NULL DEFAULT 'none',
      risk_reason TEXT,
      planned_bury_chapter_id TEXT,
      actual_bury_chapter_id TEXT,
      planned_deepen_chapter_ids TEXT DEFAULT '[]',
      planned_misdirect_chapter_ids TEXT DEFAULT '[]',
      recovery_window_start_chapter_id TEXT,
      recovery_window_end_chapter_id TEXT,
      actual_recovery_chapter_id TEXT,
      related_character_ids TEXT DEFAULT '[]',
      related_relationship_ids TEXT DEFAULT '[]',
      related_timeline_event_ids TEXT DEFAULT '[]',
      related_world_rule_ids TEXT DEFAULT '[]',
      review_status TEXT NOT NULL DEFAULT 'pending',
      locked INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- [table] foreshadowings
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
      updated_at TEXT NOT NULL, scope TEXT DEFAULT 'chapter', volume_index INTEGER DEFAULT 0, chain_json TEXT DEFAULT '{}', recovery_window_json TEXT DEFAULT '{}', density_json TEXT DEFAULT '{}', recovery_condition TEXT DEFAULT '', payoff_description TEXT DEFAULT '', recovery_window_start INTEGER, recovery_window_end INTEGER, evidence_text TEXT DEFAULT '', risk_level TEXT DEFAULT 'medium', emotional_impact TEXT DEFAULT '', layered_reveal TEXT DEFAULT '[]',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

-- [table] generation_lessons
CREATE TABLE IF NOT EXISTS generation_lessons (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      category TEXT NOT NULL,
      lesson TEXT NOT NULL,
      occurrence INTEGER NOT NULL DEFAULT 1,
      last_chapter_index INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, lesson)
    );

-- [table] generation_runs
CREATE TABLE IF NOT EXISTS generation_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      scenario TEXT NOT NULL,
      status TEXT NOT NULL,
      constitution_revision INTEGER,
      constitution_json TEXT,
      prompt_version TEXT NOT NULL,
      context_version TEXT NOT NULL,
      context_snapshot TEXT,
      chapter_index INTEGER,
      standards_snapshot TEXT,
      quality_payload TEXT,
      model TEXT,
      output_text TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      duration_ms INTEGER,
      gate_status TEXT NOT NULL DEFAULT 'not_evaluated'
    );

-- [table] generation_repairs
CREATE TABLE IF NOT EXISTS generation_repairs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      strategy TEXT NOT NULL,
      before_text TEXT NOT NULL,
      after_text TEXT,
      before_score INTEGER,
      after_score INTEGER,
      before_report TEXT NOT NULL,
      after_report TEXT,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

-- [table] repair_strategy_stats
CREATE TABLE IF NOT EXISTS repair_strategy_stats (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      genre TEXT NOT NULL,
      story_type TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      strategy_id TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      accepted INTEGER NOT NULL DEFAULT 0,
      rollbacks INTEGER NOT NULL DEFAULT 0,
      before_score_sum REAL NOT NULL DEFAULT 0,
      after_score_sum REAL NOT NULL DEFAULT 0,
      improvement_sum REAL NOT NULL DEFAULT 0,
      introduced_issue_count INTEGER NOT NULL DEFAULT 0,
      tokens_sum INTEGER NOT NULL DEFAULT 0,
      latency_ms_sum INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(rule_id,platform,genre,story_type,model,prompt_version,strategy_id)
    );

-- [table] quality_benchmark_samples
CREATE TABLE IF NOT EXISTS quality_benchmark_samples (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      story_type TEXT NOT NULL,
      platform TEXT NOT NULL,
      content TEXT NOT NULL,
      source_ref TEXT,
      annotation_status TEXT NOT NULL DEFAULT 'pending',
      human_labels_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      chapter_index INTEGER
    );

-- [table] quality_benchmark_evaluations
CREATE TABLE IF NOT EXISTS quality_benchmark_evaluations (
      id TEXT PRIMARY KEY,
      sample_id TEXT NOT NULL REFERENCES quality_benchmark_samples(id) ON DELETE CASCADE,
      run_id TEXT,
      predicted_labels_json TEXT NOT NULL,
      repair_attempted INTEGER NOT NULL DEFAULT 0,
      repair_accepted INTEGER NOT NULL DEFAULT 0,
      introduced_issue INTEGER NOT NULL DEFAULT 0,
      before_score REAL,
      after_score REAL,
      created_at TEXT NOT NULL
    );

-- [table] quality_benchmark_runs
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

-- [table] quality_execution_schema
CREATE TABLE IF NOT EXISTS quality_execution_schema (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      description TEXT NOT NULL,
      reconciled_at TEXT NOT NULL
    );

-- [table] generation_step_metrics
CREATE TABLE IF NOT EXISTS generation_step_metrics (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      chapter_index INTEGER,
      step_key TEXT NOT NULL,
      scenario TEXT,
      model_version TEXT,
      attempt INTEGER NOT NULL DEFAULT 0,
      phase TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      fail_reason TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      prompt_chars INTEGER NOT NULL DEFAULT 0,
      output_chars INTEGER NOT NULL DEFAULT 0,
      output_words INTEGER NOT NULL DEFAULT 0,
      target_words INTEGER,
      deficit_words INTEGER,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      internal_retries INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      run_id TEXT REFERENCES generation_runs(id) ON DELETE SET NULL
    );

-- [table] import_export_logs
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

-- [table] location_knowledge_profiles
CREATE TABLE IF NOT EXISTS location_knowledge_profiles (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, map_point_id TEXT NOT NULL UNIQUE,
      location_name TEXT DEFAULT '', location_alias TEXT DEFAULT '', location_type TEXT DEFAULT '', parent_location_id TEXT DEFAULT '', hierarchy_path TEXT DEFAULT '',
      basic_description TEXT DEFAULT '', visual_features TEXT DEFAULT '', sound_smell_texture TEXT DEFAULT '', atmosphere TEXT DEFAULT '', symbolic_meaning TEXT DEFAULT '',
      geography_position TEXT DEFAULT '', distance_logic TEXT DEFAULT '', traffic_routes TEXT DEFAULT '', entry_conditions TEXT DEFAULT '', exit_conditions TEXT DEFAULT '', hidden_paths TEXT DEFAULT '',
      owner_force TEXT DEFAULT '', controlling_character TEXT DEFAULT '', public_identity TEXT DEFAULT '', secret_identity TEXT DEFAULT '', security_level TEXT DEFAULT '', surveillance_level TEXT DEFAULT '',
      location_function TEXT DEFAULT '', plot_function TEXT DEFAULT '', conflict_function TEXT DEFAULT '', foreshadowing_function TEXT DEFAULT '', resource_function TEXT DEFAULT '', encounter_function TEXT DEFAULT '',
      current_status TEXT DEFAULT '', status_reason TEXT DEFAULT '', danger_level TEXT DEFAULT '', forbidden_behaviors TEXT DEFAULT '', rules_inside TEXT DEFAULT '', punishment_inside TEXT DEFAULT '',
      available_resources TEXT DEFAULT '', scarce_resources TEXT DEFAULT '', special_items TEXT DEFAULT '', trade_value TEXT DEFAULT '', strategic_value TEXT DEFAULT '',
      historical_events TEXT DEFAULT '', past_disaster TEXT DEFAULT '', war_memory TEXT DEFAULT '', lost_truth TEXT DEFAULT '', secret_buried_here TEXT DEFAULT '',
      connected_characters TEXT DEFAULT '', connected_forces TEXT DEFAULT '', connected_foreshadowing TEXT DEFAULT '', connected_chapters TEXT DEFAULT '', connected_world_rules TEXT DEFAULT '',
      scene_hooks TEXT DEFAULT '', sensory_anchor TEXT DEFAULT '', first_arrival_impression TEXT DEFAULT '', revisit_changes TEXT DEFAULT '', climax_usage TEXT DEFAULT '',
      must_obey_rules TEXT DEFAULT '', can_change_rules TEXT DEFAULT '', forbidden_writing TEXT DEFAULT '', easy_to_break_points TEXT DEFAULT '', current_chapter_usage TEXT DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    , key_landmarks TEXT DEFAULT '', controlling_force TEXT DEFAULT '', resources_scarcity TEXT DEFAULT '', secrets_foreshadow TEXT DEFAULT '');

-- [table] location_knowledge_relations
CREATE TABLE IF NOT EXISTS location_knowledge_relations (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, source_location_id TEXT NOT NULL, target_location_id TEXT NOT NULL,
      relation_type TEXT NOT NULL, relation_description TEXT DEFAULT '', distance_cost TEXT DEFAULT '', travel_time TEXT DEFAULT '', travel_method TEXT DEFAULT '', risk_level TEXT DEFAULT '', access_condition TEXT DEFAULT '', is_hidden INTEGER DEFAULT 0, is_one_way INTEGER DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );

-- [table] map_points
CREATE TABLE IF NOT EXISTS map_points (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT '',
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, parent_id TEXT, level TEXT DEFAULT 'location', coordinates TEXT, linked_chapter_ids TEXT DEFAULT '[]', linked_character_ids TEXT DEFAULT '[]', climate TEXT DEFAULT '', resources TEXT DEFAULT '[]', significance TEXT DEFAULT '', sensory_detail TEXT DEFAULT '',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

-- [table] model_configs
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

-- [table] organizations
CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT '',
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, parent_id TEXT, level TEXT DEFAULT '', leader TEXT DEFAULT '', strength_level INTEGER DEFAULT 0, territory TEXT DEFAULT '', characteristics TEXT DEFAULT '', relationships_json TEXT DEFAULT '[]', signature_equipment TEXT DEFAULT '',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

-- [table] outlines
CREATE TABLE IF NOT EXISTS "outlines" (
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
    foreshadowing_ids TEXT DEFAULT '[]',
    plot_points TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'planned',
    character_ids TEXT DEFAULT '[]',
    scenes TEXT,
    volumes TEXT,
    book_skeleton TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    core_content TEXT,
    scenes_detail TEXT,
    character_actions TEXT,
    conflicts TEXT,
    excitement TEXT,
    foreshadowing_setting TEXT,
    foreshadowing_recycling TEXT,
    ending_hook TEXT,
    emotion_tone TEXT,
    detail_json TEXT DEFAULT '{}',
    attention_json TEXT,
    plan_json TEXT,
    chapter_type TEXT,
    pov_ratio TEXT,
    hot_scenes TEXT,
    setback_scenes TEXT,
    ending_setup TEXT,
    data_tracking TEXT,
    highlight_points TEXT,
    system_hints TEXT,
    timeline TEXT,
    location_summary TEXT,
    conflict_design TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES outlines(id) ON DELETE SET NULL
  );

-- [table] plot_progress
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
    , needs_review INTEGER DEFAULT 0, reviewed_by TEXT, reviewed_at TEXT);

-- [table] projects
CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'long_novel',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      target_words INTEGER NOT NULL DEFAULT 0,
      current_words INTEGER NOT NULL DEFAULT 0,
      -- 历史列：platform 维的旧列名，已由 target_platform 取代，只作为写入投影存在（口径见 creative-constitution.ts）。
      -- 默认值必须与 target_platform 的 DEFAULT 同值（'generic'）：曾误留旧默认 'fantasy'，
      -- 任何未显式赋值的插入都会让旧列与新列分叉，旧导出包/旧脚本会读到"玄幻"。
      platform_style TEXT DEFAULT 'generic',
      description TEXT,
      writing_style TEXT,           -- JSON: WritingStyleConfig
      settings TEXT NOT NULL,       -- JSON: ProjectSettings
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    , target_platform TEXT DEFAULT 'generic', current_workflow_stage TEXT);

-- [table] prompt_templates
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

-- [table] state_confirmations
CREATE TABLE IF NOT EXISTS state_confirmations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_chapter_id TEXT,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_label TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT NOT NULL DEFAULT 'auto_extract',
      confirmed_by TEXT,
      confirmed_at TEXT,
      rejected_by TEXT,
      rejected_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

-- [table] state_impact_items
CREATE TABLE IF NOT EXISTS state_impact_items (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      impact_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_label TEXT,
      summary TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      action_hint TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      applied_at TEXT,
      payload TEXT DEFAULT '{}',
      FOREIGN KEY (report_id) REFERENCES state_impact_reports(id) ON DELETE CASCADE
    );

-- [table] state_impact_reports
CREATE TABLE IF NOT EXISTS state_impact_reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_state_item_id TEXT,
      source_type TEXT NOT NULL DEFAULT 'manual_edit',
      summary TEXT NOT NULL,
      risk_level TEXT NOT NULL DEFAULT 'low',
      status TEXT NOT NULL DEFAULT 'open',
      created_by TEXT DEFAULT 'author',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      payload TEXT DEFAULT '{}',
      FOREIGN KEY (source_state_item_id) REFERENCES state_items(id) ON DELETE SET NULL
    );

-- [table] state_items
CREATE TABLE IF NOT EXISTS state_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'ai',
      source_id TEXT,
      source_chapter_id TEXT,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_label TEXT,
      state_key TEXT,
      title TEXT,
      summary TEXT NOT NULL,
      content TEXT,
      payload TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      authority TEXT NOT NULL DEFAULT 'soft_candidate',
      source TEXT NOT NULL DEFAULT 'ai_extracted',
      confidence REAL DEFAULT 0.6,
      tags TEXT DEFAULT '[]',
      impact_scope TEXT DEFAULT '[]',
      summary_hash TEXT NOT NULL,
      created_by TEXT DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_by TEXT,
      confirmed_at TEXT,
      rejected_by TEXT,
      rejected_at TEXT,
      archived_at TEXT
    );

-- [table] state_versions
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

-- [table] story_dict
CREATE TABLE IF NOT EXISTS story_dict (
      id TEXT PRIMARY KEY,
      dict_type TEXT NOT NULL,
      parent_label TEXT,
      label TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_custom INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(dict_type, label)
    );

-- [table] timeline_causality_links
CREATE TABLE IF NOT EXISTS timeline_causality_links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_event_id TEXT NOT NULL,
      target_event_id TEXT NOT NULL,
      link_type TEXT NOT NULL DEFAULT 'cause',
      summary TEXT,
      evidence TEXT,
      risk_level TEXT NOT NULL DEFAULT 'none',
      risk_reason TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending',
      locked INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- [table] timeline_chapter_tasks
CREATE TABLE IF NOT EXISTS timeline_chapter_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      task_type TEXT NOT NULL DEFAULT 'check_order',
      priority TEXT NOT NULL DEFAULT 'medium',
      instruction TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      review_status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual',
      locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- [table] timeline_events
CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      timeline_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      event_date TEXT,
      event_type TEXT DEFAULT 'story',
      importance INTEGER DEFAULT 1,
      related_character_ids TEXT,
      related_chapter_ids TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, time_model_json TEXT DEFAULT '{}', causality_json TEXT DEFAULT '{}', visibility_json TEXT DEFAULT '{}',
      FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE
    );

-- [table] timeline_three_line_events
CREATE TABLE IF NOT EXISTS timeline_three_line_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      legacy_timeline_event_id TEXT,
      title TEXT NOT NULL,
      summary TEXT,
      line_type TEXT NOT NULL DEFAULT 'story_time',
      chapter_id TEXT,
      volume_index INTEGER,
      chapter_index INTEGER,
      story_time_text TEXT,
      story_time_order REAL,
      narrative_order INTEGER,
      causality_order INTEGER,
      location TEXT,
      participants_character_ids TEXT DEFAULT '[]',
      related_relationship_ids TEXT DEFAULT '[]',
      related_foreshadowing_ids TEXT DEFAULT '[]',
      related_world_rule_ids TEXT DEFAULT '[]',
      reader_known_state TEXT NOT NULL DEFAULT 'unknown',
      character_known_state TEXT NOT NULL DEFAULT 'unknown',
      status TEXT NOT NULL DEFAULT 'planned',
      risk_level TEXT NOT NULL DEFAULT 'none',
      risk_reason TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending',
      locked INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- [table] timelines
CREATE TABLE IF NOT EXISTS timelines (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

-- [table] version_history
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

-- [table] world_rule_chapter_tasks
CREATE TABLE IF NOT EXISTS world_rule_chapter_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      task_type TEXT NOT NULL DEFAULT 'check',
      priority TEXT NOT NULL DEFAULT 'medium',
      instruction TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      review_status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual',
      locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- [table] world_rule_events
CREATE TABLE IF NOT EXISTS world_rule_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      chapter_id TEXT,
      event_type TEXT NOT NULL DEFAULT 'other',
      summary TEXT,
      evidence TEXT,
      impact TEXT,
      before_state_json TEXT DEFAULT '{}',
      after_state_json TEXT DEFAULT '{}',
      review_status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- [table] world_rules
CREATE TABLE IF NOT EXISTS world_rules (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      rule_type TEXT NOT NULL DEFAULT 'law',
      scope TEXT NOT NULL DEFAULT 'full_book',
      volume_index INTEGER,
      content TEXT,
      explanation TEXT,
      limitation TEXT,
      contradiction_risk TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      risk_level TEXT NOT NULL DEFAULT 'none',
      first_established_chapter_id TEXT,
      last_verified_chapter_id TEXT,
      related_character_ids TEXT DEFAULT '[]',
      related_relationship_ids TEXT DEFAULT '[]',
      related_foreshadowing_ids TEXT DEFAULT '[]',
      related_timeline_event_ids TEXT DEFAULT '[]',
      review_status TEXT NOT NULL DEFAULT 'pending',
      locked INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

-- [table] world_settings
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
      updated_at TEXT NOT NULL, rules TEXT DEFAULT '[]', atmosphere TEXT DEFAULT '', story_premise TEXT DEFAULT '', locations TEXT DEFAULT '[]', social_rules TEXT DEFAULT '', special_settings TEXT DEFAULT '', setting_type TEXT DEFAULT 'full', rule_system_json TEXT DEFAULT '{}', naming_rules TEXT DEFAULT '{}', work_intro TEXT DEFAULT '{}', system_settings TEXT DEFAULT '{}', data_planning TEXT DEFAULT '{}', cultural_settings TEXT DEFAULT '{}', spoiler_settings TEXT DEFAULT '{}', censorship_rules TEXT DEFAULT '{}',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

-- [table] world_system_profiles
CREATE TABLE IF NOT EXISTS world_system_profiles (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, world_setting_id TEXT NOT NULL UNIQUE,
      story_premise TEXT DEFAULT '', core_theme TEXT DEFAULT '', reader_promise TEXT DEFAULT '', genre_type TEXT DEFAULT '', tone_style TEXT DEFAULT '',
      era_background TEXT DEFAULT '', time_span TEXT DEFAULT '', calendar_system TEXT DEFAULT '', historical_stage TEXT DEFAULT '', current_world_status TEXT DEFAULT '',
      geography_structure TEXT DEFAULT '', major_regions TEXT DEFAULT '', dangerous_zones TEXT DEFAULT '', resource_distribution TEXT DEFAULT '', traffic_routes TEXT DEFAULT '', distance_logic TEXT DEFAULT '',
      social_structure TEXT DEFAULT '', class_system TEXT DEFAULT '', family_structure TEXT DEFAULT '', occupation_system TEXT DEFAULT '', education_system TEXT DEFAULT '', social_mobility TEXT DEFAULT '',
      political_structure TEXT DEFAULT '', ruling_system TEXT DEFAULT '', law_system TEXT DEFAULT '', bureaucracy TEXT DEFAULT '', military_system TEXT DEFAULT '', tax_system TEXT DEFAULT '',
      economic_system TEXT DEFAULT '', currency_system TEXT DEFAULT '', trade_rules TEXT DEFAULT '', resource_rules TEXT DEFAULT '', black_market TEXT DEFAULT '', scarcity_logic TEXT DEFAULT '',
      power_system TEXT DEFAULT '', power_source TEXT DEFAULT '', power_levels TEXT DEFAULT '', power_cost TEXT DEFAULT '', power_limit TEXT DEFAULT '', power_growth TEXT DEFAULT '', power_taboo TEXT DEFAULT '', power_failure_case TEXT DEFAULT '',
      technology_system TEXT DEFAULT '', technology_level TEXT DEFAULT '', special_technology TEXT DEFAULT '', technology_limit TEXT DEFAULT '', technology_cost TEXT DEFAULT '',
      culture_daily_life TEXT DEFAULT '', food_clothing_housing TEXT DEFAULT '', festival_customs TEXT DEFAULT '', religion_belief TEXT DEFAULT '', language_naming_rules TEXT DEFAULT '', etiquette_rules TEXT DEFAULT '',
      law_and_taboo TEXT DEFAULT '', forbidden_behaviors TEXT DEFAULT '', punishment_rules TEXT DEFAULT '', public_order TEXT DEFAULT '', hidden_rules TEXT DEFAULT '', unspoken_rules TEXT DEFAULT '',
      history_events TEXT DEFAULT '', major_disasters TEXT DEFAULT '', founding_events TEXT DEFAULT '', wars TEXT DEFAULT '', dynasty_changes TEXT DEFAULT '', lost_truths TEXT DEFAULT '',
      major_forces TEXT DEFAULT '', force_relations TEXT DEFAULT '', force_conflicts TEXT DEFAULT '', force_resources TEXT DEFAULT '', force_secrets TEXT DEFAULT '',
      world_hooks TEXT DEFAULT '', main_conflict_source TEXT DEFAULT '', hidden_truth TEXT DEFAULT '', final_truth_direction TEXT DEFAULT '', world_mystery TEXT DEFAULT '',
      forbidden_world_rules TEXT DEFAULT '', must_obey_rules TEXT DEFAULT '', can_change_rules TEXT DEFAULT '', easy_to_break_points TEXT DEFAULT '', current_chapter_usage TEXT DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    , era TEXT DEFAULT '', locations TEXT DEFAULT '', atmosphere_tone TEXT DEFAULT '', rules TEXT DEFAULT '', tech_supernatural TEXT DEFAULT '', culture_customs TEXT DEFAULT '', supplementary TEXT DEFAULT '', synopsis TEXT DEFAULT '', basic_info TEXT DEFAULT '', system_mechanics TEXT DEFAULT '', naming_rules TEXT DEFAULT '', scale_plan TEXT DEFAULT '', ending TEXT DEFAULT '', hierarchy_rules TEXT DEFAULT '', economy_system TEXT DEFAULT '', factions TEXT DEFAULT '', custom_settings TEXT DEFAULT '');

-- [table] writing_quality_issues
CREATE TABLE IF NOT EXISTS writing_quality_issues (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      chapter_id TEXT,
      issue_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      evidence TEXT,
      suggestion TEXT,
      paragraph_index INTEGER,
      sentence_index INTEGER,
      start_offset INTEGER,
      end_offset INTEGER,
      original_text TEXT,
      suggested_text TEXT,
      tags TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'open',
      payload TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolved_by TEXT, latest_revision_id TEXT, recheck_result_json TEXT DEFAULT '{}', navigation_json TEXT DEFAULT '{}', status_history_json TEXT DEFAULT '[]',
      FOREIGN KEY (report_id) REFERENCES writing_quality_reports(id) ON DELETE CASCADE
    );

-- [table] writing_quality_reports
CREATE TABLE IF NOT EXISTS writing_quality_reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT,
      source_type TEXT NOT NULL DEFAULT 'manual_check',
      source_id TEXT,
      scope TEXT NOT NULL DEFAULT 'chapter',
      title TEXT,
      summary TEXT,
      overall_level TEXT NOT NULL DEFAULT 'medium',
      overall_score INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      model TEXT,
      payload TEXT DEFAULT '{}',
      created_by TEXT DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    , attention_json TEXT DEFAULT '{}', view_state_json TEXT DEFAULT '{}');

-- [table] writing_revision_records
CREATE TABLE IF NOT EXISTS writing_revision_records (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      issue_id TEXT,
      report_id TEXT,
      revision_type TEXT NOT NULL DEFAULT 'local_refine',
      before_text TEXT NOT NULL,
      after_text TEXT NOT NULL,
      diff_json TEXT DEFAULT '{}',
      applied INTEGER NOT NULL DEFAULT 0,
      applied_at TEXT,
      reverted INTEGER NOT NULL DEFAULT 0,
      reverted_at TEXT,
      payload TEXT DEFAULT '{}',
      created_by TEXT DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    , recheck_result_json TEXT DEFAULT '{}', can_apply INTEGER DEFAULT 1);

-- [index] idx_aggregate_summary_states_project
CREATE INDEX IF NOT EXISTS idx_aggregate_summary_states_project
      ON aggregate_summary_states(project_id, scope, stale);

-- [index] idx_aggregate_summary_states_project_scope_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_aggregate_summary_states_project_scope_key ON aggregate_summary_states(project_id, scope_key);

-- [index] idx_canonical_sync_project_status
CREATE INDEX IF NOT EXISTS idx_canonical_sync_project_status
      ON canonical_entity_sync_states(project_id, needs_resync, index_status);

-- [index] idx_ch_project
CREATE INDEX IF NOT EXISTS idx_ch_project ON chapters(project_id);

-- [index] idx_ch_status
CREATE INDEX IF NOT EXISTS idx_ch_status ON chapters(status);

-- [index] idx_ch_volume
CREATE INDEX IF NOT EXISTS idx_ch_volume ON chapters(project_id, volume_index, chapter_index);

-- [index] idx_chapter_continuity_reviews_gate
CREATE INDEX IF NOT EXISTS idx_chapter_continuity_reviews_gate
      ON chapter_continuity_reviews(project_id, chapter_id, content_checksum, blocks_lock, status);

-- [index] idx_chapter_derived_sync_pending
CREATE INDEX IF NOT EXISTS idx_chapter_derived_sync_pending
      ON chapter_derived_sync_states(project_id, needs_resync);

-- [index] idx_chapter_summaries_project
CREATE INDEX IF NOT EXISTS idx_chapter_summaries_project
      ON chapter_summaries(project_id, status);

-- [index] idx_char_name
CREATE INDEX IF NOT EXISTS idx_char_name ON characters(name);

-- [index] idx_char_pov
CREATE INDEX IF NOT EXISTS idx_char_pov ON characters(is_pov_character);

-- [index] idx_char_project
CREATE INDEX IF NOT EXISTS idx_char_project ON characters(project_id);

-- [index] idx_character_evolution_project_character
CREATE INDEX IF NOT EXISTS idx_character_evolution_project_character
      ON character_evolution_events(project_id, character_id, chapter_index);

-- [index] idx_character_evolution_state_item
CREATE INDEX IF NOT EXISTS idx_character_evolution_state_item
      ON character_evolution_events(source_state_item_id);

-- [index] idx_character_extended_profiles_project
CREATE INDEX IF NOT EXISTS idx_character_extended_profiles_project ON character_extended_profiles(project_id);

-- [index] idx_character_profile_changes_char
CREATE INDEX IF NOT EXISTS idx_character_profile_changes_char ON character_profile_changes(project_id, character_id);

-- [index] idx_character_relationship_events_chapter
CREATE INDEX IF NOT EXISTS idx_character_relationship_events_chapter
      ON character_relationship_events(project_id, chapter_id);

-- [index] idx_character_relationship_events_relationship
CREATE INDEX IF NOT EXISTS idx_character_relationship_events_relationship
      ON character_relationship_events(project_id, relationship_id);

-- [index] idx_character_relationship_project
CREATE INDEX IF NOT EXISTS idx_character_relationship_project
      ON character_relationships(project_id);

-- [index] idx_character_relationship_source
CREATE INDEX IF NOT EXISTS idx_character_relationship_source
      ON character_relationships(project_id, source_character_id);

-- [index] idx_character_relationship_target
CREATE INDEX IF NOT EXISTS idx_character_relationship_target
      ON character_relationships(project_id, target_character_id);

-- [index] idx_character_relationship_unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_character_relationship_unique
      ON character_relationships(project_id, source_character_id, target_character_id, relation_type);

-- [index] idx_character_state_project_chapter
CREATE INDEX IF NOT EXISTS idx_character_state_project_chapter
      ON character_state_snapshots(project_id, chapter_id);

-- [index] idx_character_state_project_character
CREATE INDEX IF NOT EXISTS idx_character_state_project_character
      ON character_state_snapshots(project_id, character_id);

-- [index] idx_character_state_review
CREATE INDEX IF NOT EXISTS idx_character_state_review
      ON character_state_snapshots(project_id, review_status);

-- [index] idx_cs_char
CREATE INDEX IF NOT EXISTS idx_cs_char ON character_states(character_id, snapshot_order);

-- [index] idx_cs_project
CREATE INDEX IF NOT EXISTS idx_cs_project ON character_states(project_id);

-- [index] idx_cs_review
CREATE INDEX IF NOT EXISTS idx_cs_review ON character_states(needs_review);

-- [index] idx_dict_parent
CREATE INDEX IF NOT EXISTS idx_dict_parent ON story_dict(parent_label);

-- [index] idx_dict_type
CREATE INDEX IF NOT EXISTS idx_dict_type ON story_dict(dict_type);

-- [index] idx_dws_key
CREATE INDEX IF NOT EXISTS idx_dws_key ON dual_write_store(data_key);

-- [index] idx_fl_project
CREATE INDEX IF NOT EXISTS idx_fl_project ON field_locks(project_id);

-- [index] idx_fl_state
CREATE INDEX IF NOT EXISTS idx_fl_state ON field_locks(state_type, state_id);

-- [index] idx_foreshadowing_events_chapter
CREATE INDEX IF NOT EXISTS idx_foreshadowing_events_chapter
      ON foreshadowing_lifecycle_events(project_id, chapter_id);

-- [index] idx_foreshadowing_events_thread
CREATE INDEX IF NOT EXISTS idx_foreshadowing_events_thread
      ON foreshadowing_lifecycle_events(project_id, thread_id);

-- [index] idx_foreshadowing_tasks_chapter
CREATE INDEX IF NOT EXISTS idx_foreshadowing_tasks_chapter
      ON foreshadowing_chapter_tasks(project_id, chapter_id);

-- [index] idx_foreshadowing_tasks_review
CREATE INDEX IF NOT EXISTS idx_foreshadowing_tasks_review
      ON foreshadowing_chapter_tasks(project_id, review_status);

-- [index] idx_foreshadowing_tasks_thread
CREATE INDEX IF NOT EXISTS idx_foreshadowing_tasks_thread
      ON foreshadowing_chapter_tasks(project_id, thread_id);

-- [index] idx_foreshadowing_threads_project
CREATE INDEX IF NOT EXISTS idx_foreshadowing_threads_project
      ON foreshadowing_threads(project_id);

-- [index] idx_foreshadowing_threads_review
CREATE INDEX IF NOT EXISTS idx_foreshadowing_threads_review
      ON foreshadowing_threads(project_id, review_status);

-- [index] idx_foreshadowing_threads_status
CREATE INDEX IF NOT EXISTS idx_foreshadowing_threads_status
      ON foreshadowing_threads(project_id, status);

-- [index] idx_fs_chapter
CREATE INDEX IF NOT EXISTS idx_fs_chapter ON foreshadowings(buried_chapter_index);

-- [index] idx_fs_project
CREATE INDEX IF NOT EXISTS idx_fs_project ON foreshadowings(project_id);

-- [index] idx_fs_status
CREATE INDEX IF NOT EXISTS idx_fs_status ON foreshadowings(status);

-- [index] idx_fss_review
CREATE INDEX IF NOT EXISTS idx_fss_review
    ON foreshadowing_states(project_id, needs_review);

-- [index] idx_generation_lessons_project
CREATE INDEX IF NOT EXISTS idx_generation_lessons_project ON generation_lessons(project_id);

-- [index] idx_generation_runs_project
CREATE INDEX IF NOT EXISTS idx_generation_runs_project ON generation_runs(project_id, started_at);

-- [index] idx_generation_repairs_project
CREATE INDEX IF NOT EXISTS idx_generation_repairs_project ON generation_repairs(project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_repair_strategy_lookup
      ON repair_strategy_stats(rule_id,platform,genre,story_type,model,prompt_version);

CREATE INDEX IF NOT EXISTS idx_quality_benchmark_group
      ON quality_benchmark_samples(story_type,platform,annotation_status);

CREATE INDEX IF NOT EXISTS idx_benchmark_runs_project
      ON quality_benchmark_runs(project_id,started_at);

-- [index] idx_generation_step_run
CREATE INDEX IF NOT EXISTS idx_generation_step_run ON generation_step_metrics(run_id);

-- [index] idx_gsm_created
CREATE INDEX IF NOT EXISTS idx_gsm_created
      ON generation_step_metrics(created_at);

-- [index] idx_gsm_project_time
CREATE INDEX IF NOT EXISTS idx_gsm_project_time
      ON generation_step_metrics(project_id, created_at);

-- [index] idx_gsm_step_time
CREATE INDEX IF NOT EXISTS idx_gsm_step_time
      ON generation_step_metrics(step_key, created_at);

-- [index] idx_location_knowledge_profiles_project
CREATE INDEX IF NOT EXISTS idx_location_knowledge_profiles_project ON location_knowledge_profiles(project_id);

-- [index] idx_location_knowledge_relations_source
CREATE INDEX IF NOT EXISTS idx_location_knowledge_relations_source ON location_knowledge_relations(project_id, source_location_id);

-- [index] idx_map_level
CREATE INDEX IF NOT EXISTS idx_map_level ON map_points(level);

-- [index] idx_map_parent
CREATE INDEX IF NOT EXISTS idx_map_parent ON map_points(parent_id);

-- [index] idx_map_project
CREATE INDEX IF NOT EXISTS idx_map_project ON map_points(project_id);

-- [index] idx_org_parent
CREATE INDEX IF NOT EXISTS idx_org_parent ON organizations(parent_id);

-- [index] idx_org_project
CREATE INDEX IF NOT EXISTS idx_org_project ON organizations(project_id);

-- [index] idx_out_order
CREATE INDEX IF NOT EXISTS idx_out_order ON outlines("order");

-- [index] idx_out_parent
CREATE INDEX IF NOT EXISTS idx_out_parent ON outlines(parent_id);

-- [index] idx_out_project
CREATE INDEX IF NOT EXISTS idx_out_project ON outlines(project_id);

-- [index] idx_out_status
CREATE INDEX IF NOT EXISTS idx_out_status ON outlines(status);

-- [index] idx_pp_chapter
CREATE INDEX IF NOT EXISTS idx_pp_chapter ON plot_progress(chapter_index);

-- [index] idx_pp_project
CREATE INDEX IF NOT EXISTS idx_pp_project ON plot_progress(project_id);

-- [index] idx_pp_review
CREATE INDEX IF NOT EXISTS idx_pp_review
    ON plot_progress(project_id, needs_review);

-- [index] idx_sc_chapter
CREATE INDEX IF NOT EXISTS idx_sc_chapter ON state_confirmations(project_id, source_chapter_id);

-- [index] idx_sc_project_status
CREATE INDEX IF NOT EXISTS idx_sc_project_status ON state_confirmations(project_id, status);

-- [index] idx_sc_target
CREATE INDEX IF NOT EXISTS idx_sc_target ON state_confirmations(project_id, target_type, target_id);

-- [index] idx_state_impact_items_report
CREATE INDEX IF NOT EXISTS idx_state_impact_items_report
      ON state_impact_items(report_id, status);

-- [index] idx_state_impact_reports_project
CREATE INDEX IF NOT EXISTS idx_state_impact_reports_project
      ON state_impact_reports(project_id, status, created_at);

-- [index] idx_state_items_dedupe
CREATE UNIQUE INDEX IF NOT EXISTS idx_state_items_dedupe
      ON state_items(project_id, target_type, IFNULL(target_id, ''), summary_hash);

-- [index] idx_state_items_project_status
CREATE INDEX IF NOT EXISTS idx_state_items_project_status
      ON state_items(project_id, status, updated_at);

-- [index] idx_state_items_source_chapter
CREATE INDEX IF NOT EXISTS idx_state_items_source_chapter
      ON state_items(project_id, source_chapter_id);

-- [index] idx_state_items_target
CREATE INDEX IF NOT EXISTS idx_state_items_target
      ON state_items(project_id, target_type, target_id);

-- [index] idx_sv_state
CREATE INDEX IF NOT EXISTS idx_sv_state ON state_versions(state_type, state_id);

-- [index] idx_sv_version
CREATE INDEX IF NOT EXISTS idx_sv_version ON state_versions(version);

-- [index] idx_timeline_causality_source
CREATE INDEX IF NOT EXISTS idx_timeline_causality_source
      ON timeline_causality_links(project_id, source_event_id);

-- [index] idx_timeline_causality_target
CREATE INDEX IF NOT EXISTS idx_timeline_causality_target
      ON timeline_causality_links(project_id, target_event_id);

-- [index] idx_timeline_events_chapter
CREATE INDEX IF NOT EXISTS idx_timeline_events_chapter
      ON timeline_three_line_events(project_id, chapter_id);

-- [index] idx_timeline_events_date
CREATE INDEX IF NOT EXISTS idx_timeline_events_date ON timeline_events(event_date);

-- [index] idx_timeline_events_line_type
CREATE INDEX IF NOT EXISTS idx_timeline_events_line_type
      ON timeline_three_line_events(project_id, line_type);

-- [index] idx_timeline_events_project
CREATE INDEX IF NOT EXISTS idx_timeline_events_project
      ON timeline_three_line_events(project_id);

-- [index] idx_timeline_events_review
CREATE INDEX IF NOT EXISTS idx_timeline_events_review
      ON timeline_three_line_events(project_id, review_status);

-- [index] idx_timeline_events_timeline
CREATE INDEX IF NOT EXISTS idx_timeline_events_timeline ON timeline_events(timeline_id);

-- [index] idx_timeline_tasks_chapter
CREATE INDEX IF NOT EXISTS idx_timeline_tasks_chapter
      ON timeline_chapter_tasks(project_id, chapter_id);

-- [index] idx_timeline_tasks_event
CREATE INDEX IF NOT EXISTS idx_timeline_tasks_event
      ON timeline_chapter_tasks(project_id, event_id);

-- [index] idx_timeline_tasks_review
CREATE INDEX IF NOT EXISTS idx_timeline_tasks_review
      ON timeline_chapter_tasks(project_id, review_status);

-- [index] idx_timelines_project
CREATE INDEX IF NOT EXISTS idx_timelines_project ON timelines(project_id);

-- [index] idx_vh_entity
CREATE INDEX IF NOT EXISTS idx_vh_entity ON version_history(entity_type, entity_id, version);

-- [index] idx_world_project
CREATE INDEX IF NOT EXISTS idx_world_project ON world_settings(project_id);

-- [index] idx_world_rule_events_chapter
CREATE INDEX IF NOT EXISTS idx_world_rule_events_chapter
      ON world_rule_events(project_id, chapter_id);

-- [index] idx_world_rule_events_rule
CREATE INDEX IF NOT EXISTS idx_world_rule_events_rule
      ON world_rule_events(project_id, rule_id);

-- [index] idx_world_rule_tasks_chapter
CREATE INDEX IF NOT EXISTS idx_world_rule_tasks_chapter
      ON world_rule_chapter_tasks(project_id, chapter_id);

-- [index] idx_world_rule_tasks_review
CREATE INDEX IF NOT EXISTS idx_world_rule_tasks_review
      ON world_rule_chapter_tasks(project_id, review_status);

-- [index] idx_world_rule_tasks_rule
CREATE INDEX IF NOT EXISTS idx_world_rule_tasks_rule
      ON world_rule_chapter_tasks(project_id, rule_id);

-- [index] idx_world_rules_project
CREATE INDEX IF NOT EXISTS idx_world_rules_project
      ON world_rules(project_id);

-- [index] idx_world_rules_review
CREATE INDEX IF NOT EXISTS idx_world_rules_review
      ON world_rules(project_id, review_status);

-- [index] idx_world_rules_status
CREATE INDEX IF NOT EXISTS idx_world_rules_status
      ON world_rules(project_id, status);

-- [index] idx_world_rules_type
CREATE INDEX IF NOT EXISTS idx_world_rules_type
      ON world_rules(project_id, rule_type);

-- [index] idx_world_system_profiles_project
CREATE INDEX IF NOT EXISTS idx_world_system_profiles_project ON world_system_profiles(project_id);

-- [index] idx_wqi_latest_revision
CREATE INDEX IF NOT EXISTS idx_wqi_latest_revision
      ON writing_quality_issues(latest_revision_id);

-- [index] idx_wqi_project_chapter_severity
CREATE INDEX IF NOT EXISTS idx_wqi_project_chapter_severity
      ON writing_quality_issues(project_id, chapter_id, severity);

-- [index] idx_wqi_project_issue_type
CREATE INDEX IF NOT EXISTS idx_wqi_project_issue_type
      ON writing_quality_issues(project_id, issue_type);

-- [index] idx_wqi_project_status
CREATE INDEX IF NOT EXISTS idx_wqi_project_status
      ON writing_quality_issues(project_id, status);

-- [index] idx_wqi_report_status
CREATE INDEX IF NOT EXISTS idx_wqi_report_status
      ON writing_quality_issues(report_id, status);

-- [index] idx_wqr_project_chapter
CREATE INDEX IF NOT EXISTS idx_wqr_project_chapter
      ON writing_quality_reports(project_id, chapter_id, created_at);

-- [index] idx_wqr_project_status
CREATE INDEX IF NOT EXISTS idx_wqr_project_status
      ON writing_quality_reports(project_id, status, created_at);

-- [index] idx_wrr_issue
CREATE INDEX IF NOT EXISTS idx_wrr_issue
      ON writing_revision_records(issue_id);

-- [index] idx_wrr_project_chapter
CREATE INDEX IF NOT EXISTS idx_wrr_project_chapter
      ON writing_revision_records(project_id, chapter_id, created_at);

-- [index] idx_wrr_report
CREATE INDEX IF NOT EXISTS idx_wrr_report
      ON writing_revision_records(report_id);
`;

/** 历史上通过 ALTER 追加、老库可能缺失的列，幂等补齐（新库建表后也走这里，保证结构一致）。 */
function ensureBackfilledColumns(db: DatabaseSync): void {
  const chapterCols = (db.prepare('PRAGMA table_info(chapters)').all() as Array<{ name: string }>).map(c => c.name);
  if (!chapterCols.includes('auto_quality_status')) db.exec('ALTER TABLE chapters ADD COLUMN auto_quality_status TEXT;');
  if (!chapterCols.includes('auto_quality_message')) db.exec('ALTER TABLE chapters ADD COLUMN auto_quality_message TEXT;');
  if (!chapterCols.includes('auto_quality_at')) db.exec('ALTER TABLE chapters ADD COLUMN auto_quality_at TEXT;');
  const runCols = (db.prepare('PRAGMA table_info(generation_runs)').all() as Array<{ name: string }>).map(c => c.name);
  for (const [name, sqlType] of [['context_snapshot', 'TEXT'], ['chapter_index', 'INTEGER'], ['standards_snapshot', 'TEXT'], ['quality_payload', 'TEXT']] as const) {
    if (!runCols.includes(name)) db.exec(`ALTER TABLE generation_runs ADD COLUMN ${name} ${sqlType};`);
  }
  const metricCols = (db.prepare('PRAGMA table_info(generation_step_metrics)').all() as Array<{ name: string }>).map(c => c.name);
  if (!metricCols.includes('run_id')) db.exec('ALTER TABLE generation_step_metrics ADD COLUMN run_id TEXT;');
  db.exec('CREATE INDEX IF NOT EXISTS idx_generation_step_run ON generation_step_metrics(run_id);');
  migrateLegacyConsistency(db);
  migrateLegacyConflictLogs(db);
  // 已废弃、无任何代码读写的历史表：老库对齐基线时幂等清除，全新库本就不再创建。
  for (const legacyTable of ['api_keys','chain_execution_logs','data_directory','prompt_chain_definitions','inspirations']) {
    db.exec(`DROP TABLE IF EXISTS "${legacyTable}";`);
  }
}

function migrateLegacyConsistency(db: DatabaseSync): void {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='consistency_checks'").get();
  if (!exists) return;
  const rows = db.prepare('SELECT * FROM consistency_checks').all() as any[];
  const reports = new Set<string>();
  const now = new Date().toISOString();
  for (const row of rows) {
    const source = String(row.source || 'deterministic_consistency');
    const scopeKey = `${row.project_id}:${row.chapter_index ?? 'project'}:${source}`;
    const reportId = `quality_${createHash('sha256').update(scopeKey).digest('hex')}`;
    const chapter = row.chapter_index == null ? null : db.prepare(
      'SELECT id FROM chapters WHERE project_id=? AND chapter_index=? ORDER BY created_at DESC LIMIT 1',
    ).get(row.project_id, row.chapter_index) as { id: string } | undefined;
    if (!reports.has(reportId)) {
      db.prepare(`INSERT OR IGNORE INTO writing_quality_reports
        (id,project_id,chapter_id,source_type,source_id,scope,title,summary,overall_level,status,payload,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        reportId, row.project_id, chapter?.id ?? null, `quality:${source}`, scopeKey, chapter ? 'chapter' : 'project',
        '历史一致性问题', '由旧冲突记录迁入', 'medium', 'open', JSON.stringify({ source, migrated: true }), now, now,
      );
      reports.add(reportId);
    }
    let details: unknown = null;
    try { details = JSON.parse(row.details || 'null'); } catch { details = null; }
    const issueType = ['originality', 'outline_alignment'].includes(row.check_type)
      ? row.check_type : `consistency.${row.check_type}`;
    const severity = row.severity === 'high' ? 'blocking' : row.severity === 'low' ? 'low' : 'medium';
    const status = row.resolved || row.status === 'resolved' ? 'resolved' : 'open';
    db.prepare(`INSERT OR IGNORE INTO writing_quality_issues
      (id,report_id,project_id,chapter_id,issue_type,severity,title,summary,status,payload,created_at,updated_at,resolved_at,resolved_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      row.id, reportId, row.project_id, chapter?.id ?? null, issueType, severity, row.message, row.message, status,
      JSON.stringify({ qualityIssue: { source, evaluation: 'insufficient_evidence' }, details }),
      row.created_at || row.detected_at || now, now, row.resolved_at || null, row.resolved_by || null,
    );
  }
  db.exec('DROP TABLE consistency_checks;');
}

function migrateLegacyConflictLogs(db: DatabaseSync): void {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='conflict_logs'").get();
  if (!exists) return;
  const rows = db.prepare('SELECT * FROM conflict_logs').all() as any[];
  const now = new Date().toISOString();
  for (const row of rows) {
    const scopeKey = `${row.project_id}:${row.chapter_id || 'project'}:legacy_conflict_log`;
    const reportId = `quality_${createHash('sha256').update(scopeKey).digest('hex')}`;
    db.prepare(`INSERT OR IGNORE INTO writing_quality_reports
      (id,project_id,chapter_id,source_type,source_id,scope,title,summary,overall_level,status,payload,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      reportId, row.project_id, row.chapter_id || null, 'quality:legacy_conflict_log', scopeKey,
      row.chapter_id ? 'chapter' : 'project', '历史冲突记录', '由旧冲突日志迁入', 'medium', 'open',
      JSON.stringify({ source: 'legacy_conflict_log', migrated: true }), now, now,
    );
    const priority = Number(row.priority || 3);
    const severity = priority <= 1 ? 'blocking' : priority === 2 ? 'high' : priority >= 4 ? 'low' : 'medium';
    const status = row.resolution ? 'resolved' : 'open';
    db.prepare(`INSERT OR IGNORE INTO writing_quality_issues
      (id,report_id,project_id,chapter_id,issue_type,severity,title,summary,status,payload,created_at,updated_at,resolved_at,resolved_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      row.id, reportId, row.project_id, row.chapter_id || null, `consistency.${row.type || 'legacy'}`,
      severity, row.description, row.description, status,
      JSON.stringify({ qualityIssue: { source: 'legacy_conflict_log', evaluation: 'insufficient_evidence' },
        entities: { sourceType: row.source_entity_type, sourceId: row.source_entity_id,
          conflictType: row.conflict_entity_type, conflictId: row.conflict_entity_id }, resolution: row.resolution || null }),
      row.created_at || now, now, row.resolved_at || null, row.resolution_by || null,
    );
  }
  db.exec('DROP TABLE conflict_logs;');
}

export function up(db: DatabaseSync): void {
  db.exec(SCHEMA_SQL);
  ensureBackfilledColumns(db);
}

export function down(db: DatabaseSync): void {
  // 回滚仅用于全新库的开发重置；会删除全部业务表，生产/有数据时不要执行。
  db.exec(`
  DROP TABLE IF EXISTS "aggregate_summary_states";
  DROP TABLE IF EXISTS "canonical_entity_sync_states";
  DROP TABLE IF EXISTS "chapter_continuity_reviews";
  DROP TABLE IF EXISTS "chapter_derived_sync_states";
  DROP TABLE IF EXISTS "chapter_summaries";
  DROP TABLE IF EXISTS "chapters";
  DROP TABLE IF EXISTS "character_evolution_events";
  DROP TABLE IF EXISTS "character_extended_profiles";
  DROP TABLE IF EXISTS "character_profile_changes";
  DROP TABLE IF EXISTS "character_relationship_events";
  DROP TABLE IF EXISTS "character_relationships";
  DROP TABLE IF EXISTS "character_state_snapshots";
  DROP TABLE IF EXISTS "character_states";
  DROP TABLE IF EXISTS "characters";
  DROP TABLE IF EXISTS "dual_write_store";
  DROP TABLE IF EXISTS "field_locks";
  DROP TABLE IF EXISTS "foreshadowing_chapter_tasks";
  DROP TABLE IF EXISTS "foreshadowing_lifecycle_events";
  DROP TABLE IF EXISTS "foreshadowing_states";
  DROP TABLE IF EXISTS "foreshadowing_threads";
  DROP TABLE IF EXISTS "foreshadowings";
  DROP TABLE IF EXISTS "generation_lessons";
  DROP TABLE IF EXISTS "generation_repairs";
  DROP TABLE IF EXISTS "repair_strategy_stats";
  DROP TABLE IF EXISTS "quality_execution_schema";
  DROP TABLE IF EXISTS "quality_benchmark_runs";
  DROP TABLE IF EXISTS "quality_benchmark_evaluations";
  DROP TABLE IF EXISTS "quality_benchmark_samples";
  DROP TABLE IF EXISTS "generation_step_metrics";
  DROP TABLE IF EXISTS "generation_runs";
  DROP TABLE IF EXISTS "import_export_logs";
  DROP TABLE IF EXISTS "location_knowledge_profiles";
  DROP TABLE IF EXISTS "location_knowledge_relations";
  DROP TABLE IF EXISTS "map_points";
  DROP TABLE IF EXISTS "model_configs";
  DROP TABLE IF EXISTS "organizations";
  DROP TABLE IF EXISTS "outlines";
  DROP TABLE IF EXISTS "plot_progress";
  DROP TABLE IF EXISTS "projects";
  DROP TABLE IF EXISTS "prompt_templates";
  DROP TABLE IF EXISTS "state_confirmations";
  DROP TABLE IF EXISTS "state_impact_items";
  DROP TABLE IF EXISTS "state_impact_reports";
  DROP TABLE IF EXISTS "state_items";
  DROP TABLE IF EXISTS "state_versions";
  DROP TABLE IF EXISTS "story_dict";
  DROP TABLE IF EXISTS "timeline_causality_links";
  DROP TABLE IF EXISTS "timeline_chapter_tasks";
  DROP TABLE IF EXISTS "timeline_events";
  DROP TABLE IF EXISTS "timeline_three_line_events";
  DROP TABLE IF EXISTS "timelines";
  DROP TABLE IF EXISTS "version_history";
  DROP TABLE IF EXISTS "world_rule_chapter_tasks";
  DROP TABLE IF EXISTS "world_rule_events";
  DROP TABLE IF EXISTS "world_rules";
  DROP TABLE IF EXISTS "world_settings";
  DROP TABLE IF EXISTS "world_system_profiles";
  DROP TABLE IF EXISTS "writing_quality_issues";
  DROP TABLE IF EXISTS "writing_quality_reports";
  DROP TABLE IF EXISTS "writing_revision_records";
  DROP TABLE IF EXISTS "_migrations";
`);
}

export default { up, down };
