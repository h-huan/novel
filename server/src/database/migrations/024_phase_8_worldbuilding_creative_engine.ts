import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
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
    );
    CREATE INDEX IF NOT EXISTS idx_world_system_profiles_project ON world_system_profiles(project_id);
  `);
}

export function down(db: DatabaseSync): void {
  db.exec(`DROP INDEX IF EXISTS idx_world_system_profiles_project; DROP TABLE IF EXISTS world_system_profiles;`);
}

export default { up, down };
